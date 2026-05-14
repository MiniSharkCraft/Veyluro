import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import { WS_BASE, roomsApi, type RoomType } from '../lib/api'
import { storage } from '../lib/storage'

export function useRooms() {
  const [rooms, setRooms] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      const baseRooms = await roomsApi.list()
      const myId = await storage.getUserId()
      if (!myId) {
        setRooms(baseRooms)
        return
      }

      const missingAvatars = baseRooms.filter(r => r.type === 'dm' && !r.avatarUrl && !r.avatarThumbUrl)
      if (!missingAvatars.length) {
        setRooms(baseRooms)
        return
      }

      const memberRows = await Promise.all(
        missingAvatars.map(async room => {
          try {
            const members = await roomsApi.members(room.id)
            const other = members.find(m => m.id !== myId)
            return { roomId: room.id, avatarUrl: other?.avatarUrl, avatarThumbUrl: other?.avatarThumbUrl }
          } catch {
            return { roomId: room.id, avatarUrl: undefined, avatarThumbUrl: undefined }
          }
        }),
      )

      const avatarByRoom = new Map(memberRows.map(m => [m.roomId, m]))
      setRooms(baseRooms.map(room => {
        if (room.type !== 'dm' || room.avatarUrl || room.avatarThumbUrl) return room
        const fallback = avatarByRoom.get(room.id)
        if (!fallback) return room
        return {
          ...room,
          avatarUrl: fallback.avatarUrl ?? room.avatarUrl,
          avatarThumbUrl: fallback.avatarThumbUrl ?? room.avatarThumbUrl,
        }
      }))
    } catch (e) {
      console.warn('[useRooms]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null
      fetchRooms()
    }, 120)
  }, [fetchRooms])

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      const token = await storage.getToken()
      if (!token || cancelled) return

      socket = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`)
      socket.onopen = () => scheduleRefetch()
      socket.onmessage = event => {
        try {
          const frame = JSON.parse(event.data as string)
          if (frame.type === 'room-updated' || frame.type === 'room-created' || frame.type === 'room-members-changed') {
            scheduleRefetch()
            return
          }
          if (typeof frame.type === 'string' && (frame.type.startsWith('call-') || frame.type.startsWith('group-call-'))) {
            if (frame.type.startsWith('group-call-')) {
              ;(globalThis as any).__groupCallHandler?.(frame)
            } else {
              ;(globalThis as any).__voiceCallHandler?.(frame)
            }
          }
        } catch {
          // Ignore non-JSON frames.
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 2500)
      }
    }

    connect()
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') scheduleRefetch()
    })

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      sub.remove()
      socket?.close()
    }
  }, [scheduleRefetch])

  const startDm = useCallback(async (targetUsername: string) => {
    const res = await roomsApi.startDm(targetUsername)
    await fetchRooms()
    return res.id
  }, [fetchRooms])

  const createGroup = useCallback(async (name: string, members: string[]) => {
    const res = await roomsApi.createGroup(name, members)
    await fetchRooms()
    return res.id
  }, [fetchRooms])

  const leaveGroup = useCallback(async (roomId: string) => {
    await roomsApi.leaveGroup(roomId)
    await fetchRooms()
  }, [fetchRooms])

  return { rooms, loading, refetch: fetchRooms, startDm, createGroup, leaveGroup }
}
