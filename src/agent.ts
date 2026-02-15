import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toolDefinitions } from './tools/definitions';
import { handleToolCall } from './tools/handlers';
import type { AgentResponse, ToolCallResult } from './types';

const client = new Anthropic();

const systemPrompt = readFileSync(join(import.meta.dir, '../docs/system-prompt.md'), 'utf-8');

type Message = Anthropic.MessageParam;

export async function runAgent(userMessage: string, conversationHistory: Message[]): Promise<AgentResponse> {
  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });

  const messages = [...conversationHistory];
  const allToolCalls: ToolCallResult[] = [];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    // Collect text and tool use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    // If no tool calls, return the text response with tool metadata
    if (toolUseBlocks.length === 0) {
      const text = textBlocks.map(b => b.text).join('\n');
      conversationHistory.push({ role: 'assistant', content: response.content });
      return { text, toolCalls: allToolCalls };
    }

    // Process tool calls
    conversationHistory.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`[agent] tool call: ${toolUse.name}`, JSON.stringify(toolUse.input));
      try {
        const result = handleToolCall(toolUse.name, toolUse.input as Record<string, unknown>);
        console.log(`[agent] tool result:`, JSON.stringify(result));
        allToolCalls.push({
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          result,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        console.error(`[agent] tool error:`, err);
        allToolCalls.push({
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          result: { error: String(err) },
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: String(err) }),
          is_error: true,
        });
      }
    }

    conversationHistory.push({ role: 'user', content: toolResults });
    messages.push({ role: 'user', content: toolResults });
  }
}
