/**
 * @file crypto-engine.ts
 * @description Zero-Knowledge E2EE Core — AES-GCM + RSA-OAEP
 *
 * Runs identically on:
 *  - Web      → native window.crypto (Web Crypto API)
 *  - Desktop  → Electron exposes the same window.crypto
 *  - Mobile   → expo-standard-web-crypto polyfills globalThis.crypto
 *
 * CongMC Dev Team — "Vắt kiệt công nghệ" 🐧☝️
 */

// ─── Platform-aware crypto ────────────────────────────────────────────────────
// On React Native with expo-standard-web-crypto the polyfill patches
// globalThis.crypto before this module is loaded (see mobile/app/_layout.tsx).
// No branching needed here — just use globalThis.crypto everywhere.
const subtle = (): SubtleCrypto => {
  const c = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto
  if (!c?.subtle) {
    throw new Error(
      '[crypto-engine] Web Crypto API not available. ' +
        'Install expo-standard-web-crypto and call installWebCrypto() before importing this module.'
    )
  }
  return c.subtle
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AES_ALGORITHM = 'AES-GCM'
const AES_KEY_LENGTH = 256 // bits
const IV_LENGTH = 12 // bytes — 96-bit IV is optimal for GCM
const RSA_ALGORITHM = 'RSA-OAEP'
const RSA_MODULUS_LENGTH = 2048 // bits
const RSA_HASH = 'SHA-256'
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]) // 65537

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EncryptedPayload {
  /** Base64-encoded ciphertext (IV prepended) */
  ciphertext: string
  /** Algorithm tag for future-proofing */
  alg: 'AES-GCM-256'
}

export interface EncryptedSessionKey {
  /** RSA-OAEP encrypted AES session key (Base64) */
  encryptedKey: string
  alg: 'RSA-OAEP-2048'
}

export interface KeyPairExport {
  publicKey: string  // Base64 SPKI
  privateKey: string // Base64 PKCS8 — store in SecureStore / IndexedDB ONLY
}

export interface MessageBundle {
  /** For each recipient: their publicKeyId → their encrypted session key */
  sessionKeys: Record<string, EncryptedSessionKey | string>
  payload?: EncryptedPayload
  /** Legacy support: older clients stored ciphertext at root level */
  ciphertext?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))

export const fromBase64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

const randomBytes = (n: number): Uint8Array<ArrayBuffer> => {
  const buf = new Uint8Array(new ArrayBuffer(n))
  globalThis.crypto.getRandomValues(buf)
  return buf
}

// ─── AES-GCM ─────────────────────────────────────────────────────────────────

/** Generate a new AES-256-GCM session key (ephemeral, per message) */
export const generateSessionKey = async (): Promise<CryptoKey> =>
  subtle().generateKey({ name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ])

/**
 * Encrypt plaintext with AES-GCM.
 * Output format: [12-byte IV | ciphertext+tag]
 */
export const aesEncrypt = async (
  key: CryptoKey,
  plaintext: string
): Promise<EncryptedPayload> => {
  const iv = randomBytes(IV_LENGTH)
  const encoded = new TextEncoder().encode(plaintext)
  const cipherbuf = await subtle().encrypt({ name: AES_ALGORITHM, iv }, key, encoded)

  // Prepend IV to ciphertext for transport
  const combined = new Uint8Array(IV_LENGTH + cipherbuf.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipherbuf), IV_LENGTH)

  return { ciphertext: toBase64(combined.buffer), alg: 'AES-GCM-256' }
}

/** Decrypt AES-GCM payload. Extracts IV from first 12 bytes. */
export const aesDecrypt = async (key: CryptoKey, payload: EncryptedPayload): Promise<string> => {
  const combined = new Uint8Array(fromBase64(payload.ciphertext))
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const plainbuf = await subtle().decrypt({ name: AES_ALGORITHM, iv }, key, ciphertext)
  return new TextDecoder().decode(plainbuf)
}

/** Export a CryptoKey to raw Base64 (for session key wrapping) */
export const exportAesKey = async (key: CryptoKey): Promise<string> =>
  toBase64(await subtle().exportKey('raw', key))

/** Import a raw Base64 AES key */
export const importAesKey = async (raw: string): Promise<CryptoKey> =>
  subtle().importKey('raw', fromBase64(raw), { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ])

// ─── RSA-OAEP ────────────────────────────────────────────────────────────────

