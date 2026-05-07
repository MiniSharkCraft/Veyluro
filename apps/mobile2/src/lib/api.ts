import { storage } from './storage'
import { API_BASE_URL, WS_BASE_URL } from './runtimeConfig'

const BASE = API_BASE_URL
export const WS_BASE = WS_BASE_URL

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function responseErrorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    return (body as { error?: string; message?: string }).error
      ?? (body as { error?: string; message?: string }).message
      ?? `Server ${status}`
  }
  if (typeof body === 'string' && body.trim().startsWith('<')) {
    return `Server trả về HTML thay vì JSON (${status}). Kiểm tra lại API URL/reverse proxy.`
  }
  return typeof body === 'string' && body.trim() ? body : `Server ${status}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await parseResponseBody(res)
    if (body && typeof body === 'object') {
      throw new ApiError(res.status, responseErrorMessage(body, res.status))
    }
    throw new ApiError(res.status, responseErrorMessage(body, res.status))
  }
  const body = await parseResponseBody(res)
  return body as T
}

// ── Types ──────────────────────────────────────────────────────────────────

export type RoomType = {
  id: string
  name: string
  type: 'dm' | 'group'
  groupAdminId?: string
  memberCount?: number
  lastMessage?: string
  lastMessageAt?: number
  unreadCount?: number
}
export type BlockedUserType = {
  id: string
  username: string
  createdAt: number
}
export type MemberType = {
  id: string
  username: string
  displayName?: string
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
export type StoryType = {
  id: string
  userId: string
  username?: string
  displayName?: string
  content: string
  expiresAt: number
  createdAt: number
}
export type FriendType = {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
  avatarThumbUrl?: string
  publicKey?: string
  friendId: string
}
export type FriendRequestType = {
  id: string
  fromId: string
  username: string
  publicKey?: string
  createdAt: number
}
export type SearchUserType = {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
  avatarThumbUrl?: string
  publicKey?: string
}
export type PendingMessageType = {
  id: string
  fromUserId: string
  fromUsername: string
  bundle: string
  createdAt: number
}
export type ProfileType = {
  id: string
  username: string
  displayName?: string
  bio?: string
  avatarUrl?: string
  avatarThumbUrl?: string
  publicKey?: string
  totpEnabled: boolean
  isAdmin: boolean
}
export type UpdateProfileResponse = {
  status: string
  username?: string
  token?: string
}
export type ReportType = {
  id: string
  reason: string
  detail?: string
  status: string
  adminNote?: string
  createdAt: number
  reporterUsername: string
  reporterId: string
  reportedUsername: string
  reportedId: string
}

// ── API Namespaces ─────────────────────────────────────────────────────────

export const roomsApi = {
  list: () => request<RoomType[]>('/api/rooms'),
  members: (roomId: string) => request<MemberType[]>(`/api/rooms/${roomId}/members`),
  startDm: (username: string) => request<{ id: string }>('/api/rooms/dm', {
    method: 'POST', body: JSON.stringify({ username }),
  }),
  createGroup: (name: string, members: string[]) => request<{ id: string }>('/api/rooms/group', {
    method: 'POST', body: JSON.stringify({ name, members }),
  }),
  addMember: (roomId: string, username: string) => request<{ status: string }>(`/api/rooms/${roomId}/members`, {
    method: 'POST', body: JSON.stringify({ username }),
  }),
  removeMember: (roomId: string, userId: string) => request<{ status: string }>(`/api/rooms/${roomId}/members/${userId}`, {
    method: 'DELETE',
  }),
  leaveGroup: (roomId: string) => request<{ status: string }>(`/api/rooms/${roomId}/leave`, { method: 'POST' }),
}

export const blocksApi = {
  list: () => request<BlockedUserType[]>('/api/blocks'),
  block: (userId: string) => request<{ status: string }>(`/api/blocks/${userId}`, { method: 'POST' }),
  unblock: (userId: string) => request<{ status: string }>(`/api/blocks/${userId}`, { method: 'DELETE' }),
}

export const messagesApi = {
  list: (roomId: string, before?: number) => {
    const q = before ? `?before=${before}&limit=50` : '?limit=50'
    return request<MessageType[]>(`/api/messages/${roomId}${q}`)
  },
  send: (roomId: string, bundle: string, clientId?: string) => request<{ id: string; clientId?: string }>(`/api/messages/${roomId}`, {
    method: 'POST', body: JSON.stringify({ bundle, clientId }),
  }),
}

export const storiesApi = {
  list: () => request<StoryType[]>('/api/notes'),
  create: (content: string) => request<{ id: string }>('/api/notes', {
    method: 'POST', body: JSON.stringify({ content }),
  }),
}

export const friendsApi = {
  list: () => request<FriendType[]>('/api/friends'),
  requests: () => request<FriendRequestType[]>('/api/friends/requests'),
  sendRequest: (username: string) => request<{ id: string; status: string }>('/api/friends/request', {
    method: 'POST', body: JSON.stringify({ username }),
  }),
  accept: (id: string) => request<{ status: string }>(`/api/friends/${id}/accept`, { method: 'POST' }),
  remove: (friendId: string) => request<{ status: string }>(`/api/friends/${friendId}`, { method: 'DELETE' }),
}

export const usersApi = {
  search: (q: string) => request<SearchUserType[]>(`/api/users/search?q=${encodeURIComponent(q)}`),
  me: () => request<ProfileType>('/api/users/me'),
  updateProfile: (data: { displayName?: string; bio?: string; username?: string }) =>
    request<UpdateProfileResponse>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadAvatar: async (file: { uri: string; name: string; type: string }) => {
    const token = await storage.getToken()
    if (!token) throw new ApiError(401, 'Chưa đăng nhập')
    const body = new FormData()
    body.append('avatar', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any)
    console.log('[avatar] upload start', { base: BASE, name: file.name, type: file.type, uri: file.uri })
    const res = await fetch(`${BASE}/api/users/me/avatar`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    })
    if (!res.ok) {
      const parsed = await parseResponseBody(res)
      console.warn('[avatar] upload failed', res.status, parsed)
      throw new ApiError(res.status, responseErrorMessage(parsed, res.status))
    }
    const parsed = await parseResponseBody(res) as { avatarUrl: string; avatarThumbUrl: string; avatarKey: string }
    console.log('[avatar] upload ok', parsed)
    return parsed
  },
  deleteAvatar: () => request<{ status: string }>('/api/users/me/avatar', { method: 'DELETE' }),
  inviteLink: () => request<{ token: string; link: string }>('/api/users/invite-link'),
  resolveInvite: (token: string) => request<{ userId: string; username: string }>(`/api/users/invite/${token}`),
  totpSetup: () => request<{ secret: string; url: string }>('/api/users/totp/setup', { method: 'POST' }),
  totpVerify: (code: string) => request<{ status: string }>('/api/users/totp/verify', {
    method: 'POST', body: JSON.stringify({ code }),
  }),
  totpDisable: (code: string) => request<{ status: string }>('/api/users/totp/disable', {
    method: 'POST', body: JSON.stringify({ code }),
  }),
}

export const pendingApi = {
  list: () => request<PendingMessageType[]>('/api/pending'),
  send: (toUserId: string, bundle: string) => request<{ id: string; status: string }>(`/api/pending/send/${toUserId}`, {
    method: 'POST', body: JSON.stringify({ bundle }),
  }),
  accept: (id: string) => request<{ status: string; fromUserId: string }>(`/api/pending/${id}/accept`, { method: 'POST' }),
  dismiss: (id: string) => request<{ status: string }>(`/api/pending/${id}`, { method: 'DELETE' }),
}

export const moderationApi = {
  report: (reportedId: string, reason: string, detail?: string) =>
    request<{ status: string; id: string }>('/api/moderation/report', {
      method: 'POST', body: JSON.stringify({ reportedId, reason, detail }),
    }),
  banStatus: () => request<{ banned: boolean; bannedUntil: number; banCount: number }>('/api/moderation/ban/status'),
  adminReports: () => request<ReportType[]>('/api/moderation/admin/reports'),
  adminAction: (id: string, action: string, adminNote?: string) =>
    request<{ status: string }>(`/api/moderation/admin/reports/${id}/action`, {
      method: 'POST', body: JSON.stringify({ action, adminNote }),
    }),
}

export { ApiError }
