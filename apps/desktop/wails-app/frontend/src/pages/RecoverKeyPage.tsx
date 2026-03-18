import { useState } from 'react'
import { useAuthStore, API, savePrivateKey } from '../stores/authStore'
import { decryptPrivateKeyWithPassphrase, importRsaPrivateKey, generateRsaKeyPair, exportRsaKeyPair, publicKeyFingerprint } from '../lib/crypto'

export function RecoverKeyPage() {
  const { userId, token, username, setSession, logout } = useAuthStore()
  const [passphrase, setPassphrase] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [mode,       setMode]       = useState<'recover' | 'newkey'>('recover')

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passphrase.trim() || !userId || !token) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/auth/encrypted-key`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Could not fetch key backup from server')
      const { encryptedKey } = await res.json()
      if (!encryptedKey) {
        setError('No passphrase backup found for this account. Use "Create New Key" instead.')
        return
      }

      const privateKeyB64 = await decryptPrivateKeyWithPassphrase(encryptedKey, passphrase)
      await savePrivateKey(userId, privateKeyB64)
      const privKey = await importRsaPrivateKey(privateKeyB64)

      // Fetch public key from server
      const userRes = await fetch(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      const userData = userRes.ok ? await userRes.json() : {}

      setSession(userId, username ?? '', token, privKey, userData.publicKey ?? '')
    } catch {
      setError('Wrong passphrase or corrupted backup.')
    } finally { setLoading(false) }
  }

  const handleNewKey = async () => {
    if (!userId || !token) return
    setLoading(true); setError(null)
    try {
      const kp = await generateRsaKeyPair()
      const { publicKey, privateKey } = await exportRsaKeyPair(kp)
      const fingerprint = await publicKeyFingerprint(publicKey)

      await savePrivateKey(userId, privateKey)
      await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey, fingerprint }),
      })

      const privKey = await importRsaPrivateKey(privateKey)
      setSession(userId, username ?? '', token, privKey, publicKey)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create new key')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex h-screen bg-dark-900 font-mono">
      {/* Left decorative panel */}
      <div className="w-[380px] shrink-0 flex flex-col justify-center items-center p-10 border-r border-dark-400 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-neon-yellow/5 to-transparent pointer-events-none" />
        <div className="text-center space-y-4 relative z-10">
          <div className="w-20 h-20 mx-auto rounded-full border-2 border-neon-yellow/40 flex items-center justify-center">
            <span className="text-4xl">🔑</span>
          </div>
          <h1 className="text-white text-2xl font-bold">New Device</h1>
          <p className="text-dark-400 text-sm leading-relaxed max-w-xs">
            Your E2EE private key wasn't found on this device.
            Use your passphrase to restore it, or generate a new key
            (old messages will be unreadable).
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Tab */}
          <div className="flex bg-dark-800 rounded-cyber p-0.5 border border-dark-400">
            {([['recover', '🔐 Restore Key'], ['newkey', '⚡ New Key']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`flex-1 py-2 text-xs rounded-cyber transition-all font-semibold ${
                  mode === k ? 'bg-dark-600 text-neon-cyan border border-dark-400' : 'text-dark-400 hover:text-neon-cyan'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs border border-red-900 bg-red-950/30 rounded-cyber px-3 py-2.5">⚠ {error}</p>}

          {mode === 'recover' ? (
            <form onSubmit={handleRecover} className="space-y-4">
              <div>
                <p className="text-neon-cyan text-sm font-semibold mb-4">Restore from Passphrase</p>
                <label className="block text-xs text-dark-400 tracking-wider mb-1.5 uppercase">Your Passphrase</label>
                <input
                  type="password"
                  className="cyber-input w-full"
                  placeholder="your memorable passphrase..."
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="cyber-btn w-full py-3" disabled={loading}>
                {loading ? 'Decrypting...' : 'Restore →'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-cyber border border-red-900/40 bg-red-950/20 p-4 space-y-2">
                <p className="text-red-400 text-xs font-semibold">⚠ Warning</p>
                <p className="text-red-400/70 text-xs leading-relaxed">
                  Creating a new key means you will permanently lose access to all previous encrypted messages.
                  This cannot be undone.
                </p>
              </div>
              <button
                onClick={handleNewKey}
                disabled={loading}
                className="cyber-btn-danger w-full py-3"
              >
                {loading ? 'Generating...' : 'Create New Key (lose old messages)'}
              </button>
            </div>
          )}

          <button onClick={logout} className="w-full text-center text-xs text-dark-400 hover:text-neon-cyan transition-colors">
            ← Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
