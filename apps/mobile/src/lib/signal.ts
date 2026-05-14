import * as SecureStore from 'expo-secure-store'
import {
  Direction,
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type MessageType,
  type KeyPairType,
  type PreKeyType,
  type SignedPublicPreKeyType,
  type StorageType,
} from '@privacyresearch/libsignal-protocol-typescript'

const DEVICE_ID = 1
const PREKEY_BATCH = 20
const SIGNAL_STORE_KEY = (userId: string) => `signal_store_${userId}`

type PersistedStore = {
  registrationId: number
  identityKeyPair: {
    pubKey: string
    privKey: string
  }
  preKeys: Record<string, { pubKey: string; privKey: string }>
  signedPreKeys: Record<string, { pubKey: string; privKey: string }>
  sessions: Record<string, string>
  trusted: Record<string, string>
  nextPreKeyId: number
  signedPreKeyId: number
  signedPreKeySignature: string
}

export type SignalBundleJSON = {
  registrationId: number
  deviceId: number
  identityKey: string
  signedPreKey: {
    keyId: number
    publicKey: string
    signature: string
  }
  oneTimePreKeys: Array<{
    keyId: number
    publicKey: string
  }>
}

type MessageBundleV2 = {
  v: 2
  alg: 'signal'
  ciphertexts: Record<string, { type: number; body: string; registrationId?: number; deviceId?: number }>
}

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const fromBase64 = (b64: string): ArrayBuffer => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const encodeKeyPair = (kp: KeyPairType): { pubKey: string; privKey: string } => ({
  pubKey: toBase64(kp.pubKey),
  privKey: toBase64(kp.privKey),
})

const decodeKeyPair = (kp: { pubKey: string; privKey: string }): KeyPairType => ({
  pubKey: fromBase64(kp.pubKey),
  privKey: fromBase64(kp.privKey),
})

class SignalProtocolStore implements StorageType {
  constructor(private state: PersistedStore, private save: () => Promise<void>) {}

  async getIdentityKeyPair() {
    return decodeKeyPair(this.state.identityKeyPair)
  }

  async getLocalRegistrationId() {
    return this.state.registrationId
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, _direction: Direction) {
    const known = this.state.trusted[identifier]
    if (!known) return true
    return known === toBase64(identityKey)
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer) {
    const encoded = toBase64(publicKey)
    const old = this.state.trusted[encodedAddress]
    this.state.trusted[encodedAddress] = encoded
    await this.save()
    return !!old && old !== encoded
  }

  async loadPreKey(keyId: string | number) {
    const val = this.state.preKeys[String(keyId)]
    return val ? decodeKeyPair(val) : undefined
  }

  async storePreKey(keyId: string | number, keyPair: KeyPairType) {
    this.state.preKeys[String(keyId)] = encodeKeyPair(keyPair)
    await this.save()
  }

  async removePreKey(keyId: string | number) {
    delete this.state.preKeys[String(keyId)]
    await this.save()
  }

  async storeSession(encodedAddress: string, record: string) {
    this.state.sessions[encodedAddress] = record
    await this.save()
  }

  async loadSession(encodedAddress: string) {
    return this.state.sessions[encodedAddress]
  }

  async loadSignedPreKey(keyId: string | number) {
    const val = this.state.signedPreKeys[String(keyId)]
    return val ? decodeKeyPair(val) : undefined
  }

  async storeSignedPreKey(keyId: string | number, keyPair: KeyPairType) {
    this.state.signedPreKeys[String(keyId)] = encodeKeyPair(keyPair)
    await this.save()
  }

  async removeSignedPreKey(keyId: string | number) {
    delete this.state.signedPreKeys[String(keyId)]
    await this.save()
  }
}

let activeUserId: string | null = null
let activeState: PersistedStore | null = null
let activeStore: SignalProtocolStore | null = null

async function saveState(userId: string, state: PersistedStore) {
  await SecureStore.setItemAsync(SIGNAL_STORE_KEY(userId), JSON.stringify(state))
}

async function loadState(userId: string): Promise<PersistedStore | null> {
  const raw = await SecureStore.getItemAsync(SIGNAL_STORE_KEY(userId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistedStore
  } catch {
    return null
  }
}

async function createInitialState(userId: string): Promise<PersistedStore> {
  const registrationId = KeyHelper.generateRegistrationId()
  const identityKeyPair = await KeyHelper.generateIdentityKeyPair()
  const signedPreKeyId = Math.floor(Math.random() * 1_000_000) + 1
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId)

  const preKeys: PersistedStore['preKeys'] = {}
  let nextPreKeyId = Math.floor(Math.random() * 1_000_000) + 10
  for (let i = 0; i < PREKEY_BATCH; i++) {
    const preKey = await KeyHelper.generatePreKey(nextPreKeyId + i)
    preKeys[String(preKey.keyId)] = encodeKeyPair(preKey.keyPair)
  }
  nextPreKeyId += PREKEY_BATCH

  const state: PersistedStore = {
    registrationId,
    identityKeyPair: encodeKeyPair(identityKeyPair),
    preKeys,
    signedPreKeys: {
      [String(signedPreKeyId)]: encodeKeyPair(signedPreKey.keyPair),
    },
    sessions: {},
    trusted: {},
    nextPreKeyId,
    signedPreKeyId,
    signedPreKeySignature: toBase64(signedPreKey.signature),
  }
  await saveState(userId, state)
  return state
}

