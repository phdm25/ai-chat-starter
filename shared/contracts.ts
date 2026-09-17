import { z } from 'zod'

/**
 * Single source of truth for the HTTP contract between backend and frontend.
 * Both sides import the schemas from here: the backend validates incoming
 * requests and model tool calls, the frontend validates responses.
 */

const nonEmptyStringSchema = z.string().trim().min(1)

const titleSchema = nonEmptyStringSchema
const bodySchema = nonEmptyStringSchema
const buttonLabelSchema = nonEmptyStringSchema

/** The server-owned configuration rendered by the content card. */
export const configSchema = z.object({
  title: titleSchema,
  body: bodySchema,
  buttonLabel: buttonLabelSchema,
})

export type Config = z.infer<typeof configSchema>

export const configFields = ['title', 'body', 'buttonLabel'] as const
export type ConfigField = (typeof configFields)[number]

/** A partial update to the config. At least one field must be present. */
export const configPatchSchema = z
  .object({
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    buttonLabel: buttonLabelSchema.optional(),
  })
  .refine(
    (patch) => configFields.some((field) => patch[field] !== undefined),
    { message: 'Provide at least one of: title, body, buttonLabel' },
  )

export type ConfigPatch = z.infer<typeof configPatchSchema>

export const messageRoleSchema = z.enum(['user', 'assistant'])
export type MessageRole = z.infer<typeof messageRoleSchema>

/** A chat message as persisted by the backend. */
export const storedMessageSchema = z.object({
  id: z.number().int().positive(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.string(),
})

export type StoredMessage = z.infer<typeof storedMessageSchema>

/** Everything the client needs to render: config, its revision, and history. */
export const stateSnapshotSchema = z.object({
  config: configSchema,
  revision: z.number().int().positive(),
  messages: z.array(storedMessageSchema),
})

export type StateSnapshot = z.infer<typeof stateSnapshotSchema>

/** Minimal UI metadata for a successfully executed config update. */
export const toolActivitySchema = z.object({
  type: z.literal('config_update'),
  status: z.literal('success'),
})

export type ToolActivity = z.infer<typeof toolActivitySchema>

/** `POST /api/chat` body. */
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message must not be empty'),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

/**
 * `POST /api/chat` response. The full post-turn state is returned so the
 * client renders only what the server accepted and saved.
 */
export const chatResponseSchema = z.object({
  state: stateSnapshotSchema,
  toolActivity: toolActivitySchema.nullable(),
})

export type ChatResponse = z.infer<typeof chatResponseSchema>

/** Body of any non-2xx JSON response. */
export const errorResponseSchema = z.object({
  error: z.string(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
