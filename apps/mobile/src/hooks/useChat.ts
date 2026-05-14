import { useEffect, useRef, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Alert } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { WS_BASE, messagesApi, roomsApi, type AttachmentUploadType, type MemberType, type MessageType } from '../lib/api'
import { storage } from '../lib/storage'
import {
  encryptAttachmentBytes,
  encryptMessage,
  decryptAttachmentBytes,
  decryptMessage,
  ensureSignalForUser,
  normalizeEmoticons,
  publicKeyFingerprint,
  type SignalBundleJSON,
  type AttachmentCryptoMeta,
  type MessageBundle,
} from '../lib/crypto'
import { notifyIncomingMessage } from '../lib/notifications'
import { API_BASE_URL } from '../lib/runtimeConfig'

export type ChatMsg = {
  id: string
  clientId?: string
  text: string
  attachment?: AttachmentUploadType & { localUri?: string }
  senderId: string
  mine: boolean
  time: string
  status: 'sent' | 'delivered' | 'read'
  pending?: boolean
}

type AttachmentMessagePayload = {
  amoonType: 'image' | 'attachment'
  text?: string
  attachment: AttachmentUploadType
}

const E2EE_DEBUG =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  String(process.env.EXPO_PUBLIC_E2EE_DEBUG ?? '').trim() === '1'
let shownKeyDebugAlert = false
const attachmentDecryptCache = new Map<string, Promise<string>>()

