import { describe, expect, it } from 'vitest'

import { applyConfigPatch, createDatabase, getState } from '../src/db.js'
import type { ConfigPatch } from '../src/db.js'

const starterConfig = {
  title: 'Welcome',
  body: 'Discover what the app can do for you.',
  buttonLabel: 'Continue',
}

describe('applyConfigPatch', () => {
  it('applies a single field and keeps the rest', () => {
    const database = createDatabase(':memory:')

    const result = applyConfigPatch(database, { buttonLabel: 'Submit' })

    expect(result).toEqual({
      config: { ...starterConfig, buttonLabel: 'Submit' },
      revision: 2,
    })
    expect(getState(database).config).toEqual(result.config)

    database.close()
  })

  it('applies several fields and increments the revision once per patch', () => {
    const database = createDatabase(':memory:')

    applyConfigPatch(database, { title: 'Hello' })
    const result = applyConfigPatch(database, { body: 'Shorter copy.', buttonLabel: 'Go' })

    expect(result).toEqual({
      config: { title: 'Hello', body: 'Shorter copy.', buttonLabel: 'Go' },
      revision: 3,
    })
    expect(getState(database).revision).toBe(3)

    database.close()
  })

  it('does not increment revision when the patch changes nothing', () => {
    const database = createDatabase(':memory:')

    const result = applyConfigPatch(database, { title: '  Welcome  ' })

    expect(result).toEqual({ config: starterConfig, revision: 1 })
    expect(getState(database).revision).toBe(1)

    database.close()
  })

  it('stores trimmed values', () => {
    const database = createDatabase(':memory:')

    const result = applyConfigPatch(database, { title: '  Spaced out  ' })

    expect(result.config.title).toBe('Spaced out')

    database.close()
  })

  it('leaves config and revision untouched when the merged config is invalid', () => {
    const database = createDatabase(':memory:')

    expect(() => applyConfigPatch(database, { title: '   ' } as ConfigPatch)).toThrow()

    expect(getState(database)).toMatchObject({ config: starterConfig, revision: 1 })

    database.close()
  })

  it('does not touch chat history', () => {
    const database = createDatabase(':memory:')

    applyConfigPatch(database, { title: 'Hello' })

    expect(getState(database).messages).toEqual([])

    database.close()
  })
})
