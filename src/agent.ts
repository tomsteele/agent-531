import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { trainingTools } from "./tools/tools";

const systemPrompt = readFileSync(join(import.meta.dir, "../docs/system-prompt.md"), "utf-8");

export interface AgentResponse {
	text: string;
}

// Parse MODEL env as "provider:model" (e.g. "anthropic:claude-sonnet-4-20250514", "google:gemini-2.5-flash").
// Defaults to anthropic:claude-sonnet-4-20250514.
function getConfiguredModel() {
	const modelStr = process.env.MODEL ?? "anthropic:claude-sonnet-4-20250514";
	const colonIdx = modelStr.indexOf(":");
	if (colonIdx === -1) {
		// Bare model name — assume anthropic for backwards compat.
		return getModel("anthropic" as never, modelStr as never);
	}
	const provider = modelStr.slice(0, colonIdx);
	const modelId = modelStr.slice(colonIdx + 1);
	return getModel(provider as never, modelId as never);
}

// Persistent agent instance — holds conversation history in memory across messages.
let agent: Agent | null = null;

function getOrCreateAgent(): Agent {
	if (!agent) {
		agent = new Agent({
			initialState: {
				systemPrompt,
				model: getConfiguredModel(),
				tools: trainingTools,
			},
		});
	}
	return agent;
}

export function clearSession(): void {
	if (agent) {
		agent.clearMessages();
	}
}

export async function runAgent(userMessage: string): Promise<AgentResponse> {
	const a = getOrCreateAgent();

	let resultText = "";

	const unsubscribe = a.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			console.log(`[agent] tool call: ${event.toolName}`, JSON.stringify(event.args));
		}
	});

	try {
		await a.prompt(userMessage);
		await a.waitForIdle();

		// Extract the last assistant message text.
		const messages = a.state.messages;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "assistant" && msg.content) {
				if (typeof msg.content === "string") {
					resultText = msg.content;
				} else if (Array.isArray(msg.content)) {
					resultText = msg.content
						.filter((b: { type: string }) => b.type === "text")
						.map((b: { type: string; text?: string }) => b.text ?? "")
						.join("");
				}
				break;
			}
		}
	} catch (err) {
		console.error("[agent] query error:", err);
		resultText = "Something went wrong processing your message.";
	} finally {
		unsubscribe();
	}

	return { text: resultText };
}
