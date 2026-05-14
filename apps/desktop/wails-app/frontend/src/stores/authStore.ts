import { create } from 'zustand'
import { openDB, type IDBPDatabase } from 'idb'
import { API_BASE_URL, WS_BASE_URL } from '../lib/runtimeConfig'
import {
  generateRsaKeyPair, exportRsaKeyPair, importRsaPrivateKey,
  publicKeyFingerprint, encryptPrivateKeyWithPassphrase,
} from '../lib/crypto'

export const API = API_BASE_URL
export const WS_BASE = WS_BASE_URL

interface AuthState {
  isAuthenticated: boolean
  userId:     string | null
  username:   string | null
  publicKey:  string | null
  privateKey: CryptoKey | null
  token:      string | null
  needsKeyRecovery: boolean

  login:           (username: string, password: string, totpCode?: string) => Promise<void>
  register:        (username: string, email: string, password: string, passphrase: string) => Promise<void>
  loginWithOAuth:  (accessToken: string, passphrase?: string) => Promise<void>
  completeOAuthLogin: (payload: { userId: string; username: string; token: string }, passphrase?: string) => Promise<void>
  logout:          () => void
  setSession:      (userId: string, username: string, token: string, privKey: CryptoKey, pubKey: string) => void
  restoreSession:  () => Promise<void>
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

const SESSION_KEYS = ['amoon:userId', 'amoon:token', 'amoon:username', 'amoon:pubKey']

function saveSession(userId: string, username: string, token: string, pubKey: string) {
  localStorage.setItem('amoon:userId', userId)
  localStorage.setItem('amoon:token', token)
  localStorage.setItem('amoon:username', username)
  localStorage.setItem('amoon:pubKey', pubKey)
}

function migrateSessionStorage() {
  for (const key of SESSION_KEYS) {
    const existing = localStorage.getItem(key)
    const legacy = sessionStorage.getItem(key)
    if (!existing && legacy) localStorage.setItem(key, legacy)
  }
}

function clearSession() {
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
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
    saveSession(userId, username, token, pubKey)
  },

  restoreSession: async () => {
    migrateSessionStorage()
    const userId = localStorage.getItem('amoon:userId')
    const token = localStorage.getItem('amoon:token')
    const username = localStorage.getItem('amoon:username')
    const pubKey = localStorage.getItem('amoon:pubKey') ?? ''
    if (!userId || !token || !username) return

    const privKey = await loadPrivateKey(userId)
    if (!privKey) {
      set({ isAuthenticated: false, needsKeyRecovery: true, userId, token, username, publicKey: pubKey || null, privateKey: null })
      return
    }

    set({ isAuthenticated: true, userId, username, token, publicKey: pubKey || null, privateKey: privKey, needsKeyRecovery: false })
  },

  register: async (username, email, password, passphrase) => {
    const passwordHash = password

    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: passwordHash }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Registration failed')
    const data = await res.json()
    const userId = data.userId ?? data.id

    const created = await setupE2eeKey(userId, data.token, passphrase)
    const privKey = await importRsaPrivateKey(created.privateKey)
    set({ isAuthenticated: true, userId, username, publicKey: created.publicKey, privateKey: privKey, token: data.token, needsKeyRecovery: false })
    saveSession(userId, username, data.token ?? '', created.publicKey)
  },

  login: async (username, password, totpCode) => {
    const passwordHash = password
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: passwordHash,
        ...(totpCode?.trim() ? { totpCode: totpCode.trim() } : {}),
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Login failed')
    const data = await res.json()
    // Backend trả flat: { token, userId, username } — không phải nested user object
    const uid  = data.userId ?? data.user?.id
    const uname = data.username ?? data.user?.username
    const pubKey = data.publicKey ?? data.user?.publicKey ?? ''

    const privKey = await loadPrivateKey(uid)
    if (!privKey) {
      saveSession(uid, uname, data.token, pubKey)
      set({ needsKeyRecovery: true, userId: uid, token: data.token, username: uname })
      return
    }

    set({ isAuthenticated: true, userId: uid, username: uname, publicKey: pubKey, privateKey: privKey, token: data.token, needsKeyRecovery: false })
    saveSession(uid, uname, data.token, pubKey)
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
    saveSession(data.userId, data.username, data.token, pubKey ?? '')
  },

  completeOAuthLogin: async (payload, passphrase) => {
    let privKey = await loadPrivateKey(payload.userId)
    let pubKey = localStorage.getItem('amoon:pubKey') ?? sessionStorage.getItem('amoon:pubKey') ?? undefined

    if (!privKey) {
      const created = await setupE2eeKey(payload.userId, payload.token, passphrase)
      privKey = await importRsaPrivateKey(created.privateKey)
      pubKey = created.publicKey
    }

    set({
      isAuthenticated: true,
      userId: payload.userId,
      username: payload.username,
      publicKey: pubKey ?? null,
      privateKey: privKey,
      token: payload.token,
      needsKeyRecovery: false,
    })
    saveSession(payload.userId, payload.username, payload.token, pubKey ?? '')
  },

  logout: () => {
    set({ isAuthenticated: false, userId: null, username: null, publicKey: null, privateKey: null, token: null, needsKeyRecovery: false })
    clearSession()
  },
}))
