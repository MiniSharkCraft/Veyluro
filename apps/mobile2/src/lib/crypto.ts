/**
 * Crypto engine — RSA-OAEP + AES-256-GCM + PBKDF2
 * Polyfilled bởi react-native-quick-crypto (install() gọi trước trong _layout.tsx)
 */
const sub = () => (global as unknown as { crypto: Crypto }).crypto.subtle
const getRandomValues = <T extends ArrayBufferView>(a: T): T =>
  (global as unknown as { crypto: Crypto }).crypto.getRandomValues(a)

// ─── Base64 helpers ───────────────────────────────────────────────────────────
export const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))

export const fromBase64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ─── RSA-OAEP 2048 ───────────────────────────────────────────────────────────
export const generateRsaKeyPair = () =>
  sub().generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt']
  )

export const exportRsaKeyPair = async (kp: CryptoKeyPair) => ({
  publicKey:  toBase64(await sub().exportKey('spki',  kp.publicKey)),
  privateKey: toBase64(await sub().exportKey('pkcs8', kp.privateKey)),
})

export const importRsaPublicKey = (spki: string) =>
  sub().importKey('spki', fromBase64(spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt'])

export const importRsaPrivateKey = (pkcs8: string) =>
  sub().importKey('pkcs8', fromBase64(pkcs8), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt'])

export const publicKeyFingerprint = async (spki: string) => {
  const buf = await sub().digest('SHA-256', fromBase64(spki))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase()
}

// ─── E2EE message bundle ──────────────────────────────────────────────────────
export interface MessageBundle {
  sessionKeys: Record<string, string>  // userId → base64(RSA-wrapped AES key)
  ciphertext: string                   // base64([12-byte IV | AES-GCM ciphertext])
}

export const encryptMessage = async (
  plaintext: string,
  recipients: Array<{ id: string; publicKey: string }>
): Promise<MessageBundle> => {
  const sessionKey = await sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const enc = new TextEncoder()
  const iv  = getRandomValues(new Uint8Array(12))
  const ct  = await sub().encrypt({ name: 'AES-GCM', iv }, sessionKey, enc.encode(plaintext))
  const combined = new Uint8Array(12 + ct.byteLength)
  combined.set(iv); combined.set(new Uint8Array(ct), 12)

  const rawKey = await sub().exportKey('raw', sessionKey)
  const sessionKeys: Record<string, string> = {}
  await Promise.all(recipients.map(async ({ id, publicKey }) => {
    const pub = await importRsaPublicKey(publicKey)
    sessionKeys[id] = toBase64(await sub().encrypt({ name: 'RSA-OAEP' }, pub, rawKey))
  }))

  return { sessionKeys, ciphertext: toBase64(combined.buffer) }
}

export const decryptMessage = async (
  bundle: MessageBundle, myId: string, privateKey: CryptoKey
): Promise<string> => {
  const encKey = bundle.sessionKeys[myId]
  if (!encKey) throw new Error('No session key for this recipient')
  const rawKey   = await sub().decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(encKey))
  const aesKey   = await sub().importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
  const combined = new Uint8Array(fromBase64(bundle.ciphertext))
  const plain    = await sub().decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, aesKey, combined.slice(12))
  return new TextDecoder().decode(plain)
}

// ─── Passphrase key backup (PBKDF2 + AES-GCM) ────────────────────────────────
export const encryptPrivateKeyWithPassphrase = async (
  privateKeyB64: string,
  passphrase: string
): Promise<{ encryptedKey: string; keySalt: string }> => {
  const enc  = new TextEncoder()
  const salt = getRandomValues(new Uint8Array(16))
  const km   = await sub().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await sub().deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  )
  const iv = getRandomValues(new Uint8Array(12))
  const ct = await sub().encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(privateKeyB64))

  return {
    encryptedKey: JSON.stringify({ salt: Array.from(salt), iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) }),
    keySalt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
  }
}

export const decryptPrivateKeyWithPassphrase = async (
  encryptedKeyJson: string,
  passphrase: string
): Promise<string> => {
  const { salt, iv, ct } = JSON.parse(encryptedKeyJson)
  const enc = new TextEncoder()
  const km  = await sub().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await sub().deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  )
  const plain = await sub().decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, new Uint8Array(ct))
  return new TextDecoder().decode(plain)
}
