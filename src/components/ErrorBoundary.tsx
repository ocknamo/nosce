import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page">
        <section className="card setup">
          <h1>表示できませんでした</h1>
          <p className="muted">データは残っています。ページを読み込み直してください。</p>
          <button className="primary" onClick={() => location.reload()}>
            読み込み直す
          </button>
        </section>
      </main>
    )
  }
}
