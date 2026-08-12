import Fastify, { type FastifyInstance } from 'fastify'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createDatabase, getState } from './db.js'

type BuildServerOptions = {
  databasePath?: string
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const databasePath = options.databasePath ?? resolve('.data/db.sqlite')
  const database = createDatabase(databasePath)
  const app = Fastify({ logger: false })

  app.addHook('onClose', () => {
    database.close()
  })

  app.get('/api/state', async () => getState(database))

  return app
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
