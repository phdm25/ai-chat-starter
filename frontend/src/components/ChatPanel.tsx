import { useState } from 'react'

import type { StoredMessage, ToolActivity } from '../../../shared/contracts.js'

type ChatPanelProps = {
  /** Persisted history as returned by the server; the only authoritative log. */
  messages: StoredMessage[]
  /** The message currently being sent, shown as transient pending UI. */
  pendingMessage: string | null
  /** Tool activity from the last chat response, if the turn changed the config. */
  toolActivity: ToolActivity | null
  error: string | null
  /** Resolves to `true` when the turn succeeded, which clears the input. */
  onSubmit: (message: string) => Promise<boolean>
}

export function ChatPanel({
  messages,
  pendingMessage,
  toolActivity,
  error,
  onSubmit,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')

  const isBusy = pendingMessage !== null
  const canSend = !isBusy && draft.trim().length > 0

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!canSend) {
      return
    }

    const sent = await onSubmit(draft.trim())

    if (sent) {
      setDraft('')
    }
  }

  return (
    <section className="panel chat">
      <h2 className="panel-title">Chat</h2>

      <div className="chat-log">
        {messages.length === 0 && !isBusy ? (
          <p className="chat-empty">
            Ask the assistant to change the card title, body, or button label.
          </p>
        ) : null}

        {messages.map((message) => (
          <Bubble key={message.id} role={message.role} content={message.content} />
        ))}

        {pendingMessage === null ? null : (
          <Bubble role="user" content={pendingMessage} isPending />
        )}

        {isBusy ? <p className="chat-note">Assistant is thinking…</p> : null}

        {toolActivity === null ? null : (
          <p className="chat-note tool-activity">✓ Configuration request processed</p>
        )}

        {error === null ? null : (
          <p className="chat-note chat-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          className="composer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Change the button to Submit"
          disabled={isBusy}
          aria-label="Message"
        />
        <button className="composer-send" type="submit" disabled={!canSend}>
          {isBusy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}

type BubbleProps = {
  role: StoredMessage['role']
  content: string
  isPending?: boolean
}

function Bubble({ role, content, isPending = false }: BubbleProps) {
  const className = ['bubble', role, isPending ? 'pending' : ''].join(' ').trim()

  return (
    <article className={className}>
      <span className="bubble-role">{role === 'user' ? 'User' : 'Assistant'}</span>
      <p className="bubble-content">{content}</p>
    </article>
  )
}
