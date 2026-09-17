import Anthropic from '@anthropic-ai/sdk'

import { configPatchSchema } from '../../shared/contracts.js'
import type { Config, ConfigPatch, StateSnapshot } from '../../shared/contracts.js'

/**
 * Owns the whole Anthropic interaction: it receives the current state plus the
 * user message and returns either assistant text or an intent to update the
 * config. It never touches SQLite or HTTP, and never logs the API key.
 */

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 16000

const UPDATE_CONFIG_TOOL_NAME = 'update_config'

const updateConfigTool: Anthropic.Tool = {
  name: UPDATE_CONFIG_TOOL_NAME,
  description:
    'Change the content card shown next to the chat. Pass only the fields that should change; omitted fields keep their current value.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'New card heading.' },
      body: { type: 'string', description: 'New card body text.' },
      buttonLabel: { type: 'string', description: 'New card button label.' },
    },
    additionalProperties: false,
  },
}

/** What the backend should do with the model's answer. */
export type ChatResult =
  | { kind: 'text'; text: string }
  | { kind: 'update_config'; patch: ConfigPatch }

export function createAnthropicClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment; the key stays server-side.
  return new Anthropic({ maxRetries: 0 })
}

export async function requestChatTurn(
  client: Anthropic,
  state: StateSnapshot,
  userMessage: string,
): Promise<ChatResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(state.config),
    tools: [updateConfigTool],
    messages: [
      ...state.messages.map((message): Anthropic.MessageParam => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: userMessage },
    ],
  })

  return parseChatResult(response)
}

/**
 * Turns one Anthropic response into a `ChatResult`. Anything the backend
 * cannot act on — a refusal, a truncated answer, an unusable patch — throws,
 * so the caller leaves config, revision, and history untouched.
 */
export function parseChatResult(response: Anthropic.Message): ChatResult {
  if (response.stop_reason === 'refusal') {
    throw new Error('The assistant declined to answer')
  }

  if (response.stop_reason === 'max_tokens') {
    throw new Error('The assistant response was truncated')
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text.trim())
    .filter((blockText) => blockText.length > 0)
    .join('\n\n')

  const toolUses = response.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  if (toolUses.length > 1) {
    throw new Error('The assistant returned multiple tool calls')
  }

  const toolUse = toolUses[0]

  if (!toolUse) {
    if (!text) {
      throw new Error('The assistant returned no usable content')
    }

    return { kind: 'text', text }
  }

  if (toolUse.name !== UPDATE_CONFIG_TOOL_NAME) {
    throw new Error(`The assistant returned an unknown tool: ${toolUse.name}`)
  }

  const patch = configPatchSchema.safeParse(toolUse.input)

  if (!patch.success) {
    throw new Error(`The assistant proposed an invalid config patch: ${patch.error.message}`)
  }

  return { kind: 'update_config', patch: patch.data }
}

function buildSystemPrompt(config: Config): string {
  return [
    'You are the assistant of a small app where the user can change one content card by chatting.',
    'The card has three text fields: title, body, and buttonLabel.',
    `The card currently shows: ${JSON.stringify(config)}`,
    `When the user asks to change the card, call the ${UPDATE_CONFIG_TOOL_NAME} tool with only the fields that change.`,
    'Never invent values for fields the user did not ask you to change.',
    'For anything else, answer normally without calling the tool.',
  ].join('\n')
}
