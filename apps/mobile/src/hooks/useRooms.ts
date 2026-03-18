import { useState, useEffect, useCallback } from 'react'
import { roomsApi, type RoomType } from '../lib/api'

export function useRooms() {
  const [rooms, setRooms] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      setError(null)
      const data = await roomsApi.list()
      setRooms(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi tải danh sách phòng')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRooms() }, [])

  // Tạo DM với user khác theo username
  const startDm = useCallback(async (targetUsername: string): Promise<string> => {
    const { roomId } = await roomsApi.startDm(targetUsername)
    await fetchRooms() // Refresh danh sách
    return roomId
  }, [fetchRooms])

  return { rooms, loading, error, refetch: fetchRooms, startDm }
}
