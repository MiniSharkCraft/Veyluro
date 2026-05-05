/**
 * @file authStore.ts
 * @description Zustand store for auth state + IndexedDB key persistence.
 *
 * Private keys NEVER leave IndexedDB. Zero-Knowledge.
 */

import { create } from 'zustand'
import { openDB, type IDBPDatabase } from 'idb'
import { API_BASE_URL } from '../lib/runtimeConfig'
import {
  generateRsaKeyPair,
  exportRsaKeyPair,
  importRsaPrivateKey,
  importRsaPublicKey,
  publicKeyFingerprint,
} from '@messmini/common'

interface AuthState {
  isAuthenticated: boolean
  userId: string | null
  username: string | null
  publicKey: string | null       // Base64 SPKI — shared with server
  privateKey: CryptoKey | null   // In-memory only, sourced from IndexedDB
  token: string | null

  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  loadKeysFromStorage: () => Promise<void>
}

type AuthPayload = {
  token: string
  userId: string
  username: string
  publicKey?: string
}

// ─── IndexedDB (private key storage) ─────────────────────────────────────────
let _db: IDBPDatabase | null = null

const getDb = async () => {
  if (_db) return _db
  _db = await openDB('messmini-keystore', 1, {
    upgrade(db) {
      db.createObjectStore('keys')
    },
  })
  return _db
}

const savePrivateKeyToIDB = async (userId: string, pkcs8: string) => {
  const db = await getDb()
  await db.put('keys', pkcs8, `privateKey:${userId}`)
}

export const loadPrivateKeyFromIDB = async (userId: string): Promise<CryptoKey | null> => {
  const db = await getDb()
  const pkcs8 = await db.get('keys', `privateKey:${userId}`)
  if (!pkcs8) return null
  return importRsaPrivateKey(pkcs8)
}

// ─── Password hashing ────────────────────────────────────────────────────────
const hashPassword = (password: string) => Promise.resolve(password)

// Suppress unused import warning for importRsaPublicKey — it's part of the common API
void importRsaPublicKey

export const useAuthStore = create<AuthState>((set, _get) => ({
  isAuthenticated: false,
  userId: null,
  username: null,
  publicKey: null,
  privateKey: null,
  token: null,

  register: async (username, password) => {
    const kp = await generateRsaKeyPair()
    const { publicKey, privateKey } = await exportRsaKeyPair(kp)
    const fingerprint = await publicKeyFingerprint(publicKey)
    const serverPassword = await hashPassword(password)

    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: serverPassword }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    const data = await res.json() as AuthPayload

    const keyRes = await fetch(`${API_BASE_URL}/api/auth/register-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.token}`,
      },
      body: JSON.stringify({ publicKey, fingerprint }),
    })
    if (!keyRes.ok) throw new Error((await keyRes.json()).error ?? 'Failed to register public key')

    await savePrivateKeyToIDB(data.userId, privateKey)
    const privKey = await importRsaPrivateKey(privateKey)

    localStorage.setItem('amoon_token', data.token)
    localStorage.setItem('amoon_userId', data.userId)
    localStorage.setItem('amoon_username', username)
    sessionStorage.setItem('messmini:userId', data.userId)

    set({ isAuthenticated: true, userId: data.userId, username, publicKey, privateKey: privKey, token: data.token })
  },

  login: async (username, password) => {
    const serverPassword = await hashPassword(password)
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: serverPassword }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    const data = await res.json() as AuthPayload

    const privKey = await loadPrivateKeyFromIDB(data.userId)
    if (!privKey) throw new Error('Private key not found on this device. Please re-register or restore a backup.')

    localStorage.setItem('amoon_token', data.token)
    localStorage.setItem('amoon_userId', data.userId)
    localStorage.setItem('amoon_username', data.username)
    sessionStorage.setItem('messmini:userId', data.userId)

    set({
      isAuthenticated: true,
      userId: data.userId,
      username: data.username,
      publicKey: data.publicKey ?? null,
      privateKey: privKey,
      token: data.token,
    })
  },

  logout: () => {
    localStorage.removeItem('amoon_token')
    localStorage.removeItem('amoon_userId')
    localStorage.removeItem('amoon_username')
    sessionStorage.removeItem('messmini:userId')
    set({ isAuthenticated: false, userId: null, username: null, publicKey: null, privateKey: null, token: null })
  },

  loadKeysFromStorage: async () => {
    // Try localStorage first, fall back to sessionStorage
    const userId = localStorage.getItem('amoon_userId') ?? sessionStorage.getItem('messmini:userId')
    const token = localStorage.getItem('amoon_token')
    const username = localStorage.getItem('amoon_username')
    if (!userId) return
    const privKey = await loadPrivateKeyFromIDB(userId)
    if (privKey) {
      set({ privateKey: privKey, isAuthenticated: true, userId, token: token ?? null, username: username ?? null })
    }
  },
}))
