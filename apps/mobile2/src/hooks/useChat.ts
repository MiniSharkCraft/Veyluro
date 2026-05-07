import { useEffect, useRef, useState, useCallback } from 'react'
import { WS_BASE, messagesApi, roomsApi, type AttachmentUploadType, type MemberType, type MessageType } from '../lib/api'
import { storage } from '../lib/storage'
import { encryptMessage, decryptMessage, type MessageBundle } from '../lib/crypto'

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

type ImageMessagePayload = {
  amoonType: 'image'
  text?: string
  attachment: AttachmentUploadType
}

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
    mergeMessages(decrypted.filter(Boolean) as ChatMsg[])
  }, [mergeMessages, roomId])

  useEffect(() => {
    let alive = true
    const init = async () => {
      try {
        const { userId, token } = await storage.getSession()
        const privateKey = await storage.getPrivateKey()
        if (!userId || !token || !privateKey) return
        sessionRef.current = { userId, token, privateKey }

        const memberList = await roomsApi.members(roomId)
        if (!alive) return
        membersRef.current = memberList
        setMembers(memberList)

        const history = await messagesApi.list(roomId)
        if (!alive) return
        const decrypted = await Promise.all(history.map(m => decryptHistoryMsg(m, userId, privateKey)))
        mergeMessages(decrypted.filter(Boolean) as ChatMsg[])
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
          const bundle: MessageBundle = typeof data.bundle === 'string'
            ? JSON.parse(data.bundle)
            : data.bundle
          const decrypted = parseDecryptedMessage(await decryptMessage(bundle, session.userId, session.privateKey))
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

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current
    if (!session || !text.trim()) return
    const tempId = `temp_${Date.now()}`
    const time = new Date().toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChatMsg = { id: tempId, clientId: tempId, text, senderId: session.userId, mine: true, time, status: 'sent', pending: true }
    setMessages(prev => [...prev, optimistic])
    try {
      const recipients = membersRef.current.filter(m => m.publicKey).map(m => ({ id: m.id, publicKey: m.publicKey }))
      if (recipients.length === 0) throw new Error('Không có recipient')
      const bundle = await encryptMessage(text, recipients)
      const bundleStr = JSON.stringify(bundle)
      const { id } = await messagesApi.send(roomId, bundleStr, tempId)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id, clientId: tempId, status: 'delivered', pending: false } : m))
    } catch (err) {
      console.error('[useChat] send:', err)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent', pending: false } : m))
    }
  }, [roomId])

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
    try {
      const uploaded = await messagesApi.uploadImage(roomId, file)
      const recipients = membersRef.current.filter(m => m.publicKey).map(m => ({ id: m.id, publicKey: m.publicKey }))
      if (recipients.length === 0) throw new Error('Không có recipient')
      const payload: ImageMessagePayload = { amoonType: 'image', text: '', attachment: uploaded }
      const bundle = await encryptMessage(JSON.stringify(payload), recipients)
      const { id } = await messagesApi.send(roomId, JSON.stringify(bundle), tempId)
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        id,
        clientId: tempId,
        text: '',
        attachment: uploaded,
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
    }
  }, [roomId])

  return { messages, members, connected, loading, sendMessage, sendImage, wsRef: ws }
}

async function decryptHistoryMsg(m: MessageType, myId: string, privateKey: CryptoKey): Promise<ChatMsg | null> {
  try {
    const bundle: MessageBundle = JSON.parse(m.bundle)
    const decrypted = parseDecryptedMessage(await decryptMessage(bundle, myId, privateKey))
    const time = new Date(m.createdAt * 1000).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    return { id: m.id, text: decrypted.text, attachment: decrypted.attachment, senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
  } catch { return null }
}

function parseDecryptedMessage(text: string): { text: string; attachment?: AttachmentUploadType } {
  try {
    const parsed = JSON.parse(text) as Partial<ImageMessagePayload>
    if (parsed?.amoonType === 'image' && parsed.attachment?.url) {
      return { text: parsed.text ?? '', attachment: parsed.attachment }
    }
  } catch {}
  return { text }
}