/** Generate an RSA-2048 key pair for key encapsulation */
export const generateRsaKeyPair = async (): Promise<CryptoKeyPair> =>
  subtle().generateKey(
    {
      name: RSA_ALGORITHM,
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: RSA_PUBLIC_EXPONENT,
      hash: RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt']
  )

/** Export RSA key pair to Base64 strings (SPKI + PKCS8) */
export const exportRsaKeyPair = async (kp: CryptoKeyPair): Promise<KeyPairExport> => ({
  publicKey: toBase64(await subtle().exportKey('spki', kp.publicKey)),
  privateKey: toBase64(await subtle().exportKey('pkcs8', kp.privateKey)),
})

/** Import RSA public key from Base64 SPKI */
export const importRsaPublicKey = async (spki: string): Promise<CryptoKey> =>
  subtle().importKey(
    'spki',
    fromBase64(spki),
    { name: RSA_ALGORITHM, hash: RSA_HASH },
    true,
    ['encrypt']
  )

/** Import RSA private key from Base64 PKCS8 */
export const importRsaPrivateKey = async (pkcs8: string): Promise<CryptoKey> =>
  subtle().importKey(
    'pkcs8',
    fromBase64(pkcs8),
    { name: RSA_ALGORITHM, hash: RSA_HASH },
    true,
    ['decrypt']
  )

/**
 * Wrap an AES session key with a recipient's RSA public key.
 * Only the recipient's private key can unwrap it. Zero-Knowledge.
 */
export const wrapSessionKey = async (
  sessionKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<EncryptedSessionKey> => {
  const rawKey = await subtle().exportKey('raw', sessionKey)
  const encrypted = await subtle().encrypt({ name: RSA_ALGORITHM }, recipientPublicKey, rawKey)
  return { encryptedKey: toBase64(encrypted), alg: 'RSA-OAEP-2048' }
}

/** Unwrap an AES session key using the recipient's RSA private key */
export const unwrapSessionKey = async (
  encryptedSessionKey: EncryptedSessionKey,
  privateKey: CryptoKey
): Promise<CryptoKey> => {
  const rawKey = await subtle().decrypt(
    { name: RSA_ALGORITHM },
    privateKey,
    fromBase64(encryptedSessionKey.encryptedKey)
  )
  return importAesKey(toBase64(rawKey))
}

// ─── High-level API ───────────────────────────────────────────────────────────

/**
 * Encrypt a message for multiple recipients (group-ready).
 *
 * Flow:
 *  1. Generate ephemeral AES session key
 *  2. Encrypt plaintext with AES-GCM
 *  3. For each recipient: RSA-OAEP wrap the session key with their public key
 *
 * The server never sees the session key or plaintext. Zero-Knowledge.
 */
export const encryptMessage = async (
  plaintext: string,
  recipients: Array<{ id: string; publicKey: string }>
): Promise<MessageBundle> => {
  const sessionKey = await generateSessionKey()
  const payload = await aesEncrypt(sessionKey, plaintext)

  const sessionKeys: Record<string, EncryptedSessionKey> = {}
  await Promise.all(
    recipients.map(async ({ id, publicKey }) => {
      const pubKey = await importRsaPublicKey(publicKey)
      sessionKeys[id] = await wrapSessionKey(sessionKey, pubKey)
    })
  )

  return { sessionKeys, payload }
}

/**
 * Decrypt a message bundle using the recipient's private key.
 *
 * @param bundle    - MessageBundle from the server
 * @param myId      - Your user ID (to look up your encrypted session key)
 * @param privateKey - Your RSA private key (NEVER leaves the device)
 */
export const decryptMessage = async (
  bundle: MessageBundle,
  myId: string,
  privateKey: CryptoKey
): Promise<string> => {
  const myEncryptedKey = bundle.sessionKeys[myId]
  if (!myEncryptedKey) throw new Error('[crypto-engine] No session key found for this recipient.')

  const normalizedKey: EncryptedSessionKey =
    typeof myEncryptedKey === 'string'
      ? { encryptedKey: myEncryptedKey, alg: 'RSA-OAEP-2048' }
      : myEncryptedKey

  const ciphertext = bundle.payload?.ciphertext ?? bundle.ciphertext
  if (!ciphertext) {
    throw new Error('[crypto-engine] Missing ciphertext payload.')
  }

  const sessionKey = await unwrapSessionKey(normalizedKey, privateKey)
  return aesDecrypt(sessionKey, { ciphertext, alg: 'AES-GCM-256' })
}

// ─── Key Fingerprint ─────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 fingerprint of an RSA public key (SPKI).
 * Display to users for out-of-band key verification (Safety Number).
 */
export const publicKeyFingerprint = async (spki: string): Promise<string> => {
  const hashBuf = await subtle().digest('SHA-256', fromBase64(spki))
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase()
}
