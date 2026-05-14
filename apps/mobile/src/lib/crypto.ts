/**
 * Mobile2 phải dùng chung crypto engine với web/common để tránh lệch
 * MessageBundle format (lỗi decrypt khi chat chéo client hoặc đọc lịch sử cũ).
 */
import {
  type MessageBundle,
  decryptMessage as decryptLegacyMessage,
  encryptMessage as encryptLegacyMessage,
  exportRsaKeyPair,
  fromBase64,
  toBase64,
  generateRsaKeyPair,
  importRsaPrivateKey,
  normalizeEmoticons,
  publicKeyFingerprint,
} from '@messmini/common'
import { ensureSignalReady, signalEncryptMessage, signalDecryptMessage, type SignalBundleJSON } from './signal'

export {
  exportRsaKeyPair,
  generateRsaKeyPair,
  importRsaPrivateKey,
  normalizeEmoticons,
  publicKeyFingerprint,
}
export type { MessageBundle }
export type { SignalBundleJSON }

type Recipient = { id: string; publicKey?: string; signalBundle?: SignalBundleJSON | null }

export const ensureSignalForUser = async (userId: string) => ensureSignalReady(userId)

export const encryptMessage = async (
  plaintext: string,
  recipients: Recipient[]
): Promise<MessageBundle | Record<string, unknown>> => {
  const hasSignal = recipients.some((r) => r.signalBundle)
  if (hasSignal) {
    return signalEncryptMessage(
      plaintext,
      recipients.map((r) => ({ id: r.id, signalBundle: r.signalBundle ?? null }))
    )
  }
  const legacyRecipients = recipients
    .filter((r) => !!r.publicKey)
    .map((r) => ({ id: r.id, publicKey: r.publicKey as string }))
  return encryptLegacyMessage(plaintext, legacyRecipients)
}

export const decryptMessage = async (
  bundle: MessageBundle | Record<string, any>,
  myId: string,
  privateKey: CryptoKey
): Promise<string> => {
  const signal = bundle as { v?: number; alg?: string; senderId?: string }
  if (signal?.v === 2 && signal?.alg === 'signal') {
    if (!signal.senderId) throw new Error('Signal bundle thiếu senderId')
    return signalDecryptMessage(bundle as any, signal.senderId)
  }
  return decryptLegacyMessage(bundle as MessageBundle, myId, privateKey)
}

const sub = () => (global as unknown as { crypto: Crypto }).crypto.subtle
const getRandomValues = <T extends ArrayBufferView>(a: T): T =>
  (global as unknown as { crypto: Crypto }).crypto.getRandomValues(a)

export type AttachmentCryptoMeta = {
  alg: 'AES-GCM-256'
  key: string // base64 raw AES key
}

const ATTACHMENT_IV_LENGTH = 12

export const encryptAttachmentBytes = async (
  plain: ArrayBuffer
): Promise<{ encrypted: ArrayBuffer; meta: AttachmentCryptoMeta }> => {
  const aesKey = await sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = getRandomValues(new Uint8Array(ATTACHMENT_IV_LENGTH))
  const ct = await sub().encrypt({ name: 'AES-GCM', iv }, aesKey, plain)
  const rawKey = await sub().exportKey('raw', aesKey)

  const out = new Uint8Array(ATTACHMENT_IV_LENGTH + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), ATTACHMENT_IV_LENGTH)

  return {
    encrypted: out.buffer,
    meta: {
      alg: 'AES-GCM-256',
      key: toBase64(rawKey),
    },
  }
}

export const decryptAttachmentBytes = async (
  encrypted: ArrayBuffer,
  meta: AttachmentCryptoMeta
): Promise<ArrayBuffer> => {
  const keyRaw = fromBase64(meta.key)
  const aesKey = await sub().importKey('raw', keyRaw, { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
  const raw = new Uint8Array(encrypted)
  if (raw.byteLength <= ATTACHMENT_IV_LENGTH) throw new Error('Encrypted attachment quá ngắn')
  const iv = raw.slice(0, ATTACHMENT_IV_LENGTH)
  const ct = raw.slice(ATTACHMENT_IV_LENGTH)
  return sub().decrypt({ name: 'AES-GCM', iv }, aesKey, ct)
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
