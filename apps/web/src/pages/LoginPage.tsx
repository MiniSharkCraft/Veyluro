import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuthStore()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* ASCII art header */}
        <pre className="text-neon-cyan text-xs mb-8 text-center select-none leading-tight">
{`███╗   ███╗███████╗███████╗███████╗
████╗ ████║██╔════╝██╔════╝██╔════╝
██╔████╔██║█████╗  ███████╗███████╗
██║╚██╔╝██║██╔══╝  ╚════██║╚════██║
██║ ╚═╝ ██║███████╗███████║███████║
╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝`}
        </pre>
        <p className="text-center text-neon-magenta text-xs mb-6 tracking-widest">
          [ ZERO-KNOWLEDGE E2EE MESSENGER ]
        </p>

        <div className="cyber-panel p-6">
          <div className="flex mb-6 gap-2">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-xs uppercase tracking-widest border rounded-cyber transition-all ${
                  mode === m
                    ? 'border-neon-cyan bg-neon-cyan text-dark-900 font-bold'
                    : 'border-dark-400 text-dark-400 hover:border-neon-cyan hover:text-neon-cyan'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs text-neon-cyan mb-1 tracking-wider">USERNAME</label>
              <input
                className="cyber-input w-full"
                placeholder="ghost_user"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-neon-cyan mb-1 tracking-wider">PASSWORD</label>
              <input
                type="password"
                className="cyber-input w-full"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs border border-red-900 bg-red-950/30 rounded-cyber px-3 py-2">
                ⚠ {error}
              </p>
            )}

            <button type="submit" className="cyber-btn w-full" disabled={loading}>
              {loading ? 'PROCESSING...' : mode === 'login' ? 'AUTHENTICATE' : 'CREATE IDENTITY'}
            </button>
          </form>

          {mode === 'register' && (
            <p className="mt-4 text-xs text-dark-400 text-center">
              Your private key is generated on-device and stored in IndexedDB.
              <br />
              <span className="text-neon-yellow">The server never sees it.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
