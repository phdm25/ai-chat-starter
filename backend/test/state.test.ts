import { describe, expect, it } from 'vitest'

import {
  appendMessage,
  createDatabase,
  getState,
  initializeDatabase,
} from '../src/db.js'
import { buildServer } from '../src/server.js'

const starterState = {
  config: {
    title: 'Welcome',
    body: 'Discover what the app can do for you.',
    buttonLabel: 'Continue',
  },
  revision: 1,
  messages: [],
}

describe('prepared state backend', () => {
  it('creates the starter state once', () => {
    const database = createDatabase(':memory:')

    initializeDatabase(database)
    expect(getState(database)).toEqual(starterState)

    database.close()
  })

  it('returns the current state over HTTP', async () => {
    const app = buildServer({ databasePath: ':memory:' })

    const response = await app.inject({ method: 'GET', url: '/api/state' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(starterState)

    await app.close()
  })

  it('stores messages and returns them in order', () => {
    const database = createDatabase(':memory:')

    appendMessage(database, 'user', 'Change the button label to Submit.')
    appendMessage(database, 'assistant', 'The button label is updated.')

    expect(getState(database).messages).toEqual([
      expect.objectContaining({
        id: 1,
        role: 'user',
        content: 'Change the button label to Submit.',
        createdAt: expect.any(String),
      }),
      expect.objectContaining({
        id: 2,
        role: 'assistant',
        content: 'The button label is updated.',
        createdAt: expect.any(String),
      }),
    ])

    database.close()
  })
})
