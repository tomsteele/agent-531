import {
	Client,
	type Message as DiscordMessage,
	type DMChannel,
	GatewayIntentBits,
	Partials,
} from "discord.js";
import { clearSession as clearAgentSession, runAgent } from "./agent";

const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID ?? "";

export function clearSession(): void {
	clearAgentSession();
}

const client = new Client({
	intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
	partials: [Partials.Channel, Partials.Message],
});

// Store DM channel for scheduler to use.
let dmChannel: DMChannel | null = null;

// Serialize message processing to prevent interleaved mutations.
let processingLock = Promise.resolve();

// --- Message sending ---

async function sendToChannel(channel: DMChannel, text: string): Promise<void> {
	if (!text.trim()) return;
	if (text.length <= 2000) {
		await channel.send(text);
		return;
	}
	const chunks: string[] = [];
	let current = "";
	for (const line of text.split("\n")) {
		if (current.length + line.length + 1 > 2000) {
			chunks.push(current);
			current = line;
		} else {
			current += (current ? "\n" : "") + line;
		}
	}
	if (current) chunks.push(current);
	for (const chunk of chunks) {
		await channel.send(chunk);
	}
}

client.once("clientReady", () => {
	console.log(`[discord] Logged in as ${client.user?.tag}`);
});

client.on("messageCreate", (message: DiscordMessage) => {
	// Ignore own messages
	if (message.author.id === client.user?.id) return;

	// Only respond to allowed user
	if (message.author.id !== ALLOWED_USER_ID) return;

	// Only respond to DMs
	if (!message.channel.isDMBased()) return;

	// Cache DM channel for scheduler
	const channel = message.channel as DMChannel;
	dmChannel = channel;

	// Serialize processing to prevent interleaved conversation mutations.
	processingLock = processingLock.then(async () => {
		try {
			await channel.sendTyping();
			const response = await runAgent(message.content);
			if (response.text.trim()) {
				await sendToChannel(channel, response.text);
			}
		} catch (err) {
			console.error("[discord] Error handling message:", err);
			await channel.send("Something went wrong. Check the logs.");
		}
	});
});

export async function startDiscord(): Promise<void> {
	await client.login(process.env.DISCORD_BOT_TOKEN);
}

export async function sendDM(text: string): Promise<void> {
	if (!dmChannel) {
		// Try to fetch the DM channel
		try {
			const user = await client.users.fetch(ALLOWED_USER_ID);
			dmChannel = await user.createDM();
		} catch (err) {
			console.error("[discord] Could not open DM channel:", err);
			return;
		}
	}

	await sendToChannel(dmChannel, text);
}
