import { useEffect, useState } from 'react'

import { apiErrorMessage, fetchState, sendChatMessage } from './api/client.js'
import { ChatPanel } from './components/ChatPanel.js'
import { ContentPreview } from './components/ContentPreview.js'
import type { StateSnapshot, ToolActivity } from '../../shared/contracts.js'

/**
 * Holds the authoritative server snapshot plus the transient interaction state
 * around it. The snapshot is only ever replaced wholesale by a server response,
 * so the preview can never show a config the server has not saved.
 */
export function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null)

  useEffect(() => {
    let active = true

    fetchState()
      .then((loaded) => {
        if (active) {
          setSnapshot(loaded)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(apiErrorMessage(error))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(message: string): Promise<boolean> {
    // One request in flight at a time; the composer is disabled while sending,
    // and this guard covers anything that slips past it.
    if (pendingMessage !== null) {
      return false
    }

    setPendingMessage(message)
    setChatError(null)
    setToolActivity(null)

    try {
      const response = await sendChatMessage(message)
      setSnapshot(response.state)
      setToolActivity(response.toolActivity)
      return true
    } catch (error: unknown) {
      setChatError(apiErrorMessage(error))
      return false
    } finally {
      setPendingMessage(null)
    }
  }

  if (isLoading) {
    return <main className="layout status">Loading…</main>
  }

  if (snapshot === null) {
    return (
      <main className="layout status" role="alert">
        Could not load the current state: {loadError ?? 'unknown error'}
      </main>
    )
  }

  return (
    <main className="layout">
      <ChatPanel
        messages={snapshot.messages}
        pendingMessage={pendingMessage}
        toolActivity={toolActivity}
        error={chatError}
        onSubmit={handleSubmit}
      />
      <ContentPreview config={snapshot.config} revision={snapshot.revision} />
    </main>
  )
}
