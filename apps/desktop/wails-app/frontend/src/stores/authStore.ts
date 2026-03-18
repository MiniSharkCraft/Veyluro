import { create } from 'zustand'
import { openDB, type IDBPDatabase } from 'idb'
import {
  generateRsaKeyPair, exportRsaKeyPair, importRsaPrivateKey,
  publicKeyFingerprint, encryptPrivateKeyWithPassphrase,
} from '../lib/crypto'

// Configure via frontend/.env — see frontend/.env.example
export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
export const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws')

interface AuthState {
  isAuthenticated: boolean
  userId:     string | null
  username:   string | null
  publicKey:  string | null
  privateKey: CryptoKey | null
  token:      string | null
  needsKeyRecovery: boolean

  login:           (username: string, password: string) => Promise<void>
  register:        (username: string, email: string, password: string, passphrase: string) => Promise<void>
  loginWithOAuth:  (accessToken: string, passphrase?: string) => Promise<void>
  logout:          () => void
  setSession:      (userId: string, username: string, token: string, privKey: CryptoKey, pubKey: string) => void
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────
let _db: IDBPDatabase | null = null
const getDb = async () => {
  if (_db) return _db
  _db = await openDB('amoon-keystore', 1, { upgrade(db) { db.createObjectStore('keys') } })
  return _db
}
export const savePrivateKey = async (userId: string, pkcs8: string) =>
  (await getDb()).put('keys', pkcs8, `pk:${userId}`)
export const loadPrivateKey = async (userId: string): Promise<CryptoKey | null> => {
  const raw = await (await getDb()).get('keys', `pk:${userId}`)
  return raw ? importRsaPrivateKey(raw) : null
}

// ─── E2EE key setup (generate + register + backup passphrase) ─────────────────
async function setupE2eeKey(userId: string, token: string, passphrase?: string) {
  const kp = await generateRsaKeyPair()
  const { publicKey, privateKey } = await exportRsaKeyPair(kp)
  const fingerprint = await publicKeyFingerprint(publicKey)

  await savePrivateKey(userId, privateKey)

  await fetch(`${API}/api/auth/register-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ publicKey, fingerprint }),
  })

  if (passphrase) {
    const { bundle, saltHex } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
    await fetch(`${API}/api/auth/store-encrypted-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ encryptedKey: bundle, keySalt: saltHex }),
    })
  }

  return { publicKey, privateKey }
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null, username: null, publicKey: null, privateKey: null, token: null,
  needsKeyRecovery: false,

  setSession: (userId, username, token, privKey, pubKey) => {
    set({ isAuthenticated: true, userId, username, token, privateKey: privKey, publicKey: pubKey, needsKeyRecovery: false })
    sessionStorage.setItem('amoon:userId',   userId)
    sessionStorage.setItem('amoon:token',    token)
    sessionStorage.setItem('amoon:username', username)
    sessionStorage.setItem('amoon:pubKey',   pubKey)
  },

  register: async (username, email, password, passphrase) => {
    const passwordHash = password
    const kp = await generateRsaKeyPair()
    const { publicKey, privateKey } = await exportRsaKeyPair(kp)
    const fingerprint = await publicKeyFingerprint(publicKey)

    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: passwordHash, publicKey, fingerprint }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Registration failed')
    const data = await res.json()
    const userId = data.userId ?? data.id

    await savePrivateKey(userId, privateKey)

    if (passphrase) {
      const { bundle, saltHex } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
      await fetch(`${API}/api/auth/store-encrypted-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
        body: JSON.stringify({ encryptedKey: bundle, keySalt: saltHex }),
      })
    }

    const privKey = await importRsaPrivateKey(privateKey)
    set({ isAuthenticated: true, userId, username, publicKey, privateKey: privKey, token: data.token, needsKeyRecovery: false })
    sessionStorage.setItem('amoon:userId',   userId)
    sessionStorage.setItem('amoon:token',    data.token ?? '')
    sessionStorage.setItem('amoon:username', username)
    sessionStorage.setItem('amoon:pubKey',   publicKey)
  },

  login: async (username, password) => {
    const passwordHash = password
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: passwordHash }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Login failed')
    const data = await res.json()
    // Backend trả flat: { token, userId, username } — không phải nested user object
    const uid  = data.userId ?? data.user?.id
    const uname = data.username ?? data.user?.username
    const pubKey = data.publicKey ?? data.user?.publicKey ?? ''

    const privKey = await loadPrivateKey(uid)
    if (!privKey) {
      sessionStorage.setItem('amoon:userId',   uid)
      sessionStorage.setItem('amoon:token',    data.token)
      sessionStorage.setItem('amoon:username', uname)
      set({ needsKeyRecovery: true, userId: uid, token: data.token, username: uname })
      return
    }

    set({ isAuthenticated: true, userId: uid, username: uname, publicKey: pubKey, privateKey: privKey, token: data.token, needsKeyRecovery: false })
    sessionStorage.setItem('amoon:userId',   uid)
    sessionStorage.setItem('amoon:token',    data.token)
    sessionStorage.setItem('amoon:username', uname)
    sessionStorage.setItem('amoon:pubKey',   pubKey)
  },

  loginWithOAuth: async (accessToken, passphrase) => {
    const res = await fetch(`${API}/api/auth/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', accessToken }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'OAuth failed')
    const data = await res.json()

    // Check if user already has key on this device
    let privKey = await loadPrivateKey(data.userId)
    let pubKey = data.publicKey as string | undefined

    if (!privKey) {
      // Generate new key pair and register
      const { publicKey, privateKey } = await setupE2eeKey(data.userId, data.token, passphrase)
      privKey = await importRsaPrivateKey(privateKey)
      pubKey = publicKey
    }

    set({ isAuthenticated: true, userId: data.userId, username: data.username, publicKey: pubKey ?? null, privateKey: privKey, token: data.token, needsKeyRecovery: false })
    sessionStorage.setItem('amoon:userId',   data.userId)
    sessionStorage.setItem('amoon:token',    data.token)
    sessionStorage.setItem('amoon:username', data.username)
    sessionStorage.setItem('amoon:pubKey',   pubKey ?? '')
  },

  logout: () => {
    set({ isAuthenticated: false, userId: null, username: null, publicKey: null, privateKey: null, token: null, needsKeyRecovery: false })
    ;['amoon:userId','amoon:token','amoon:username','amoon:pubKey'].forEach(k => sessionStorage.removeItem(k))
  },
}))
