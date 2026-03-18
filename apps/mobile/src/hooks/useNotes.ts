import { useState, useEffect, useCallback } from 'react'
import { notesApi, type NoteType } from '../lib/api'

export function useNotes() {
  const [notes, setNotes] = useState<NoteType[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotes = useCallback(async () => {
    try {
      const data = await notesApi.list()
      const now = Math.floor(Date.now() / 1000)
      setNotes(data.filter(n => n.expiresAt > now))
    } catch (e) {
      console.warn('[useNotes]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotes() }, [])

  const addNote = useCallback(async (content: string): Promise<NoteType> => {
    const { id, expiresAt } = await notesApi.create(content)
    const newNote: NoteType = {
      id,
      userId: '', // sẽ biết sau khi refetch
      content,
      expiresAt,
      createdAt: Math.floor(Date.now() / 1000),
    }
    setNotes(prev => [newNote, ...prev])
    return newNote
  }, [])

  const deleteMyNote = useCallback(async (noteId: string) => {
    await notesApi.delete(noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }, [])

  const timeLeft = (expiresAt: number): string => {
    const diff = expiresAt - Math.floor(Date.now() / 1000)
    if (diff <= 0) return 'Hết hạn'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}g` : `${m}p`
  }

  return { notes, loading, addNote, deleteMyNote, timeLeft, refetch: fetchNotes }
}
