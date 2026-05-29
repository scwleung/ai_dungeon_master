import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode; onReset?: () => void }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReset = () => {
    this.props.onReset?.()
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '2rem', textAlign: 'center',
          background: 'var(--color-surface)', borderRadius: 8,
          border: '1px solid #e74c3c', margin: '1rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
          <h3 style={{ color: '#e74c3c', marginBottom: '0.5rem' }}>Something went wrong</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.4rem 1rem', background: 'var(--color-accent)',
              color: 'var(--color-bg)', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >Try Again</button>
        </div>
      )
    }
    return this.props.children
  }
}
