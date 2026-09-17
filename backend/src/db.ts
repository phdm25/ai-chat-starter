import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { configSchema } from '../../shared/contracts.js'
import type {
  StateSnapshot,
  Config,
  ConfigPatch,
  StoredMessage,
} from '../../shared/contracts.js'

export type { StateSnapshot, Config, ConfigPatch, StoredMessage }

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

function readConfigRow(database: DatabaseSync): { config: Config; revision: number } {
  const row = database.prepare(`
    SELECT config_json, revision
    FROM state
    WHERE id = 1
  `).get() as { config_json: string; revision: number } | undefined

  if (!row) {
    throw new Error('Application state is not initialized')
  }

  return {
    config: JSON.parse(row.config_json) as Config,
    revision: row.revision,
  }
}

export function getState(database: DatabaseSync): StateSnapshot {
  const { config, revision } = readConfigRow(database)

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
    config,
    revision,
    messages: messageRows.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    })),
  }
}

/**
 * Merges an already validated patch into the stored config, validates the
 * resulting full config, and persists it with the next revision. Throws
 * without touching the database if the merged config is invalid, so the
 * revision only ever moves on a successful config change.
 */
export function applyConfigPatch(
  database: DatabaseSync,
  patch: ConfigPatch,
): { config: Config; revision: number } {
  const current = readConfigRow(database)

  const config = configSchema.parse({
    title: patch.title ?? current.config.title,
    body: patch.body ?? current.config.body,
    buttonLabel: patch.buttonLabel ?? current.config.buttonLabel,
  })

  const changed =
    config.title !== current.config.title ||
    config.body !== current.config.body ||
    config.buttonLabel !== current.config.buttonLabel

  if (!changed) {
    return current
  }

  database.prepare(`
    UPDATE state
    SET config_json = ?, revision = revision + 1
    WHERE id = 1
  `).run(JSON.stringify(config))

  return { config, revision: current.revision + 1 }
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

/** The persisted config after a turn, and whether it actually changed. */
export type ConfigOutcome = { config: Config; changed: boolean }

export type ChatTurn = {
  userMessage: string
  /** The patch to apply, or `null` for a turn that only adds messages. */
  patch: ConfigPatch | null
  /**
   * Builds the assistant reply from the persisted config outcome, so a patch
   * that changes nothing can be confirmed honestly.
   */
  assistantMessage: (outcome: ConfigOutcome) => string
}

/**
 * Persists one successful chat turn in a single transaction: the user message,
 * the assistant message, and the config/revision change when a patch applies.
 * Any failure rolls the whole turn back, so partial writes are never
 * observable.
 */
export function persistChatTurn(database: DatabaseSync, turn: ChatTurn): StateSnapshot {
  database.exec('BEGIN IMMEDIATE')

  try {
    const before = readConfigRow(database)
    appendMessage(database, 'user', turn.userMessage)

    const after = turn.patch ? applyConfigPatch(database, turn.patch) : before
    const changed = after.revision !== before.revision

    appendMessage(database, 'assistant', turn.assistantMessage({ config: after.config, changed }))

    const state = getState(database)
    database.exec('COMMIT')
    return state
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
