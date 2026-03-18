/**
 * Crypto engine — AES-256-GCM + RSA-OAEP + Argon2id + Passphrase key backup
 */

import { argon2id } from 'hash-wasm'

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))

export const fromBase64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

const sub = () => window.crypto.subtle

// ─── RSA-OAEP ────────────────────────────────────────────────────────────────
export const generateRsaKeyPair = () =>
  sub().generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt']
  )

export const exportRsaKeyPair = async (kp: CryptoKeyPair) => ({
  publicKey:  toBase64(await sub().exportKey('spki',  kp.publicKey)),
  privateKey: toBase64(await sub().exportKey('pkcs8', kp.privateKey)),
})

export const importRsaPublicKey  = (spki: string)  =>
  sub().importKey('spki',  fromBase64(spki),  { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt'])

export const importRsaPrivateKey = (pkcs8: string) =>
  sub().importKey('pkcs8', fromBase64(pkcs8), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt'])

export const publicKeyFingerprint = async (spki: string) => {
  const buf = await sub().digest('SHA-256', fromBase64(spki))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase()
}

// ─── AES-GCM ─────────────────────────────────────────────────────────────────
const genAesKey = () =>
  sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

const importAesKey = (raw: ArrayBuffer) =>
  sub().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

const aesEncryptRaw = async (key: CryptoKey, data: ArrayBuffer) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = await sub().encrypt({ name: 'AES-GCM', iv }, key, data)
  const out = new Uint8Array(12 + ct.byteLength)
  out.set(iv); out.set(new Uint8Array(ct), 12)
  return out.buffer
}

const aesDecryptRaw = async (key: CryptoKey, combined: ArrayBuffer) => {
  const buf = new Uint8Array(combined)
  return sub().decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
}

// ─── Argon2id ─────────────────────────────────────────────────────────────────
export const hashPassword = (password: string) =>
  argon2id({
    password, salt: window.crypto.getRandomValues(new Uint8Array(16)),
    memorySize: 19456, iterations: 2, parallelism: 1, hashLength: 32, outputType: 'encoded',
  })

// ─── Passphrase-based key backup (PBKDF2 + AES-GCM) ─────────────────────────
export interface EncryptedKeyBundle {
  salt: number[]
  iv:   number[]
  ct:   number[]
}

export const encryptPrivateKeyWithPassphrase = async (
  privateKeyB64: string,
  passphrase: string
): Promise<{ bundle: string; saltHex: string }> => {
  const enc = new TextEncoder()
  const salt = window.crypto.getRandomValues(new Uint8Array(16))

  const km = await sub().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await sub().deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  )
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = await sub().encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(privateKeyB64))

  const bundle: EncryptedKeyBundle = {
    salt: Array.from(salt), iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)),
  }
  return {
    bundle: JSON.stringify(bundle),
    saltHex: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
  }
}

export const decryptPrivateKeyWithPassphrase = async (
  bundleJson: string,
  passphrase: string
): Promise<string> => {
  const { salt, iv, ct } = JSON.parse(bundleJson) as EncryptedKeyBundle
  const enc = new TextEncoder()

  const km = await sub().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await sub().deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  )
  const plain = await sub().decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, new Uint8Array(ct))
  return new TextDecoder().decode(plain)
}

// ─── E2EE message encryption ──────────────────────────────────────────────────
// Bundle format tương thích với common crypto-engine (web + mobile)
export interface MessageBundle {
  sessionKeys: Record<string, { encryptedKey: string; alg: string } | string>
  payload?: { ciphertext: string; alg?: string }   // common format
  ciphertext?: string                               // legacy desktop format
}

export const encryptMessage = async (
  plaintext: string,
  recipients: Array<{ id: string; publicKey: string }>
): Promise<MessageBundle> => {
  const sessionKey = await genAesKey()
  const enc = new TextEncoder()
  const iv  = window.crypto.getRandomValues(new Uint8Array(12))
  const ct  = await sub().encrypt({ name: 'AES-GCM', iv }, sessionKey, enc.encode(plaintext))
  const combined = new Uint8Array(12 + ct.byteLength)
  combined.set(iv); combined.set(new Uint8Array(ct), 12)
  const ciphertext = toBase64(combined.buffer)

  const rawKey = await sub().exportKey('raw', sessionKey)
  const sessionKeys: Record<string, { encryptedKey: string; alg: string }> = {}
  await Promise.all(recipients.map(async ({ id, publicKey }) => {
    const pub = await importRsaPublicKey(publicKey)
    sessionKeys[id] = { encryptedKey: toBase64(await sub().encrypt({ name: 'RSA-OAEP' }, pub, rawKey)), alg: 'RSA-OAEP-2048' }
  }))

  // Dùng format common (payload) để tương thích với web + mobile
  return { sessionKeys, payload: { ciphertext, alg: 'AES-GCM-256' } }
}

export const decryptMessage = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundle: any, myId: string, privateKey: CryptoKey
): Promise<string> => {
  const rawEncKey = bundle.sessionKeys?.[myId]
  if (!rawEncKey) throw new Error('No session key for this recipient')

  // Hỗ trợ cả 2 format: object { encryptedKey } hoặc plain base64 string
  const encKeyB64 = typeof rawEncKey === 'string' ? rawEncKey : rawEncKey.encryptedKey
  const rawKey  = await sub().decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(encKeyB64))
  const aesKey  = await importAesKey(rawKey)

  // Hỗ trợ cả 2 format: payload.ciphertext (common) hoặc ciphertext (legacy)
  const ctB64   = bundle.payload?.ciphertext ?? bundle.ciphertext
  const buf     = new Uint8Array(fromBase64(ctB64))
  const plain   = await sub().decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, aesKey, buf.slice(12))
  return new TextDecoder().decode(plain)
}
