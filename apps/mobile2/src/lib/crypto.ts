/**
 * Mobile2 phải dùng chung crypto engine với web/common để tránh lệch
 * MessageBundle format (lỗi decrypt khi chat chéo client hoặc đọc lịch sử cũ).
 */
import {
  type MessageBundle,
  decryptMessage,
  encryptMessage,
  exportRsaKeyPair,
  fromBase64,
  generateRsaKeyPair,
  importRsaPrivateKey,
  publicKeyFingerprint,
} from '@messmini/common'

export {
  decryptMessage,
  encryptMessage,
  exportRsaKeyPair,
  generateRsaKeyPair,
  importRsaPrivateKey,
  publicKeyFingerprint,
}
export type { MessageBundle }

const sub = () => (global as unknown as { crypto: Crypto }).crypto.subtle
const getRandomValues = <T extends ArrayBufferView>(a: T): T =>
  (global as unknown as { crypto: Crypto }).crypto.getRandomValues(a)

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
