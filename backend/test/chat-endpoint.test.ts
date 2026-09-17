import { describe, expect, it } from 'vitest'

import type { ChatResult } from '../src/chat-service.js'
import { buildServer, type RequestTurn } from '../src/server.js'
import type { ChatResponse, StateSnapshot } from '../../shared/contracts.js'

const starterConfig = {
  title: 'Welcome',
  body: 'Discover what the app can do for you.',
  buttonLabel: 'Continue',
}

/** A fake chat service: never touches the network, records what it received. */
function fakeChat(...results: Array<ChatResult | Error>): {
  requestTurn: RequestTurn
  calls: Array<{ state: StateSnapshot; userMessage: string }>
} {
  const queue = [...results]
  const calls: Array<{ state: StateSnapshot; userMessage: string }> = []

  return {
    calls,
    requestTurn: async (state, userMessage) => {
      calls.push({ state, userMessage })
      const next = queue.shift()

      if (!next) {
        throw new Error('The fake chat service ran out of results')
      }

      if (next instanceof Error) {
        throw next
      }

      return next
    },
  }
}

function buildTestServer(...results: Array<ChatResult | Error>) {
  const chat = fakeChat(...results)
  const app = buildServer({ databasePath: ':memory:', requestTurn: chat.requestTurn })

  return { app, calls: chat.calls }
}

async function postChat(
  app: ReturnType<typeof buildServer>,
  body: { message: string },
): Promise<{ statusCode: number; body: ChatResponse }> {
  const response = await app.inject({ method: 'POST', url: '/api/chat', payload: body })

  return { statusCode: response.statusCode, body: response.json() as ChatResponse }
}

async function getStateOverHttp(app: ReturnType<typeof buildServer>): Promise<StateSnapshot> {
  const response = await app.inject({ method: 'GET', url: '/api/state' })

  return response.json() as StateSnapshot
}

describe('POST /api/chat', () => {
  it('persists a text turn and leaves config and revision unchanged', async () => {
    const { app, calls } = buildTestServer({ kind: 'text', text: 'The card says Welcome.' })

    const { statusCode, body } = await postChat(app, { message: 'What does the card say?' })

    expect(statusCode).toBe(200)
    expect(body.toolActivity).toBeNull()
    expect(body.state.config).toEqual(starterConfig)
    expect(body.state.revision).toBe(1)
    expect(body.state.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'What does the card say?' },
      { role: 'assistant', content: 'The card says Welcome.' },
    ])
    expect(calls).toEqual([
      {
        userMessage: 'What does the card say?',
        state: { config: starterConfig, revision: 1, messages: [] },
      },
    ])
    expect(await getStateOverHttp(app)).toEqual(body.state)

    await app.close()
  })

  it('applies a config patch, bumps the revision, and confirms it', async () => {
    const { app } = buildTestServer({ kind: 'update_config', patch: { buttonLabel: 'Submit' } })

    const { statusCode, body } = await postChat(app, {
      message: 'Change the button label to Submit.',
    })

    expect(statusCode).toBe(200)
    expect(body.toolActivity).toEqual({ type: 'config_update', status: 'success' })
    expect(body.state.config).toEqual({ ...starterConfig, buttonLabel: 'Submit' })
    expect(body.state.revision).toBe(2)
    expect(body.state.messages).toHaveLength(2)
    expect(body.state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Configuration updated.',
    })
    expect(await getStateOverHttp(app)).toEqual(body.state)

    await app.close()
  })

  it('confirms a patch that changes nothing without bumping the revision', async () => {
    const { app } = buildTestServer({ kind: 'update_config', patch: { title: 'Welcome' } })

    const { statusCode, body } = await postChat(app, { message: 'Set the title to Welcome.' })

    expect(statusCode).toBe(200)
    expect(body.toolActivity).toEqual({ type: 'config_update', status: 'success' })
    expect(body.state.config).toEqual(starterConfig)
    expect(body.state.revision).toBe(1)
    expect(body.state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'The configuration is already up to date.',
    })

    await app.close()
  })

  it('sends the persisted history to the chat service and keeps turns ordered', async () => {
    const { app, calls } = buildTestServer(
      { kind: 'update_config', patch: { title: 'Hello' } },
      { kind: 'text', text: 'It says Hello.' },
    )

    await postChat(app, { message: 'Set the title to Hello.' })
    const { body } = await postChat(app, { message: 'What is the title now?' })

    expect(calls[1]?.state.config).toEqual({ ...starterConfig, title: 'Hello' })
    expect(calls[1]?.state.revision).toBe(2)
    expect(calls[1]?.state.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(body.state.messages.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: 1, role: 'user' },
      { id: 2, role: 'assistant' },
      { id: 3, role: 'user' },
      { id: 4, role: 'assistant' },
    ])

    await app.close()
  })

  it('rejects an invalid request without calling the chat service', async () => {
    const { app, calls } = buildTestServer({ kind: 'text', text: 'unused' })

    for (const payload of [{ message: '   ' }, { message: 42 }, {}]) {
      const response = await app.inject({ method: 'POST', url: '/api/chat', payload })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'Message must not be empty' })
    }

    expect(calls).toEqual([])
    expect(await getStateOverHttp(app)).toEqual({
      config: starterConfig,
      revision: 1,
      messages: [],
    })

    await app.close()
  })

  it('returns an error and persists nothing when the chat service fails', async () => {
    const { app } = buildTestServer(new Error('Anthropic is unreachable'))

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Change the title.' },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({ error: 'The assistant is currently unavailable' })
    expect(await getStateOverHttp(app)).toEqual({
      config: starterConfig,
      revision: 1,
      messages: [],
    })

    await app.close()
  })

  it('rolls the whole turn back when persistence fails', async () => {
    // A patch that the full-config validation rejects reaches persistence only
    // if the chat service lets it through; the user message must not survive.
    const { app } = buildTestServer({
      kind: 'update_config',
      patch: { title: '   ' } as { title: string },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Clear the title.' },
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'The chat turn could not be saved' })
    expect(await getStateOverHttp(app)).toEqual({
      config: starterConfig,
      revision: 1,
      messages: [],
    })

    await app.close()
  })

  it('keeps serving requests after a failed turn', async () => {
    const { app } = buildTestServer(
      new Error('Anthropic is unreachable'),
      { kind: 'text', text: 'Back online.' },
    )

    await postChat(app, { message: 'First try.' })
    const { statusCode, body } = await postChat(app, { message: 'Second try.' })

    expect(statusCode).toBe(200)
    expect(body.state.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'Second try.' },
      { role: 'assistant', content: 'Back online.' },
    ])

    await app.close()
  })
})
