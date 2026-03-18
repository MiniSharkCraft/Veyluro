import { useState, useEffect, useCallback } from 'react'
import { roomsApi, type RoomType } from '../lib/api'

export function useRooms() {
  const [rooms, setRooms] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)

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