export function useChat(roomId: string) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [members, setMembers] = useState<MemberType[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const ws = useRef<WebSocket | null>(null)
  const sessionRef = useRef<{ userId: string; token: string; privateKey: CryptoKey } | null>(null)
  const membersRef = useRef<MemberType[]>([])

  const mergeMessages = useCallback((incoming: ChatMsg[]) => {
    if (incoming.length === 0) return
    setMessages(prev => {
      const byId = new Map(prev.map(m => [m.id, m]))
      for (const msg of incoming) {
        byId.set(msg.id, { ...byId.get(msg.id), ...msg })
      }
      return Array.from(byId.values())
    })
  }, [])

  const refreshHistory = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    const history = await messagesApi.list(roomId)
    const decrypted = await Promise.all(history.map(m => decryptHistoryMsg(m, session.userId, session.privateKey)))
    mergeMessages(decrypted)
  }, [mergeMessages, roomId])

  useEffect(() => {
    let alive = true
    const init = async () => {
      try {
        const { userId, token } = await storage.getSession()
        const privateKey = await storage.getPrivateKey()
        if (!userId || !token || !privateKey) return
        await ensureSignalForUser(userId)
        sessionRef.current = { userId, token, privateKey }

        const localPublicKey = await SecureStore.getItemAsync(`publicKey_${userId}`)
        if (localPublicKey) {
          const fingerprint = await publicKeyFingerprint(localPublicKey)
          fetch(`${API_BASE_URL}/api/auth/register-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ publicKey: localPublicKey, fingerprint }),
          }).catch(() => {})
        }

        const memberList = await roomsApi.members(roomId)
        if (!alive) return
        membersRef.current = memberList
        setMembers(memberList)

        if (E2EE_DEBUG && !shownKeyDebugAlert) {
          const localPublicKey = await SecureStore.getItemAsync(`publicKey_${userId}`)
          const me = memberList.find(m => m.id === userId)
          const localFp = localPublicKey ? await publicKeyFingerprint(localPublicKey) : '(missing local public key)'
          const serverFp = me?.fingerprint?.trim() || '(missing server fingerprint)'
          const same = localFp !== '(missing local public key)' && serverFp !== '(missing server fingerprint)' && localFp === serverFp
          shownKeyDebugAlert = true
          Alert.alert(
            'E2EE Debug',
            `Local FP: ${localFp}\nServer FP: ${serverFp}\nMatch: ${same ? 'YES' : 'NO'}`
          )
        }

        const history = await messagesApi.list(roomId)
        if (!alive) return
        const decrypted = await Promise.all(history.map(m => decryptHistoryMsg(m, userId, privateKey)))
        mergeMessages(decrypted)
      } catch (e) {
        console.warn('[useChat] init:', e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    init()
    return () => { alive = false }
  }, [mergeMessages, roomId])

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      const { userId, token } = await storage.getSession()
      const privateKey = await storage.getPrivateKey()
      if (!userId || !token || !privateKey || cancelled) return
      sessionRef.current = { userId, token, privateKey }
      const socket = new WebSocket(`${WS_BASE}/ws?room=${roomId}&token=${token}`)
      ws.current = socket
      socket.onopen = () => {
        setConnected(true)
        refreshHistory().catch(err => console.warn('[useChat] refresh:', err))
      }
      socket.onclose = () => {
        setConnected(false)
        if (!cancelled) setTimeout(connect, 3000)
      }
      socket.onerror = () => socket.close()
      socket.onmessage = async (e) => {
        try {
          const frame = JSON.parse(e.data as string)
          // Route WebRTC signaling frames to call handlers
          if (frame.type === 'room-updated') {
            return
          }
          if (frame.type && frame.type !== 'message') {
            if (frame.type.startsWith('group-call-')) {
              ;(globalThis as any).__groupCallHandler?.(frame)
            } else {
              ;(globalThis as any).__voiceCallHandler?.(frame)
            }
            return
          }
          if (frame.type !== 'message') return
          const session = sessionRef.current
          if (!session) return
          const data = frame.data ?? frame
          const rawBundle: MessageBundle = typeof data.bundle === 'string'
            ? JSON.parse(data.bundle)
            : data.bundle
          const bundle = { ...(rawBundle as any), senderId: data.senderId }
          const decrypted = await parseDecryptedMessage(await decryptMessage(bundle, session.userId, session.privateKey))
          const time = new Date(data.createdAt ? data.createdAt * 1000 : Date.now())
            .toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
          const msg: ChatMsg = {
            id: data.id ?? Date.now().toString(),
            clientId: data.clientId,
            text: decrypted.text,
            attachment: decrypted.attachment,
            senderId: data.senderId,
            mine: data.senderId === session.userId,
            time, status: 'delivered',
          }
          const isMuted = msg.mine ? false : await storage.isUserMuted(msg.senderId)
          if (!msg.mine && !isMuted) {
            const sender = membersRef.current.find(m => m.id === msg.senderId)
            const title = sender ? `@${sender.username}` : 'Tin nhắn mới'
            const preview = msg.attachment?.kind === 'image'
              ? 'Đã gửi một ảnh'
              : msg.attachment?.kind === 'file'
                ? 'Đã gửi một tệp'
                : (msg.text || 'Tin nhắn mới')
            notifyIncomingMessage(title, preview).catch(() => {})
          }
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            if (msg.mine && msg.clientId) {
              const optimisticIndex = prev.findIndex(m => m.id === msg.clientId || m.clientId === msg.clientId)
              if (optimisticIndex >= 0) {
                const next = [...prev]
                next[optimisticIndex] = { ...next[optimisticIndex], ...msg, pending: false }
                return next
              }
            }
            return [...prev, msg]
          })
        } catch (err) {
          console.warn('[useChat] decrypt:', err)
        }
      }
    }
    connect()
    return () => {
      cancelled = true
      ws.current?.close()
      ws.current = null
    }
  }, [refreshHistory, roomId])

  const buildRecipients = useCallback((myUserId: string) => {
    return membersRef.current
      .filter(m => m.id !== myUserId)
      .map(m => {
        let signalBundle: SignalBundleJSON | null = null
        if ((m as any).signalBundle && typeof (m as any).signalBundle === 'string') {
          try { signalBundle = JSON.parse((m as any).signalBundle) as SignalBundleJSON } catch {}
        } else if ((m as any).signalBundle && typeof (m as any).signalBundle === 'object') {
          signalBundle = (m as any).signalBundle as SignalBundleJSON
        }
        return { id: m.id, publicKey: m.publicKey, signalBundle }
      })
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current
    if (!session || !text.trim()) return
    const normalized = normalizeEmoticons(text)
    const tempId = `temp_${Date.now()}`
    const time = new Date().toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChatMsg = { id: tempId, clientId: tempId, text: normalized, senderId: session.userId, mine: true, time, status: 'sent', pending: true }
    setMessages(prev => [...prev, optimistic])
    try {
      const recipients = buildRecipients(session.userId)
      if (recipients.length === 0) throw new Error('Không có recipient')
      const bundle = await encryptMessage(normalized, recipients)
      const bundleStr = JSON.stringify(bundle)
      const { id } = await messagesApi.send(roomId, bundleStr, tempId)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id, clientId: tempId, status: 'delivered', pending: false } : m))
    } catch (err) {
      console.error('[useChat] send:', err)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent', pending: false } : m))
    }
  }, [buildRecipients, roomId])

  const sendImage = useCallback(async (file: { uri: string; name: string; type: string; size?: number }) => {
    const session = sessionRef.current
    if (!session) return
    if (file.size && file.size > 50 * 1024 * 1024) throw new Error('Ảnh tối đa 50MB')
    const tempId = `temp_img_${Date.now()}`
    const time = new Date().toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChatMsg = {
      id: tempId,
      clientId: tempId,
      text: 'Đang gửi ảnh...',
      attachment: { kind: 'image', url: file.uri, localUri: file.uri, key: '', mime: file.type, size: file.size ?? 0, name: file.name },
      senderId: session.userId,
      mine: true,
      time,
      status: 'sent',
      pending: true,
    }
    setMessages(prev => [...prev, optimistic])
    let encryptedTempFile: File | null = null
    try {
      const plainBytes = await readUriBytes(file.uri)
      const { encrypted, meta } = await encryptAttachmentBytes(asArrayBuffer(plainBytes))
      encryptedTempFile = writeEncryptedTempFile(encrypted)
      const uploaded = await messagesApi.uploadImage(
        roomId,
        {
          uri: encryptedTempFile.uri,
          name: `${basenameWithoutExt(file.name)}.enc.bin`,
          type: 'application/octet-stream',
        },
        {
          encrypted: true,
          originalMime: file.type,
          originalName: file.name,
        }
      )

      const recipients = buildRecipients(session.userId)
      if (recipients.length === 0) throw new Error('Không có recipient')

      const attachment: AttachmentUploadType & { localUri?: string } = {
        ...uploaded,
        kind: file.type.toLowerCase().startsWith('image/') ? 'image' : 'file',
        encrypted: true,
        originalMime: uploaded.originalMime || file.type,
        originalName: uploaded.originalName || file.name,
        crypto: meta,
        localUri: file.uri,
      }
      const payload: AttachmentMessagePayload = { amoonType: 'attachment', text: '', attachment }
      const bundle = await encryptMessage(JSON.stringify(payload), recipients)
      const { id } = await messagesApi.send(roomId, JSON.stringify(bundle), tempId)
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        id,
        clientId: tempId,
        text: '',
        attachment,
        status: 'delivered',
        pending: false,
      } : m))
    } catch (err) {
      console.error('[useChat] send image:', err)
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        text: err instanceof Error ? err.message : 'Gửi ảnh thất bại',
        pending: false,
      } : m))
      throw err
    } finally {
      try {
        encryptedTempFile?.delete()
      } catch {}
    }
  }, [buildRecipients, roomId])

  return { messages, members, connected, loading, sendMessage, sendImage, wsRef: ws }
}

async function decryptHistoryMsg(m: MessageType, myId: string, privateKey: CryptoKey): Promise<ChatMsg> {
  const time = new Date(m.createdAt * 1000).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
  try {
    const bundle: MessageBundle = JSON.parse(m.bundle)
    const decrypted = await parseDecryptedMessage(await decryptMessage({ ...(bundle as any), senderId: m.senderId }, myId, privateKey))
    return { id: m.id, text: decrypted.text, attachment: decrypted.attachment, senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
  } catch {
    if (!E2EE_DEBUG) {
      return { id: m.id, text: '[encrypted]', senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
    }
    try {
      const raw = JSON.parse(m.bundle) as MessageBundle
      const hasMyKey = Boolean(raw?.sessionKeys && raw.sessionKeys[myId])
      const reason = hasMyKey ? 'key-mismatch-or-corrupt' : 'missing-session-key-for-me'
      return { id: m.id, text: `[encrypted:${reason}]`, senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
    } catch {
      return { id: m.id, text: '[encrypted:invalid-bundle-json]', senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
    }
  }
}

async function parseDecryptedMessage(text: string): Promise<{ text: string; attachment?: AttachmentUploadType & { localUri?: string } }> {
  try {
    const parsed = JSON.parse(text) as Partial<AttachmentMessagePayload>
    if ((parsed?.amoonType === 'image' || parsed?.amoonType === 'attachment') && parsed.attachment?.url) {
      const attachment = await hydrateAttachment(parsed.attachment)
      const fallbackText = attachment.kind === 'file'
        ? `Tệp: ${attachment.originalName || attachment.name || 'unknown'}`
        : ''
      return { text: parsed.text?.trim() ? parsed.text : fallbackText, attachment }
    }
  } catch {}
  return { text }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out.buffer
}

function basenameWithoutExt(name: string): string {
  const safe = (name || 'attachment').trim()
  const dot = safe.lastIndexOf('.')
  if (dot <= 0) return safe || 'attachment'
  return safe.slice(0, dot)
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri)
  return file.bytes()
}

function writeEncryptedTempFile(encrypted: ArrayBuffer): File {
  const file = new File(Paths.cache, `e2ee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.bin`)
  file.create({ overwrite: true, intermediates: true })
  file.write(new Uint8Array(encrypted))
  return file
}

function attachmentCacheKey(attachment: AttachmentUploadType): string {
  const cryptoKey = attachment.crypto?.key ?? ''
  return `${attachment.url}|${attachment.key}|${cryptoKey}`
}

async function hydrateAttachment(
  attachment: AttachmentUploadType
): Promise<AttachmentUploadType & { localUri?: string }> {
  if (!attachment?.encrypted || !attachment?.crypto) {
    return attachment
  }
  try {
    const localUri = await getDecryptedAttachmentUri(attachment)
    return { ...attachment, localUri }
  } catch (err) {
    console.warn('[useChat] decrypt attachment:', err)
    return attachment
  }
}

async function getDecryptedAttachmentUri(attachment: AttachmentUploadType): Promise<string> {
  const key = attachmentCacheKey(attachment)
  const cached = attachmentDecryptCache.get(key)
  if (cached) return cached
  const task = decryptAttachmentToCache(attachment)
  attachmentDecryptCache.set(key, task)
  try {
    return await task
  } catch (err) {
    attachmentDecryptCache.delete(key)
    throw err
  }
}

async function decryptAttachmentToCache(attachment: AttachmentUploadType): Promise<string> {
  if (!attachment.crypto) throw new Error('Attachment thiếu crypto metadata')
  const token = await storage.getToken()
  const res = await fetch(attachment.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error(`Không tải được attachment (${res.status})`)
  const encryptedBuf = await res.arrayBuffer()
  const plainBuf = await decryptAttachmentBytes(encryptedBuf, attachment.crypto as AttachmentCryptoMeta)
  const ext = inferAttachmentExt(attachment)
  const file = new File(Paths.cache, `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
  file.create({ overwrite: true, intermediates: true })
  file.write(new Uint8Array(plainBuf))
  return file.uri
}

function inferAttachmentExt(attachment: AttachmentUploadType): string {
  const fromName = attachment.originalName || attachment.name || ''
  const dot = fromName.lastIndexOf('.')
  if (dot > 0 && dot < fromName.length-1) {
    const ext = fromName.slice(dot).toLowerCase()
    if (ext.length <= 12) return ext
  }
  return extFromMime(attachment.originalMime || attachment.mime)
}

function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/heic':
    case 'image/heif':
      return '.heic'
    case 'application/pdf':
      return '.pdf'
    case 'video/mp4':
      return '.mp4'
    case 'audio/mpeg':
      return '.mp3'
    case 'audio/mp4':
    case 'audio/aac':
      return '.m4a'
    default:
      return '.bin'
  }
}
