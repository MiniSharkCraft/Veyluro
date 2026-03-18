/**
 * @file types.ts
 * @description Shared domain types across Web, Mobile, Desktop, and Server.
 */

export type UserId = string
export type RoomId = string
export type MessageId = string

export interface User {
  id: UserId
  username: string
  /** Base64 SPKI RSA public key — stored on server, visible to all room members */
  publicKey: string
  /** SHA-256 fingerprint of publicKey for out-of-band verification */
  fingerprint: string
  createdAt: number
}

export interface Room {
  id: RoomId
  name: string
  members: UserId[]
  createdAt: number
  /** DM rooms have exactly 2 members */
  type: 'dm' | 'group'
}

export interface EncryptedMessage {
  id: MessageId
  roomId: RoomId
  senderId: UserId
  /** MessageBundle serialized to JSON string — opaque to the server */
  bundle: string
  /** For file attachments: R2 object key */
  attachmentKey?: string
  /** MIME type of the attachment (determined client-side before upload) */
  attachmentMime?: string
  createdAt: number
}

// WebSocket protocol frames
export type WSFrame =
  | { type: 'auth'; token: string }
  | { type: 'join'; roomId: RoomId }
  | { type: 'message'; roomId: RoomId; bundle: string; attachmentKey?: string; attachmentMime?: string }
  | { type: 'typing'; roomId: RoomId }
  | { type: 'read'; roomId: RoomId; messageId: MessageId }
  | { type: 'error'; code: string; message: string }
  | { type: 'delivered'; messageId: MessageId }
  | { type: 'members'; roomId: RoomId; members: User[] }

export interface PaginatedResponse<T> {
  data: T[]
  cursor?: string
  hasMore: boolean
}

export interface ApiError {
  code: string
  message: string
  status: number
}