export async function ensureSignalReady(userId: string): Promise<void> {
  if (activeUserId === userId && activeStore && activeState) return
  let state = await loadState(userId)
  if (!state) state = await createInitialState(userId)
  activeUserId = userId
  activeState = state
  activeStore = new SignalProtocolStore(state, async () => {
    if (activeUserId && activeState) await saveState(activeUserId, activeState)
  })
}

function requireStore() {
  if (!activeStore || !activeState || !activeUserId) {
    throw new Error('Signal store chưa được init')
  }
  return { store: activeStore, state: activeState, userId: activeUserId }
}

export function buildPublicSignalBundle(): SignalBundleJSON {
  const { state } = requireStore()
  const identityKey = state.identityKeyPair.pubKey
  const signed = state.signedPreKeys[String(state.signedPreKeyId)]
  const oneTimePreKeys = Object.entries(state.preKeys).slice(0, PREKEY_BATCH).map(([k, v]) => ({
    keyId: Number(k),
    publicKey: v.pubKey,
  }))

  return {
    registrationId: state.registrationId,
    deviceId: DEVICE_ID,
    identityKey,
    signedPreKey: {
      keyId: state.signedPreKeyId,
      publicKey: signed.pubKey,
      signature: state.signedPreKeySignature,
    },
    oneTimePreKeys,
  }
}

function parseRecipientBundle(bundle: SignalBundleJSON): DeviceType<ArrayBuffer> {
  const preKey = bundle.oneTimePreKeys[0]
  if (!preKey) throw new Error('Recipient không còn one-time prekey')

  const signedPreKey: SignedPublicPreKeyType<ArrayBuffer> = {
    keyId: bundle.signedPreKey.keyId,
    publicKey: fromBase64(bundle.signedPreKey.publicKey),
    signature: bundle.signedPreKey.signature ? fromBase64(bundle.signedPreKey.signature) : new Uint8Array().buffer,
  }

  const device: DeviceType<ArrayBuffer> = {
    registrationId: bundle.registrationId,
    identityKey: fromBase64(bundle.identityKey),
    signedPreKey,
    preKey: {
      keyId: preKey.keyId,
      publicKey: fromBase64(preKey.publicKey),
    } as PreKeyType<ArrayBuffer>,
  }
  return device
}

async function ensureSessionWithRecipient(recipientId: string, bundle: SignalBundleJSON) {
  const { store } = requireStore()
  const address = new SignalProtocolAddress(recipientId, bundle.deviceId || DEVICE_ID)
  const builder = new SessionBuilder(store, address)
  await builder.processPreKey(parseRecipientBundle(bundle))
}

export async function signalEncryptMessage(
  plaintext: string,
  recipients: Array<{ id: string; signalBundle: SignalBundleJSON | null }>
): Promise<MessageBundleV2> {
  const { store } = requireStore()
  const bytes = new TextEncoder().encode(plaintext).buffer
  const ciphertexts: MessageBundleV2['ciphertexts'] = {}

  for (const r of recipients) {
    if (!r.signalBundle) continue
    await ensureSessionWithRecipient(r.id, r.signalBundle)
    const address = new SignalProtocolAddress(r.id, r.signalBundle.deviceId || DEVICE_ID)
    const cipher = new SessionCipher(store, address)
    const enc: MessageType = await cipher.encrypt(bytes)
    if (!enc.body) {
      throw new Error('Signal encrypt returned empty body')
    }
    ciphertexts[r.id] = {
      type: enc.type,
      body: typeof enc.body === 'string' ? enc.body : toBase64(enc.body),
      registrationId: enc.registrationId,
      deviceId: r.signalBundle.deviceId || DEVICE_ID,
    }
  }

  return { v: 2, alg: 'signal', ciphertexts }
}

export async function signalDecryptMessage(bundle: MessageBundleV2, senderId: string): Promise<string> {
  const { store, userId } = requireStore()
  const payload = bundle.ciphertexts[userId]
  if (!payload) throw new Error('No signal ciphertext for current user')
  const address = new SignalProtocolAddress(senderId, payload.deviceId || DEVICE_ID)
  const cipher = new SessionCipher(store, address)
  let plain: ArrayBuffer
  if (payload.type === 3) {
    plain = await cipher.decryptPreKeyWhisperMessage(payload.body, 'binary')
  } else {
    plain = await cipher.decryptWhisperMessage(payload.body, 'binary')
  }
  return new TextDecoder().decode(new Uint8Array(plain))
}
