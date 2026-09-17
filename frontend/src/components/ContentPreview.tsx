import type { Config } from '../../../shared/contracts.js'

type ContentPreviewProps = {
  /** Server-confirmed config only: never a locally proposed value. */
  config: Config
  revision: number
}

export function ContentPreview({ config, revision }: ContentPreviewProps) {
  return (
    <section className="panel preview">
      <h2 className="panel-title">
        Current content <span className="revision">revision {revision}</span>
      </h2>

      <div className="card">
        <h3 className="card-title">{config.title}</h3>
        <p className="card-body">{config.body}</p>
        <button className="card-button" type="button" disabled>
          {config.buttonLabel}
        </button>
      </div>
    </section>
  )
}
