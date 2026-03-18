import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useRooms } from '../hooks/useRooms'
import { useChat } from '../hooks/useChat'
import { useVoiceCall } from '../hooks/useVoiceCall'
import {
  friendsApi, usersApi, blocksApi, pendingApi,
  type FriendType, type FriendRequestType, type SearchUserType,
  type ProfileType, type BlockedUserType,
} from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'chats' | 'friends' | 'settings'
type FriendSubtab = 'all' | 'requests' | 'find'

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconMsg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.57a16 16 0 0 0 6.06 6.06l1.63-1.64a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarLetter(name: string) {
  return name[0]?.toUpperCase() ?? '?'
}

function formatTime(ts?: number) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

function ChatPanel({ roomId, roomName, roomType }: { roomId: string; roomName: string; roomType?: string }) {
  const { messages, members, connected, loading, sendMessage, wsRef } = useChat(roomId)
  const { callState, incomingCall, startCall, acceptCall, rejectCall, endCall, isMuted, toggleMute } = useVoiceCall(wsRef)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const userId = localStorage.getItem('amoon_userId') ?? ''

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage(input)
    setInput('')
  }, [input, sendMessage])

  const partner = members.find(m => m.id !== userId)
  const isDm = roomType === 'dm' || members.length <= 2

  // Display name: for DM show partner username, for group show group name
  const displayName = isDm && partner ? partner.username : roomName

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 py-3.5 border-b border-app-border flex items-center gap-3 flex-shrink-0 bg-app-surface">
        <div className="w-8 h-8 app-avatar text-sm">
          {avatarLetter(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-txt-primary font-semibold text-sm truncate">{displayName}</div>
          <div className="flex items-center gap-1.5 text-xs text-txt-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-status-online' : 'bg-app-border2'}`} />
            <span>{connected ? 'Online' : 'Offline'}</span>
            <span className="mx-1">·</span>
            <IconLock /><span className="ml-0.5">Encrypted</span>
          </div>
        </div>

        {/* Call controls */}
        {isDm && partner && callState === 'idle' && (
          <button
            onClick={() => startCall(partner.id, partner.username, roomId)}
            className="app-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
            title="Voice Call"
          >
            <IconPhone /> Call
          </button>
        )}
        {callState === 'active' && (
          <div className="flex items-center gap-2">
            <span className="text-status-online text-xs font-medium animate-pulse">● In Call</span>
            <button onClick={toggleMute} className={`app-btn-ghost text-xs py-1 px-2.5 ${isMuted ? 'border-status-warn text-status-warn' : ''}`}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={endCall} className="app-btn-danger text-xs py-1 px-2.5">End</button>
          </div>
        )}
        {callState === 'calling' && (
          <div className="flex items-center gap-2">
            <span className="text-status-warn text-xs animate-pulse">Calling...</span>
            <button onClick={endCall} className="app-btn-danger text-xs py-1 px-2.5">Cancel</button>
          </div>
        )}
      </header>

      {/* Incoming call banner */}
      {callState === 'ringing' && incomingCall && (
        <div className="flex items-center gap-3 px-5 py-3 bg-status-online/10 border-b border-status-online/30">
          <div className="w-8 h-8 app-avatar text-sm bg-status-online/20 border-status-online/40 text-status-online">
            {avatarLetter(incomingCall.fromUsername)}
          </div>
          <div className="flex-1">
            <div className="text-txt-primary text-sm font-medium">{incomingCall.fromUsername}</div>
            <div className="text-status-online text-xs animate-pulse">Incoming voice call...</div>
          </div>
          <button onClick={acceptCall} className="app-btn text-xs py-1.5 px-4">Accept</button>
          <button onClick={rejectCall} className="app-btn-danger text-xs py-1.5 px-4">Decline</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading && (
          <div className="text-center text-txt-muted text-sm py-12">Loading messages...</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 app-avatar text-2xl mx-auto mb-4">{avatarLetter(displayName)}</div>
            <div className="text-txt-secondary text-sm font-medium">{displayName}</div>
            <div className="text-txt-muted text-xs mt-1">Start the conversation. Messages are end-to-end encrypted.</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.mine ? 'justify-end' : 'justify-start'} gap-2`}>
            {!msg.mine && (
              <div className="w-7 h-7 app-avatar text-xs flex-shrink-0 mt-0.5">
                {avatarLetter(members.find(m => m.id === msg.senderId)?.username ?? msg.senderId)}
              </div>
            )}
            <div className={`max-w-[65%] px-3.5 py-2.5 rounded-2xl text-sm ${
              msg.mine
                ? 'bg-accent text-white rounded-br-sm'
                : 'bg-app-surface3 border border-app-border text-txt-primary rounded-bl-sm'
            } ${msg.pending ? 'opacity-60' : ''}`}>
              {!msg.mine && members.length > 2 && (
                <div className="text-xs text-accent-light font-medium mb-1">
                  {members.find(m => m.id === msg.senderId)?.username ?? msg.senderId.slice(0, 8)}
                </div>
              )}
              <div className="leading-relaxed">{msg.text}</div>
              <div className={`text-xs mt-1 text-right ${msg.mine ? 'text-white/60' : 'text-txt-muted'}`}>{msg.time}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <footer className="p-4 border-t border-app-border flex-shrink-0 bg-app-surface">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <input
            className="app-input flex-1"
            placeholder="Message..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-light active:scale-95 transition-all flex-shrink-0"
            disabled={!input.trim()}
          >
            <IconSend />
          </button>
        </form>
      </footer>
    </div>
  )
}

// ─── RoomsList ────────────────────────────────────────────────────────────────

function RoomsList({
  selectedRoomId,
  onSelect,
}: {
  selectedRoomId: string | null
  onSelect: (id: string) => void
}) {
  const { rooms, loading, refetch, startDm, createGroup } = useRooms()
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const [dmUsername, setDmUsername] = useState('')
  const [showDm, setShowDm] = useState(false)

  const handleStartDm = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dmUsername.trim()) return
    try {
      const id = await startDm(dmUsername.trim())
      onSelect(id)
      setShowDm(false)
      setDmUsername('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
    }
  }, [dmUsername, startDm, onSelect])

  const handleCreateGroup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return
    try {
      const members = groupMembers.split(',').map(s => s.trim()).filter(Boolean)
      const id = await createGroup(groupName.trim(), members)
      onSelect(id)
      setShowNewGroup(false)
      setGroupName('')
      setGroupMembers('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
    }
  }, [groupName, groupMembers, createGroup, onSelect])

  return (
    <div className="flex flex-col h-full">
      {/* Action buttons */}
      <div className="p-3 flex gap-2">
        <button
          onClick={() => { setShowDm(v => !v); setShowNewGroup(false) }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-app-sm border transition-all flex-1 justify-center ${
            showDm ? 'bg-accent text-white border-accent' : 'border-app-border2 text-txt-secondary hover:border-accent/50 hover:text-txt-primary'
          }`}
        >
          <IconPlus /> New DM
        </button>
        <button
          onClick={() => { setShowNewGroup(v => !v); setShowDm(false) }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-app-sm border transition-all flex-1 justify-center ${
            showNewGroup ? 'bg-accent text-white border-accent' : 'border-app-border2 text-txt-secondary hover:border-accent/50 hover:text-txt-primary'
          }`}
        >
          <IconPlus /> New Group
        </button>
        <button
          onClick={refetch}
          className="w-9 h-9 flex items-center justify-center rounded-app-sm border border-app-border2 text-txt-muted hover:text-txt-primary hover:border-accent/50 transition-all"
          title="Refresh"
        >
          <IconRefresh />
        </button>
      </div>

      {showDm && (
        <form onSubmit={handleStartDm} className="px-3 pb-3 flex gap-2">
          <input
            className="app-input text-xs flex-1"
            placeholder="Enter username..."
            value={dmUsername}
            onChange={e => setDmUsername(e.target.value)}
            autoFocus
          />
          <button type="submit" className="app-btn text-xs py-1.5 px-3">Start</button>
        </form>
      )}

      {showNewGroup && (
        <form onSubmit={handleCreateGroup} className="px-3 pb-3 space-y-2">
          <input
            className="app-input text-xs w-full"
            placeholder="Group name..."
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            autoFocus
          />
          <input
            className="app-input text-xs w-full"
            placeholder="Members (comma-separated)"
            value={groupMembers}
            onChange={e => setGroupMembers(e.target.value)}
          />
          <button type="submit" className="app-btn text-xs py-2 w-full">Create Group</button>
        </form>
      )}

      {/* Divider */}
      <div className="px-3 pb-2">
        <div className="h-px bg-app-border" />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2">
        {loading && (
          <div className="text-center text-txt-muted text-sm py-8">Loading...</div>
        )}
        {!loading && rooms.length === 0 && (
          <div className="text-center text-txt-muted text-sm py-8 px-4">
            No conversations yet.<br />Start a DM or create a group.
          </div>
        )}
        {rooms.map(room => {
          const isGroup = room.type === 'group'
          const isSelected = selectedRoomId === room.id
          return (
            <button
              key={room.id}
              onClick={() => onSelect(room.id)}
              className={`w-full text-left px-3 py-3 rounded-app-sm mb-0.5 flex items-center gap-3 transition-all ${
                isSelected ? 'bg-accent-muted border border-accent/30' : 'hover:bg-app-surface3 border border-transparent'
              }`}
            >
              <div className={`w-10 h-10 app-avatar text-base flex-shrink-0 ${isGroup ? 'bg-app-border2 border-app-border text-txt-secondary' : ''}`}>
                {isGroup ? '👥' : avatarLetter(room.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-accent-light' : 'text-txt-primary'}`}>
                    {room.name}
                  </span>
                  <span className="text-xs text-txt-muted flex-shrink-0 ml-2">{formatTime(room.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-muted truncate">{room.lastMessage ?? (isGroup ? 'Group chat' : 'Direct message')}</span>
                  {(room.unreadCount ?? 0) > 0 && (
                    <span className="ml-2 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                      {room.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── FriendsPanel ─────────────────────────────────────────────────────────────

function FriendsPanel({ onStartDm }: { onStartDm: (roomId: string) => void }) {
  const [subtab, setSubtab] = useState<FriendSubtab>('all')
  const [friends, setFriends] = useState<FriendType[]>([])
  const [requests, setRequests] = useState<FriendRequestType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUserType[]>([])
  const [loading, setLoading] = useState(false)

  const { startDm } = useRooms()

  const fetchFriends = useCallback(async () => {
    try { setFriends(await friendsApi.list()) } catch (e) { console.warn(e) }
  }, [])

  const fetchRequests = useCallback(async () => {
    try { setRequests(await friendsApi.requests()) } catch (e) { console.warn(e) }
  }, [])

  useEffect(() => {
    fetchFriends()
    fetchRequests()
  }, [fetchFriends, fetchRequests])

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setLoading(true)
    try { setSearchResults(await usersApi.search(searchQuery.trim())) }
    catch (e) { console.warn(e) }
    finally { setLoading(false) }
  }, [searchQuery])

  const handleSendRequest = useCallback(async (username: string) => {
    try {
      await friendsApi.sendRequest(username)
      alert(`Friend request sent to ${username}`)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
  }, [])

  const handleAccept = useCallback(async (id: string) => {
    try {
      await friendsApi.accept(id)
      await fetchFriends()
      await fetchRequests()
    } catch (e) { console.warn(e) }
  }, [fetchFriends, fetchRequests])

  const handleRemoveFriend = useCallback(async (friendId: string) => {
    if (!confirm('Remove friend?')) return
    try {
      await friendsApi.remove(friendId)
      await fetchFriends()
    } catch (e) { console.warn(e) }
  }, [fetchFriends])

  const handleDm = useCallback(async (username: string) => {
    try {
      const id = await startDm(username)
      onStartDm(id)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
  }, [startDm, onStartDm])

  const subtabs: { key: FriendSubtab; label: string }[] = [
    { key: 'all', label: 'Friends' },
    { key: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` },
    { key: 'find', label: 'Find' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Subtabs */}
      <div className="p-3 flex gap-1">
        {subtabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubtab(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-app-sm transition-all ${
              subtab === t.key
                ? 'bg-accent text-white'
                : 'text-txt-muted hover:text-txt-primary hover:bg-app-surface3'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-3 pb-2">
        <div className="h-px bg-app-border" />
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {subtab === 'all' && (
          <div className="space-y-0.5">
            {friends.length === 0 && (
              <div className="text-center text-txt-muted text-sm py-8">No friends yet.</div>
            )}
            {friends.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-app-sm hover:bg-app-surface3 transition-colors">
                <div className="w-9 h-9 app-avatar text-sm">{avatarLetter(f.username)}</div>
                <span className="text-sm text-txt-primary flex-1 truncate font-medium">{f.username}</span>
                <button onClick={() => handleDm(f.username)} className="app-btn text-xs py-1 px-3">Message</button>
                <button onClick={() => handleRemoveFriend(f.friendId)} className="app-btn-danger text-xs py-1 px-2">✕</button>
              </div>
            ))}
          </div>
        )}

        {subtab === 'requests' && (
          <div className="space-y-0.5">
            {requests.length === 0 && (
              <div className="text-center text-txt-muted text-sm py-8">No pending requests.</div>
            )}
            {requests.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-app-sm hover:bg-app-surface3 transition-colors">
                <div className="w-9 h-9 app-avatar text-sm bg-accent-muted border-accent/30 text-accent-light">
                  {avatarLetter(r.username)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-txt-primary font-medium truncate">{r.username}</div>
                  <div className="text-xs text-txt-muted">Friend request</div>
                </div>
                <button onClick={() => handleAccept(r.id)} className="app-btn text-xs py-1 px-3">Accept</button>
              </div>
            ))}
          </div>
        )}

        {subtab === 'find' && (
          <div>
            <form onSubmit={handleSearch} className="flex gap-2 mb-3">
              <input
                className="app-input text-sm flex-1"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="app-btn text-sm py-2 px-4">
                {loading ? '...' : 'Search'}
              </button>
            </form>
            <div className="space-y-0.5">
              {searchResults.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-app-sm hover:bg-app-surface3 transition-colors">
                  <div className="w-9 h-9 app-avatar text-sm">{avatarLetter(u.username)}</div>
                  <span className="text-sm text-txt-primary flex-1 truncate font-medium">{u.username}</span>
                  <button onClick={() => handleSendRequest(u.username)} className="app-btn-ghost text-xs py-1 px-3">Add Friend</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────

function SettingsPanel() {
  const { logout, username } = useAuthStore()
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [blocked, setBlocked] = useState<BlockedUserType[]>([])
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; url: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    usersApi.me().then(p => {
      setProfile(p)
      setDisplayName(p.displayName ?? '')
      setBio(p.bio ?? '')
    }).catch(console.warn)
    blocksApi.list().then(setBlocked).catch(console.warn)
  }, [])

  const handleSaveProfile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await usersApi.updateProfile({ displayName, bio })
      const updated = await usersApi.me()
      setProfile(updated)
      setEditMode(false)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
    finally { setLoading(false) }
  }, [displayName, bio])

  const handleInviteLink = useCallback(async () => {
    try {
      const res = await usersApi.inviteLink()
      setInviteLink(res.link)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
  }, [])

  const handleUnblock = useCallback(async (userId: string) => {
    try {
      await blocksApi.unblock(userId)
      setBlocked(prev => prev.filter(b => b.id !== userId))
    } catch (e) { console.warn(e) }
  }, [])

  const handleTotpSetup = useCallback(async () => {
    try {
      const res = await usersApi.totpSetup()
      setTotpSetupData(res)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
  }, [])

  const handleTotpVerify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await usersApi.totpVerify(totpCode)
      alert('2FA enabled!')
      setTotpSetupData(null)
      setTotpCode('')
      const updated = await usersApi.me()
      setProfile(updated)
    } catch (err) { alert(err instanceof Error ? err.message : 'Error') }
    finally { setLoading(false) }
  }, [totpCode])

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-3">
      {/* Profile card */}
      <div className="app-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 app-avatar text-xl">
            {avatarLetter(username ?? '?')}
          </div>
          <div>
            <div className="text-txt-primary font-semibold">{username}</div>
            {profile?.displayName && <div className="text-txt-secondary text-sm">{profile.displayName}</div>}
            {profile?.bio && <div className="text-txt-muted text-xs mt-0.5">{profile.bio}</div>}
          </div>
        </div>

        {!editMode ? (
          <button onClick={() => setEditMode(true)} className="app-btn-ghost text-sm py-2 w-full">
            Edit Profile
          </button>
        ) : (
          <form onSubmit={handleSaveProfile} className="space-y-2">
            <input
              className="app-input w-full"
              placeholder="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            <input
              className="app-input w-full"
              placeholder="Bio"
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" className="app-btn text-sm py-2 flex-1" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditMode(false)} className="app-btn-ghost text-sm py-2 flex-1">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2FA */}
      <div className="app-card p-4">
        <div className="text-txt-secondary text-xs font-medium uppercase tracking-wider mb-3">Two-Factor Auth</div>
        {profile?.totpEnabled ? (
          <div className="flex items-center gap-2 text-status-online text-sm">
            <span>●</span> 2FA Enabled
          </div>
        ) : totpSetupData ? (
          <div className="space-y-2">
            <div className="text-xs text-txt-muted bg-app-surface2 rounded-app-xs p-2 break-all font-mono">
              {totpSetupData.secret}
            </div>
            <form onSubmit={handleTotpVerify} className="flex gap-2">
              <input
                className="app-input flex-1"
                placeholder="6-digit code"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value)}
                maxLength={6}
              />
              <button type="submit" className="app-btn text-sm py-2 px-4" disabled={loading}>
                {loading ? '...' : 'Verify'}
              </button>
            </form>
          </div>
        ) : (
          <button onClick={handleTotpSetup} className="app-btn-ghost text-sm py-2 w-full">Setup 2FA</button>
        )}
      </div>

      {/* Invite link */}
      <div className="app-card p-4">
        <div className="text-txt-secondary text-xs font-medium uppercase tracking-wider mb-3">Invite Link</div>
        {inviteLink ? (
          <div>
            <div className="text-xs text-accent-light break-all mb-2 bg-app-surface2 rounded-app-xs p-2 font-mono">{inviteLink}</div>
            <button
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="app-btn-ghost text-sm py-2 w-full"
            >Copy Link</button>
          </div>
        ) : (
          <button onClick={handleInviteLink} className="app-btn-ghost text-sm py-2 w-full">Generate Link</button>
        )}
      </div>

      {/* Blocked */}
      {blocked.length > 0 && (
        <div className="app-card p-4">
          <div className="text-txt-secondary text-xs font-medium uppercase tracking-wider mb-3">
            Blocked Users ({blocked.length})
          </div>
          <div className="space-y-2">
            {blocked.map(b => (
              <div key={b.id} className="flex items-center gap-2">
                <div className="w-7 h-7 app-avatar text-xs bg-status-danger/10 border-status-danger/30 text-status-danger">
                  {avatarLetter(b.username)}
                </div>
                <span className="text-sm text-txt-secondary flex-1 truncate">{b.username}</span>
                <button onClick={() => handleUnblock(b.id)} className="app-btn-ghost text-xs py-1 px-3">Unblock</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending */}
      <PendingMessages />

      {/* Logout */}
      <button onClick={logout} className="app-btn-danger text-sm py-3 w-full mt-auto">
        Sign Out
      </button>
    </div>
  )
}

// ─── PendingMessages ──────────────────────────────────────────────────────────

function PendingMessages() {
  const [pending, setPending] = useState<Array<{ id: string; fromUsername: string }>>([])

  useEffect(() => {
    pendingApi.list().then(list => setPending(list.map(m => ({ id: m.id, fromUsername: m.fromUsername })))).catch(console.warn)
  }, [])

  const handleAccept = useCallback(async (id: string) => {
    try {
      await pendingApi.accept(id)
      setPending(prev => prev.filter(m => m.id !== id))
    } catch (e) { console.warn(e) }
  }, [])

  const handleDismiss = useCallback(async (id: string) => {
    try {
      await pendingApi.dismiss(id)
      setPending(prev => prev.filter(m => m.id !== id))
    } catch (e) { console.warn(e) }
  }, [])

  if (pending.length === 0) return null

  return (
    <div className="app-card p-4">
      <div className="text-txt-secondary text-xs font-medium uppercase tracking-wider mb-3">
        Pending Messages ({pending.length})
      </div>
      <div className="space-y-2">
        {pending.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <div className="w-7 h-7 app-avatar text-xs bg-status-warn/10 border-status-warn/30 text-status-warn">
              {avatarLetter(m.fromUsername)}
            </div>
            <span className="text-sm text-txt-primary flex-1 truncate">{m.fromUsername}</span>
            <button onClick={() => handleAccept(m.id)} className="app-btn text-xs py-1 px-3">Accept</button>
            <button onClick={() => handleDismiss(m.id)} className="app-btn-danger text-xs py-1 px-2">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ChatPage (main layout) ───────────────────────────────────────────────────

export function ChatPage() {
  const { username } = useAuthStore()
  const [tab, setTab] = useState<Tab>('chats')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const { rooms } = useRooms()

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)

  const handleSelectRoom = useCallback((id: string) => {
    setSelectedRoomId(id)
    setTab('chats')
  }, [])

  const panelTitle = tab === 'chats' ? 'Messages' : tab === 'friends' ? 'Friends' : 'Settings'

  return (
    <div className="flex h-screen bg-app-bg text-txt-primary overflow-hidden">
      {/* ── Nav bar (64px) ─────────────────────────────────────────── */}
      <nav className="w-16 flex flex-col items-center py-4 gap-2 border-r border-app-border bg-app-surface flex-shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 rounded-app-sm bg-accent flex items-center justify-center mb-3 shadow-accent">
          <span className="text-white text-base font-bold">M</span>
        </div>

        <NavBtn icon={<IconMsg />} active={tab === 'chats'} onClick={() => setTab('chats')} title="Messages" />
        <NavBtn icon={<IconUsers />} active={tab === 'friends'} onClick={() => setTab('friends')} title="Friends" />
        <NavBtn icon={<IconSettings />} active={tab === 'settings'} onClick={() => setTab('settings')} title="Settings" />

        <div className="flex-1" />

        {/* User avatar */}
        <div
          className="w-10 h-10 app-avatar text-sm cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all"
          title={username ?? ''}
          onClick={() => setTab('settings')}
        >
          {avatarLetter(username ?? '?')}
        </div>
      </nav>

      {/* ── Left panel (288px) ─────────────────────────────────────── */}
      <aside className="w-72 flex flex-col border-r border-app-border bg-app-surface flex-shrink-0">
        <div className="px-4 py-4 border-b border-app-border">
          <h2 className="text-txt-primary font-semibold text-base">{panelTitle}</h2>
          <p className="text-txt-muted text-xs mt-0.5">@{username}</p>
        </div>

        <div className="flex-1 overflow-hidden">
          {tab === 'chats' && (
            <RoomsList selectedRoomId={selectedRoomId} onSelect={handleSelectRoom} />
          )}
          {tab === 'friends' && (
            <FriendsPanel onStartDm={handleSelectRoom} />
          )}
          {tab === 'settings' && (
            <SettingsPanel />
          )}
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-app-bg">
        {selectedRoomId ? (
          <ChatPanel
            key={selectedRoomId}
            roomId={selectedRoomId}
            roomName={selectedRoom?.name ?? selectedRoomId.slice(0, 8) + '...'}
            roomType={selectedRoom?.type}
          />
        ) : (
          <WelcomeScreen />
        )}
      </main>
    </div>
  )
}

// ─── NavBtn ───────────────────────────────────────────────────────────────────

function NavBtn({ icon, active, onClick, title }: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-11 h-11 rounded-app-sm flex items-center justify-center transition-all ${
        active
          ? 'bg-accent text-white shadow-accent-sm'
          : 'text-txt-muted hover:text-txt-primary hover:bg-app-surface3'
      }`}
    >
      {icon}
    </button>
  )
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center select-none">
        <div className="w-20 h-20 rounded-2xl bg-accent mx-auto flex items-center justify-center mb-5 shadow-accent">
          <span className="text-white text-4xl font-bold">M</span>
        </div>
        <h2 className="text-txt-primary text-xl font-semibold mb-2">AMoon Eclipse</h2>
        <p className="text-txt-muted text-sm">Select a conversation to start chatting</p>
        <div className="flex items-center justify-center gap-1.5 mt-3 text-txt-muted text-xs">
          <IconLock />
          <span>End-to-end encrypted</span>
        </div>
      </div>
    </div>
  )
}
