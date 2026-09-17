import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'

import { parseChatResult } from '../src/chat-service.js'

function textBlock(text: string): Anthropic.ContentBlock {
  return { type: 'text', text, citations: null } as Anthropic.TextBlock
}

function toolUseBlock(input: unknown, name = 'update_config'): Anthropic.ContentBlock {
  return { type: 'tool_use', id: 'toolu_test', name, input } as Anthropic.ToolUseBlock
}

function assistantMessage(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.Message['stop_reason'] = 'end_turn',
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 } as Anthropic.Usage,
  } as Anthropic.Message
}

describe('parseChatResult', () => {
  it('returns assistant text when no tool was called', () => {
    const result = parseChatResult(assistantMessage([textBlock('The card says Welcome.')]))

    expect(result).toEqual({ kind: 'text', text: 'The card says Welcome.' })
  })

  it('joins multiple text blocks and ignores empty ones', () => {
    const result = parseChatResult(
      assistantMessage([textBlock('First part.'), textBlock('   '), textBlock('Second part.')]),
    )

    expect(result).toEqual({ kind: 'text', text: 'First part.\n\nSecond part.' })
  })

  it('returns an update intent with the validated patch', () => {
    const result = parseChatResult(
      assistantMessage([
        textBlock('Updated the button label.'),
        toolUseBlock({ buttonLabel: 'Submit' }),
      ]),
    )

    expect(result).toEqual({
      kind: 'update_config',
      patch: { buttonLabel: 'Submit' },
    })
  })

  it('accepts an update intent without accompanying text', () => {
    const result = parseChatResult(assistantMessage([toolUseBlock({ title: 'Hello' })]))

    expect(result).toEqual({ kind: 'update_config', patch: { title: 'Hello' } })
  })

  it('trims valid patch values', () => {
    const result = parseChatResult(
      assistantMessage([toolUseBlock({ title: '  Hello  ' })]),
    )

    expect(result).toEqual({ kind: 'update_config', patch: { title: 'Hello' } })
  })

  it('rejects unknown patch fields', () => {
    expect(() =>
      parseChatResult(assistantMessage([toolUseBlock({ title: 'Hello', revision: 7, color: 'red' })])),
    ).toThrow(/invalid config patch/)
  })

  it('rejects an unknown tool', () => {
    expect(() =>
      parseChatResult(assistantMessage([toolUseBlock({ title: 'Hello' }, 'other_tool')])),
    ).toThrow(/unknown tool/)
  })

  it('rejects multiple tool calls', () => {
    expect(() =>
      parseChatResult(assistantMessage([toolUseBlock({ title: 'Hello' }), toolUseBlock({ buttonLabel: 'Go' })])),
    ).toThrow(/multiple tool calls/)
  })

  it('rejects a patch that changes nothing', () => {
    expect(() => parseChatResult(assistantMessage([toolUseBlock({})]))).toThrow(
      /invalid config patch/,
    )
  })

  it('rejects a patch with a blank or non-string value', () => {
    expect(() => parseChatResult(assistantMessage([toolUseBlock({ title: '   ' })]))).toThrow(
      /invalid config patch/,
    )
    expect(() => parseChatResult(assistantMessage([toolUseBlock({ title: 42 })]))).toThrow(
      /invalid config patch/,
    )
  })

  it('rejects a response with no usable content', () => {
    expect(() => parseChatResult(assistantMessage([]))).toThrow(/no usable content/)
  })

  it('rejects a refused response', () => {
    expect(() =>
      parseChatResult(assistantMessage([textBlock('Sorry.')], 'refusal')),
    ).toThrow(/declined/)
  })

  it('rejects a truncated response', () => {
    expect(() =>
      parseChatResult(assistantMessage([toolUseBlock({ title: 'Hel' })], 'max_tokens')),
    ).toThrow(/truncated/)
  })
})
