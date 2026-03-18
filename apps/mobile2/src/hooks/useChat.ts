import { useEffect, useRef, useState, useCallback } from 'react'
import { WS_BASE, messagesApi, roomsApi, type MemberType, type MessageType } from '../lib/api'
import { storage } from '../lib/storage'
import { encryptMessage, decryptMessage, type MessageBundle } from '../lib/crypto'

export type ChatMsg = {
  id: string
  text: string
  senderId: string
  mine: boolean
  time: string
  status: 'sent' | 'delivered' | 'read'
  pending?: boolean
}

export function useChat(roomId: string) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [members, setMembers] = useState<MemberType[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const ws = useRef<WebSocket | null>(null)
  const sessionRef = useRef<{ userId: string; token: string; privateKey: CryptoKey } | null>(null)

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
        setMembers(memberList)

        const history = await messagesApi.list(roomId)
        if (!alive) return
        const decrypted = await Promise.all(history.map(m => decryptHistoryMsg(m, userId, privateKey)))
        setMessages(decrypted.filter(Boolean) as ChatMsg[])
      } catch (e) {
        console.warn('[useChat] init:', e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    init()
    return () => { alive = false }
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      const { userId, token } = await storage.getSession()
      if (!userId || !token || cancelled) return
      const socket = new WebSocket(`${WS_BASE}/ws?room=${roomId}&token=${token}`)
      ws.current = socket
      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        setConnected(false)
        if (!cancelled) setTimeout(connect, 3000)
      }
      socket.onerror = () => socket.close()
      socket.onmessage = async (e) => {
        try {
          const frame = JSON.parse(e.data as string)
          // Route WebRTC signaling frames to call handlers
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
          const text = await decryptMessage(bundle, session.userId, session.privateKey)
          const time = new Date(data.createdAt ? data.createdAt * 1000 : Date.now())
            .toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
          const msg: ChatMsg = {
            id: data.id ?? Date.now().toString(),
            text, senderId: data.senderId,
            mine: data.senderId === session.userId,
            time, status: 'delivered',
          }
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
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
  }, [roomId])

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current
    if (!session || !text.trim()) return
    const tempId = `temp_${Date.now()}`
    const time = new Date().toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChatMsg = { id: tempId, text, senderId: session.userId, mine: true, time, status: 'sent', pending: true }
    setMessages(prev => [...prev, optimistic])
    try {
      const recipients = members.filter(m => m.publicKey).map(m => ({ id: m.id, publicKey: m.publicKey }))
      if (recipients.length === 0) throw new Error('Không có recipient')
      const bundle = await encryptMessage(text, recipients)
      const bundleStr = JSON.stringify(bundle)
      const { id } = await messagesApi.send(roomId, bundleStr)
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'message', data: { id, senderId: session.userId, bundle: bundleStr } }))
      }
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id, status: 'delivered', pending: false } : m))
    } catch (err) {
      console.error('[useChat] send:', err)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent', pending: false } : m))
    }
  }, [members, roomId])

  return { messages, members, connected, loading, sendMessage, wsRef: ws }
}

async function decryptHistoryMsg(m: MessageType, myId: string, privateKey: CryptoKey): Promise<ChatMsg | null> {
  try {
    const bundle: MessageBundle = JSON.parse(m.bundle)
    const text = await decryptMessage(bundle, myId, privateKey)
    const time = new Date(m.createdAt * 1000).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
    return { id: m.id, text, senderId: m.senderId, mine: m.senderId === myId, time, status: 'read' }
  } catch { return null }
}
