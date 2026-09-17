import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { StateSnapshot, Config, StoredMessage } from '../../shared/contracts.js'

export type { StateSnapshot, Config, StoredMessage }

const starterConfig: Config = {
  title: 'Welcome',
  body: 'Discover what the app can do for you.',
  buttonLabel: 'Continue',
}

export function createDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const database = new DatabaseSync(path)
  initializeDatabase(database)
  return database
}

export function initializeDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.prepare(`
    INSERT OR IGNORE INTO state (id, config_json, revision)
    VALUES (1, ?, 1)
  `).run(JSON.stringify(starterConfig))
}

export function getState(database: DatabaseSync): StateSnapshot {
  const row = database.prepare(`
    SELECT config_json, revision
    FROM state
    WHERE id = 1
  `).get() as { config_json: string; revision: number } | undefined

  if (!row) {
    throw new Error('Application state is not initialized')
  }

  const messageRows = database.prepare(`
    SELECT id, role, content, created_at
    FROM messages
    ORDER BY id
  `).all() as Array<{
    id: number
    role: StoredMessage['role']
    content: string
    created_at: string
  }>

  return {
    config: JSON.parse(row.config_json) as Config,
    revision: row.revision,
    messages: messageRows.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    })),
  }
}

export function appendMessage(
  database: DatabaseSync,
  role: StoredMessage['role'],
  content: string,
): void {
  database.prepare(`
    INSERT INTO messages (role, content)
    VALUES (?, ?)
  `).run(role, content)
}
