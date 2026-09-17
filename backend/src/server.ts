import Fastify, { type FastifyInstance } from 'fastify'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { chatRequestSchema } from '../../shared/contracts.js'
import type { StateSnapshot, ToolActivity } from '../../shared/contracts.js'
import { createAnthropicClient, requestChatTurn, type ChatResult } from './chat-service.js'
import { createDatabase, getState, persistChatTurn } from './db.js'

/** The chat service as the endpoint uses it; faked in tests. */
export type RequestTurn = (state: StateSnapshot, userMessage: string) => Promise<ChatResult>

type BuildServerOptions = {
  databasePath?: string
  requestTurn?: RequestTurn
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const databasePath = options.databasePath ?? resolve('.data/db.sqlite')
  const database = createDatabase(databasePath)
  const requestTurn = options.requestTurn ?? anthropicRequestTurn()
  const app = Fastify({ logger: false })

  app.addHook('onClose', () => {
    database.close()
  })

  app.get('/api/state', async () => getState(database))

  app.post('/api/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Message must not be empty' })
    }

    const userMessage = parsed.data.message

    let state: StateSnapshot
    try {
      state = getState(database)
    } catch {
      return reply.code(500).send({ error: 'The current state could not be loaded' })
    }

    let result: ChatResult
    try {
      result = await requestTurn(state, userMessage)
    } catch {
      // Anthropic failed or returned something unusable: nothing is persisted.
      return reply.code(502).send({ error: 'The assistant is currently unavailable' })
    }

    try {
      if (result.kind === 'text') {
        const { text } = result
        const state = persistChatTurn(database, {
          userMessage,
          patch: null,
          assistantMessage: () => text,
        })

        return { state, toolActivity: null } satisfies ChatHttpResponse
      }

      const state = persistChatTurn(database, {
        userMessage,
        patch: result.patch,
        assistantMessage: confirmConfigUpdate,
      })

      return {
        state,
        toolActivity: { type: 'config_update', status: 'success' },
      } satisfies ChatHttpResponse
    } catch {
      // The turn was rolled back as a whole; config and history are unchanged.
      return reply.code(500).send({ error: 'The chat turn could not be saved' })
    }
  })

  return app
}

type ChatHttpResponse = { state: StateSnapshot; toolActivity: ToolActivity | null }

/** The short assistant reply the backend persists for a config tool call. */
function confirmConfigUpdate({ changed }: { changed: boolean }): string {
  return changed ? 'Configuration updated.' : 'The configuration is already up to date.'
}

function anthropicRequestTurn(): RequestTurn {
  const client = createAnthropicClient()
  return (state, userMessage) => requestChatTurn(client, state, userMessage)
}

async function start(): Promise<void> {
  const app = buildServer()
  await app.listen({ host: '127.0.0.1', port: 3001 })
  process.stdout.write('Config backend: http://127.0.0.1:3001\n')
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) {
  await start()
}
