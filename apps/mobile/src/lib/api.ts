/**
 * API client — tự gắn Authorization header, throw lỗi chuẩn
 */
import { storage } from './storage'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'
export const WS_BASE = BASE.replace(/^http/, 'ws')

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new ApiError(res.status, body.error ?? 'Lỗi không xác định')
  }
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ─── Typed endpoints ──────────────────────────────────────────────────────────
export type RoomType = {
  id: string
  name: string
  type: 'dm' | 'group'
  createdAt: number
  created_at?: number
}
export type MemberType = {
  id: string
  username: string
  publicKey: string
  fingerprint: string
}
export type MessageType = {
  id: string
  roomId: string
  senderId: string
  bundle: string
  createdAt: number
}
export type NoteType = {
  id: string
  userId: string
  content: string
  expiresAt: number
  createdAt: number
  username?: string
  expires_at?: number
  created_at?: number
}

export const roomsApi = {
  list: () => api.get<RoomType[]>('/api/rooms'),
  members: (roomId: string) => api.get<MemberType[]>(`/api/rooms/${roomId}/members`),
  startDm: (targetUsername: string) =>
    api.post<{ roomId: string; status: string }>('/api/rooms/dm', { targetUsername }),
}

export const messagesApi = {
  list: (roomId: string, before?: number) =>
    api.get<MessageType[]>(
      `/api/messages/${roomId}${before ? `?before=${before}` : ''}`
    ),
  send: (roomId: string, bundle: string) =>
    api.post<{ id: string }>(`/api/messages/${roomId}`, { bundle }),
}

export const notesApi = {
  list: () => api.get<NoteType[]>('/api/notes'),
  create: (content: string) => api.post<{ id: string; expiresAt: number }>('/api/notes', { content }),
  delete: (noteId: string) => api.delete<{ status: string }>(`/api/notes/${noteId}`),
}

export const usersApi = {
  registerKey: (publicKey: string, fingerprint: string) =>
    api.post<{ status: string }>('/api/auth/register-key', { publicKey, fingerprint }),
}
