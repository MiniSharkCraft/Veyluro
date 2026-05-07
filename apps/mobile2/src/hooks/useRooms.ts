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
      setRooms(await roomsApi.list())
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
