import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { trainingServer } from './tools/mcp-server';

const systemPrompt = readFileSync(join(import.meta.dir, '../docs/system-prompt.md'), 'utf-8');

export interface AgentResponse {
  text: string;
  sessionId: string | undefined;
}

export async function runAgent(userMessage: string, sessionId?: string): Promise<AgentResponse> {
  let resultText = '';
  let resultSessionId: string | undefined = sessionId;

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt,
      model: process.env.MODEL ?? 'claude-sonnet-4-20250514',
      mcpServers: { training: trainingServer },
      allowedTools: ['mcp__training__*'],
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('name' in block) {
          console.log(`[agent] tool call: ${block.name}`, JSON.stringify('input' in block ? block.input : ''));
        }
      }
    } else if (message.type === 'result') {
      resultSessionId = message.session_id;
      if (message.subtype === 'success') {
        resultText = message.result ?? '';
        console.log(`[agent] usage: ${message.num_turns} turns, ${message.total_cost_usd?.toFixed(4)} USD, ${message.duration_ms}ms`, JSON.stringify(message.usage));
      } else {
        console.error('[agent] query error:', message.subtype, 'errors' in message ? message.errors : '');
        resultText = 'Something went wrong processing your message.';
      }
    }
  }

  return { text: resultText, sessionId: resultSessionId };
}
