import { Client, GatewayIntentBits, Partials, type DMChannel, type Message as DiscordMessage } from 'discord.js';
import { runAgent } from './agent';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentResponse } from './types';

const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID!;

type Message = Anthropic.MessageParam;

// Conversation history (in-memory, resets on restart).
// Keep last 50 message pairs to avoid unbounded growth / context limit.
const MAX_HISTORY = 100; // ~50 exchanges (user + assistant)
const conversationHistory: Message[] = [];

function trimHistory(): void {
  while (conversationHistory.length > MAX_HISTORY) {
    conversationHistory.shift();
  }
  // Ensure history starts with a user message (API requirement)
  while (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
    conversationHistory.shift();
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
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
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > 2000) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

async function sendResponse(channel: DMChannel, response: AgentResponse): Promise<void> {
  if (response.text.trim()) {
    await sendToChannel(channel, response.text);
  }
}

client.once('clientReady', () => {
  console.log(`[discord] Logged in as ${client.user?.tag}`);
});

client.on('messageCreate', (message: DiscordMessage) => {
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
      trimHistory();
      const response = await runAgent(message.content, conversationHistory);
      await sendResponse(channel, response);
    } catch (err) {
      console.error('[discord] Error handling message:', err);
      await channel.send('Something went wrong. Check the logs.');
    }
  });
});

export async function startDiscord(): Promise<void> {
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

export async function sendDM(response: AgentResponse): Promise<void> {
  if (!dmChannel) {
    // Try to fetch the DM channel
    try {
      const user = await client.users.fetch(ALLOWED_USER_ID);
      dmChannel = await user.createDM();
    } catch (err) {
      console.error('[discord] Could not open DM channel:', err);
      return;
    }
  }

  await sendResponse(dmChannel, response);
}

export { conversationHistory };
