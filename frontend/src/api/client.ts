import type { ZodType } from 'zod'

import {
  chatResponseSchema,
  errorResponseSchema,
  stateSnapshotSchema,
} from '../../../shared/contracts.js'
import type { ChatResponse, StateSnapshot } from '../../../shared/contracts.js'

/**
 * The only place in the frontend that talks HTTP. React components import the
 * two functions below and never see fetch, status codes, or raw JSON. Every
 * response is validated against the shared Zod contracts, so a component can
 * trust the shape of whatever it receives.
 */

/** A request that failed: transport, HTTP status, or an off-contract body. */
export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
  }
}

/** Reads the message out of a thrown value for display in the UI. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export async function fetchState(): Promise<StateSnapshot> {
  return request('/api/state', stateSnapshotSchema)
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  return request('/api/chat', chatResponseSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, init)
  } catch (cause) {
    throw new ApiError('Cannot reach the server', { cause })
  }

  const payload = await readJson(response)

  if (!response.ok) {
    throw new ApiError(serverErrorMessage(payload, response.status))
  }

  const parsed = schema.safeParse(payload)

  if (!parsed.success) {
    throw new ApiError('The server returned an unexpected response')
  }

  return parsed.data
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function serverErrorMessage(payload: unknown, status: number): string {
  const parsed = errorResponseSchema.safeParse(payload)

  return parsed.success ? parsed.data.error : `Request failed (HTTP ${status})`
}
