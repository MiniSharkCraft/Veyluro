import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore, API, WS_BASE } from '../stores/authStore'
import { encryptMessage, decryptMessage, encryptPrivateKeyWithPassphrase } from '../lib/crypto'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Room      { id: string; name: string; type: 'dm'|'group'; groupAdminId?: string; memberCount?: number; lastMessageAt?: number }
interface Member    { id: string; username: string; publicKey: string; fingerprint: string }
interface Message   { id: string; senderId: string; bundle: string; createdAt: number; text?: string }
interface Friend    { id: string; username: string; publicKey: string; friendId: string }
interface FriendReq { id: string; fromId: string; username: string; publicKey: string }
interface Story     { id: string; userId: string; content: string; expiresAt: number; createdAt: number }
interface PendingMsg{ id: string; fromUserId: string; fromUsername: string; bundle: string; createdAt: number; text?: string }
interface Profile   { id: string; username: string; displayName?: string; bio?: string; publicKey?: string; totpEnabled: boolean; isAdmin: boolean }
interface BlockedUser { id: string; username: string; createdAt: number }
interface Report    { id: string; reason: string; detail?: string; status: string; adminNote?: string; createdAt: number; reporterUsername: string; reportedUsername: string; reportedId: string }
interface Note      { id: string; text: string; updatedAt: number }
interface SearchUser{ id: string; username: string; publicKey?: string }

type Tab = 'chats' | 'friends' | 'pending' | 'stories' | 'notes' | 'calls' | 'settings' | 'admin'

// ─── Avatar helper ────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444']
function avatarColor(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] }
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, minWidth: size, borderRadius: size/2, background: avatarColor(name), display:'flex', alignItems:'center', justifyContent:'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', userSelect: 'none' }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-2">
      <span className="text-4xl opacity-30">{icon}</span>
      <p className="text-white text-sm font-medium">{text}</p>
      {sub && <p className="text-dark-400/60 text-xs">{sub}</p>}
    </div>
  )
}

function authHdr(token: string) { return { Authorization: `Bearer ${token}` } }

// ─── Main ChatPage ────────────────────────────────────────────────────────────
export function ChatPage() {
  const { userId, username, token, privateKey, publicKey, logout } = useAuthStore()
  const [tab,     setTab]     = useState<Tab>('chats')
  const [profile, setProfile] = useState<Profile | null>(null)
  const resolvedPublicKey = (profile?.publicKey && profile.publicKey.trim()) || publicKey || ''

  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/users/me`, { headers: authHdr(token!) }).then(r => r.ok ? r.json() : null).then(d => d && setProfile(d))
  }, [token])

  const hdr = authHdr(token!)

  const navItems: Array<{ key: Tab; icon: JSX.Element; label: string; show?: boolean }> = [
    { key: 'chats',    icon: <IconChat />,     label: 'Chats'    },
    { key: 'friends',  icon: <IconFriends />,  label: 'Friends'  },
    { key: 'pending',  icon: <IconInbox />,    label: 'Pending'  },
    { key: 'stories',  icon: <IconStories />,  label: 'Stories'  },
    { key: 'notes',    icon: <IconNotes />,    label: 'Notes'    },
    { key: 'calls',    icon: <IconPhone />,    label: 'Calls'    },
    { key: 'settings', icon: <IconSettings />, label: 'Settings' },
    { key: 'admin',    icon: <IconAdmin />,    label: 'Admin', show: profile?.isAdmin },
  ]

  return (
    <div className="flex h-screen bg-[#08080F] text-white overflow-hidden">
      {/* Sidebar */}
      <nav className="w-14 shrink-0 bg-[#0E0E1C] border-r border-[#1E1E30] flex flex-col items-center py-3 gap-1">
        <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mb-2 shrink-0">
          <span className="text-indigo-400 text-xs font-black">A</span>
        </div>
        {navItems.filter(n => n.show !== false).map(({ key, icon, label }) => (
          <button key={key} title={label} onClick={() => setTab(key)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              tab === key ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white hover:bg-[#1E1E30]'
            }`}>
            {icon}
          </button>
        ))}
        <div className="flex-1" />
        <button title={username ?? ''} className="w-10 h-10 rounded-xl overflow-hidden mb-1">
          <Avatar name={username ?? '?'} size={40} />
        </button>
        <button title="Sign out" onClick={logout}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[#4B5563] hover:text-red-400 hover:bg-red-950/30 transition-all">
          <IconLogout />
        </button>
      </nav>

      {/* Content */}
      {tab === 'chats'    && <ChatsTab   userId={userId!} username={username!} token={token!} privateKey={privateKey!} publicKey={resolvedPublicKey} hdr={hdr} />}
      {tab === 'friends'  && <FriendsTab userId={userId!} username={username!} token={token!} hdr={hdr} />}
      {tab === 'pending'  && <PendingTab userId={userId!} token={token!} privateKey={privateKey!} publicKey={resolvedPublicKey} hdr={hdr} />}
      {tab === 'stories'  && <StoriesTab userId={userId!} username={username!} hdr={hdr} />}
      {tab === 'notes'    && <NotesTab />}
      {tab === 'calls'    && <CallsTab userId={userId!} username={username!} token={token!} hdr={hdr} />}
      {tab === 'settings' && <SettingsTab userId={userId!} token={token!} hdr={hdr} />}
      {tab === 'admin'    && <AdminTab hdr={hdr} />}
    </div>
  )
}

// ─── CHATS TAB ────────────────────────────────────────────────────────────────
function ChatsTab({ userId, username, token, privateKey, publicKey, hdr }: {
  userId: string; username: string; token: string
  privateKey: CryptoKey; publicKey: string; hdr: Record<string, string>
}) {
  const [rooms,    setRooms]    = useState<Room[]>([])
  const [active,   setActive]   = useState<Room | null>(null)
  const [members,  setMembers]  = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState<SearchUser[]>([])
  const [sending,  setSending]  = useState(false)
  const [sendErr,  setSendErr]  = useState('')
  const [showNew,  setShowNew]  = useState(false)
  // Group creation
  const [grpName,  setGrpName]  = useState('')
  const [grpSel,   setGrpSel]   = useState<SearchUser[]>([])
  const [grpMode,  setGrpMode]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef     = useRef<WebSocket | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const fetchRooms = useCallback(async () => {
    const res = await fetch(`${API}/api/rooms`, { headers: hdr })
    if (res.ok) setRooms(await res.json())
  }, [token])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(search)}`, { headers: hdr })
      if (res.ok) setResults(await res.json())
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // WebSocket
  useEffect(() => {
    if (!active) return
    wsRef.current?.close()
    const ws = new WebSocket(`${WS_BASE}/ws?token=${token}&room=${active.id}`)
    wsRef.current = ws
    ws.onmessage = async (e) => {
      const raw = JSON.parse(e.data)
      if (raw.type !== 'message') return
      const msg: Message = { id: raw.id, senderId: raw.senderId, bundle: raw.bundle, createdAt: raw.createdAt }
      try {
        const bundle = JSON.parse(raw.bundle)
        msg.text = await decryptMessage(bundle, userId, privateKey)
      } catch (err) { console.warn('[decrypt] WS message failed:', err); msg.text = '[encrypted]' }
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    return () => ws.close()
  }, [active?.id, token])

  const openRoom = useCallback(async (room: Room) => {
    setActive(room)
    setMessages([])
    // fetch members
    const mRes = await fetch(`${API}/api/rooms/${room.id}/members`, { headers: hdr })
    if (mRes.ok) setMembers(await mRes.json())
    // fetch messages
    const res = await fetch(`${API}/api/messages/${room.id}?limit=50`, { headers: hdr })
    if (!res.ok) return
    const raw: Message[] = await res.json()
    const decrypted = await Promise.all(raw.map(async m => {
      try {
        const bundle = JSON.parse(m.bundle)
        m.text = await decryptMessage(bundle, userId, privateKey)
      } catch (err) { console.warn('[decrypt] message', m.id, 'failed:', err); m.text = '[encrypted]' }
      return m
    }))
    setMessages(decrypted)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [userId, privateKey, token])

  const startDM = async (u: SearchUser) => {
    const res = await fetch(`${API}/api/rooms/dm`, {
      method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u.username }),
    })
    if (!res.ok) return
    setSearch(''); setResults([]); setShowNew(false)
    await fetchRooms()
    const data = await res.json()
    const newRoom: Room = { id: data.id ?? data.roomId, name: u.username, type: 'dm' }
    openRoom(newRoom)
  }

  const createGroup = async () => {
    if (!grpName.trim() || grpSel.length === 0) return
    const res = await fetch(`${API}/api/rooms/group`, {
      method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: grpName, members: grpSel.map(u => u.username) }),
    })
    if (!res.ok) return
    setGrpName(''); setGrpSel([]); setGrpMode(false); setShowNew(false)
    await fetchRooms()
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !active || !privateKey || !userId) return
    setSending(true)
    setSendErr('')
    try {
      // Fetch members on-the-fly nếu chưa load (tránh race condition)
      let currentMembers = members
      if (currentMembers.length === 0) {
        const mRes = await fetch(`${API}/api/rooms/${active.id}/members`, { headers: hdr })
        if (mRes.ok) { currentMembers = await mRes.json(); setMembers(currentMembers) }
      }
      // Self publicKey: prefer prop, fallback to member list
      const selfMember = currentMembers.find(m => m.id === userId)
      const myPublicKey = publicKey || selfMember?.publicKey || ''
      if (!myPublicKey) { setSendErr('Key not loaded yet, please wait a moment'); setSending(false); return }

      const recipients: Array<{id:string;publicKey:string}> = []
      recipients.push({ id: userId, publicKey: myPublicKey })
      currentMembers.filter(m => m.id !== userId && m.publicKey).forEach(m => recipients.push({ id: m.id, publicKey: m.publicKey }))
      if (recipients.length < 2) { setSendErr('Cannot find recipient keys'); setSending(false); return }
      const bundle = await encryptMessage(input.trim(), recipients)
      const res = await fetch(`${API}/api/messages/${active.id}`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: JSON.stringify(bundle) }),
      })
      if (!res.ok) { setSendErr('Failed to send message'); return }
      setInput('')
      inputRef.current?.focus()
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : 'Send failed')
    } finally { setSending(false) }
  }

  const roomDisplayName = (r: Room) => {
    if (r.type === 'group') return r.name
    const parts = r.name.split(',')
    return parts.find(p => p.trim() !== username)?.trim() ?? parts[0]?.trim() ?? r.name
  }

  const fmt = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts * 1000), now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' })
  }

  const activeDisplayName = active ? roomDisplayName(active) : ''

  return (
    <>
      {/* Room list */}
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-base">Chats</h2>
            <button onClick={() => setShowNew(s => !s)}
              className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-lg flex items-center justify-center hover:bg-indigo-500/30 transition-all">
              +
            </button>
          </div>
          <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-3 py-2 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 transition-colors"
            placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="border-b border-[#1E1E30]">
            <p className="px-4 py-2 text-xs text-[#4B5563] uppercase tracking-wider">Start chat</p>
            {results.map(u => (
              <button key={u.id} onClick={() => startDM(u)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#12121E] transition-colors">
                <Avatar name={u.username} />
                <span className="text-sm text-white">@{u.username}</span>
              </button>
            ))}
          </div>
        )}

        {/* New chat / group panel */}
        {showNew && results.length === 0 && (
          <div className="border-b border-[#1E1E30] p-3 space-y-2">
            <div className="flex gap-1.5 mb-2">
              <button onClick={() => setGrpMode(false)} className={`flex-1 py-1 text-xs rounded-lg ${!grpMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white'}`}>DM</button>
              <button onClick={() => setGrpMode(true)} className={`flex-1 py-1 text-xs rounded-lg ${grpMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white'}`}>Group</button>
            </div>
            {grpMode && (
              <div className="space-y-2">
                <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Group name..." value={grpName} onChange={e => setGrpName(e.target.value)} />
                {grpSel.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {grpSel.map(u => (
                      <span key={u.id} onClick={() => setGrpSel(p => p.filter(x => x.id !== u.id))}
                        className="text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400">
                        {u.username} ✕
                      </span>
                    ))}
                  </div>
                )}
                <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Add members..." onChange={async e => {
                    const q = e.target.value
                    if (!q.trim()) return
                    const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers: hdr })
                    if (res.ok) {
                      const found: SearchUser[] = await res.json()
                      const sel = found[0]
                      if (sel && !grpSel.find(u => u.id === sel.id)) setGrpSel(p => [...p, sel])
                    }
                  }} />
                <button onClick={createGroup} disabled={!grpName.trim() || grpSel.length === 0}
                  className="w-full py-1.5 text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/30 disabled:opacity-40 transition-all">
                  Create Group
                </button>
              </div>
            )}
          </div>
        )}

        {/* Room list */}
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 && (
            <EmptyState icon="💬" text="No conversations" sub="Search for someone above" />
          )}
          {rooms.map(r => (
            <button key={r.id} onClick={() => openRoom(r)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                active?.id === r.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-[#12121E] border-l-2 border-transparent'
              }`}>
              <Avatar name={roomDisplayName(r)} />
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white truncate">
                    {r.type === 'group' && <span className="text-indigo-400/70 text-xs mr-1">#</span>}
                    {roomDisplayName(r)}
                  </p>
                  {r.lastMessageAt ? <span className="text-[10px] text-[#4B5563] shrink-0 ml-1">{fmt(r.lastMessageAt)}</span> : null}
                </div>
                <p className="text-xs text-[#4B5563] truncate">
                  {r.type === 'group' ? `${r.memberCount ?? '?'} members` : 'E2EE · click to open'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {active ? (
          <>
            <header className="flex items-center gap-3 px-6 py-3 border-b border-[#1E1E30] bg-[#0E0E1C] shrink-0">
              <Avatar name={activeDisplayName} size={38} />
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">{activeDisplayName}</p>
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  {active.type === 'group' ? `${members.length} members · E2EE` : 'End-to-end encrypted'}
                </p>
              </div>
              {active.type === 'group' && (
                <div className="flex items-center gap-1">
                  {members.slice(0, 4).map(m => <Avatar key={m.id} name={m.username} size={22} />)}
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map(m => {
                const mine = m.senderId === userId
                const sender = members.find(mb => mb.id === m.senderId)
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && <Avatar name={sender?.username ?? m.senderId.slice(0,6)} size={28} />}
                    <div className={`max-w-[65%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {!mine && active.type === 'group' && (
                        <p className="text-[10px] text-[#4B5563] px-1">{sender?.username ?? '?'}</p>
                      )}
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        mine
                          ? 'bg-indigo-500/20 border border-indigo-500/30 text-white rounded-br-sm'
                          : 'bg-[#12121E] border border-[#1E1E30] text-white rounded-bl-sm'
                      }`}>
                        {m.text ?? '[encrypted]'}
                      </div>
                      <p className="text-[10px] text-[#4B5563] px-1">{fmt(m.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {sendErr && (
              <p className="text-red-400 text-xs px-4 py-1 bg-red-950/20 border-t border-red-900/30">{sendErr}</p>
            )}
            <form onSubmit={sendMessage} className="flex items-center gap-3 px-4 py-3 border-t border-[#1E1E30] bg-[#0E0E1C] shrink-0">
              <input ref={inputRef}
                className="flex-1 bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 transition-colors"
                placeholder="Write a message..." value={input} onChange={e => { setInput(e.target.value); if (sendErr) setSendErr('') }} disabled={sending} />
              <button type="submit" disabled={sending || !input.trim()}
                className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/30 transition-all disabled:opacity-30">
                <IconSend />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-20 h-20 rounded-full bg-[#12121E] border border-[#1E1E30] flex items-center justify-center">
              <IconChat size={32} />
            </div>
            <p className="text-white font-semibold">Your Messages</p>
            <p className="text-[#4B5563] text-sm max-w-xs">Send encrypted messages. Select a conversation or start a new one.</p>
          </div>
        )}
      </div>
    </>
  )
}

// ─── FRIENDS TAB ──────────────────────────────────────────────────────────────
function FriendsTab({ userId: _userId, username: _username, token, hdr }: { userId: string; username: string; token: string; hdr: Record<string, string> }) {
  const [sub,      setSub]      = useState<'all'|'requests'|'find'>('all')
  const [friends,  setFriends]  = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendReq[]>([])
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState<SearchUser[]>([])
  const [info,     setInfo]     = useState('')
  const [loading,  setLoading]  = useState(false)

  const fetchFriends  = useCallback(async () => { const r = await fetch(`${API}/api/friends`, { headers: hdr }); if (r.ok) setFriends(await r.json()) }, [token])
  const fetchRequests = useCallback(async () => { const r = await fetch(`${API}/api/friends/requests`, { headers: hdr }); if (r.ok) setRequests(await r.json()) }, [token])

  useEffect(() => { fetchFriends(); fetchRequests() }, [fetchFriends, fetchRequests])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`${API}/api/users/search?q=${encodeURIComponent(search)}`, { headers: hdr })
      if (r.ok) setResults(await r.json())
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const sendRequest = async (username: string) => {
    setLoading(true)
    const r = await fetch(`${API}/api/friends/request`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
    const d = await r.json()
    setInfo(r.ok ? `Request sent to @${username}!` : (d.error ?? 'Error'))
    setLoading(false); setTimeout(() => setInfo(''), 3000)
  }

  const accept = async (id: string) => {
    await fetch(`${API}/api/friends/${id}/accept`, { method: 'POST', headers: hdr })
    fetchFriends(); fetchRequests()
  }

  const decline = async (id: string) => {
    await fetch(`${API}/api/friends/${id}`, { method: 'DELETE', headers: hdr })
    fetchRequests()
  }

  const remove = async (friendId: string) => {
    if (!confirm('Remove this friend?')) return
    await fetch(`${API}/api/friends/${friendId}`, { method: 'DELETE', headers: hdr })
    fetchFriends()
  }

  return (
    <>
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30]">
          <h2 className="text-white font-bold text-base mb-3">Friends</h2>
          <div className="flex gap-1.5">
            {(['all','requests','find'] as const).map(k => (
              <button key={k} onClick={() => setSub(k)}
                className={`flex-1 py-1.5 text-xs rounded-lg transition-all capitalize ${sub === k ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white hover:bg-[#1E1E30]'}`}>
                {k === 'requests' && requests.length > 0 ? `Req (${requests.length})` : k}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sub === 'all' && (
            friends.length === 0
              ? <EmptyState icon="👥" text="No friends yet" sub="Use the Find tab to add people" />
              : friends.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#12121E] transition-colors group">
                  <Avatar name={f.username} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{f.username}</p>
                    <p className="text-xs text-green-400">Friend</p>
                  </div>
                  <button onClick={() => remove(f.friendId)} className="opacity-0 group-hover:opacity-100 text-[#4B5563] hover:text-red-400 text-xs transition-all">Remove</button>
                </div>
              ))
          )}
          {sub === 'requests' && (
            requests.length === 0
              ? <EmptyState icon="📬" text="No pending requests" />
              : requests.map(req => (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#12121E] transition-colors">
                  <Avatar name={req.username} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{req.username}</p>
                    <p className="text-xs text-[#4B5563]">Wants to be friends</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => accept(req.id)} className="px-2.5 py-1 text-xs bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/25 transition-all">✓</button>
                    <button onClick={() => decline(req.id)} className="px-2.5 py-1 text-xs bg-[#12121E] border border-[#1E1E30] text-[#4B5563] rounded-lg hover:text-red-400 transition-all">✕</button>
                  </div>
                </div>
              ))
          )}
          {sub === 'find' && (
            <div className="p-4 space-y-3">
              <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-3 py-2 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 transition-colors"
                placeholder="Search by username..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
              {info && <p className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">{info}</p>}
              {results.map(u => (
                <div key={u.id} className="flex items-center gap-3 bg-[#12121E] rounded-xl p-3">
                  <Avatar name={u.username} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{u.username}</p>
                  </div>
                  <button onClick={() => sendRequest(u.username)} disabled={loading}
                    className="px-3 py-1.5 text-xs bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/25 transition-all disabled:opacity-40">
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-20 h-20 rounded-full bg-[#12121E] border border-[#1E1E30] flex items-center justify-center text-3xl">👥</div>
        <p className="text-white font-semibold">{friends.length} Friends</p>
        <p className="text-[#4B5563] text-sm">Your friend list is end-to-end encrypted.</p>
      </div>
    </>
  )
}

// ─── PENDING TAB ──────────────────────────────────────────────────────────────
function PendingTab({ userId, token, privateKey, publicKey, hdr }: {
  userId: string; token: string; privateKey: CryptoKey; publicKey: string; hdr: Record<string, string>
}) {
  const [pending, setPending] = useState<PendingMsg[]>([])
  const [active,  setActive]  = useState<PendingMsg | null>(null)
  const [sendTo,  setSendTo]  = useState('')
  const [sendMsg, setSendMsg] = useState('')
  const [sendRes, setSendRes] = useState<SearchUser | null>(null)
  const [info,    setInfo]    = useState('')

  const fetchPending = useCallback(async () => {
    const res = await fetch(`${API}/api/pending`, { headers: hdr })
    if (!res.ok) return
    const list: PendingMsg[] = await res.json()
    const decrypted = await Promise.all(list.map(async m => {
      try {
        const bundle = JSON.parse(m.bundle)
        m.text = await decryptMessage(bundle, userId, privateKey)
      } catch (err) { console.warn('[decrypt] pending msg', m.id, 'failed:', err); m.text = '[encrypted — key mismatch]' }
      return m
    }))
    setPending(decrypted)
  }, [token])

  useEffect(() => { fetchPending() }, [fetchPending])

  const accept = async (m: PendingMsg) => {
    const res = await fetch(`${API}/api/pending/${m.id}/accept`, { method: 'POST', headers: hdr })
    if (res.ok) { fetchPending(); setActive(null) }
  }

  const dismiss = async (id: string) => {
    await fetch(`${API}/api/pending/${id}`, { method: 'DELETE', headers: hdr })
    setPending(p => p.filter(m => m.id !== id))
    if (active?.id === id) setActive(null)
  }

  const searchUser = async () => {
    if (!sendTo.trim()) return
    const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(sendTo)}`, { headers: hdr })
    if (res.ok) { const list: SearchUser[] = await res.json(); setSendRes(list[0] ?? null) }
  }

  const sendPending = async () => {
    if (!sendRes || !sendMsg.trim()) return
    try {
      const recipients = [
        { id: userId, publicKey },
        { id: sendRes.id, publicKey: sendRes.publicKey! },
      ]
      const bundle = await encryptMessage(sendMsg, recipients)
      const res = await fetch(`${API}/api/pending/send/${sendRes.id}`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: JSON.stringify(bundle) }),
      })
      if (res.ok) { setInfo('Message sent!'); setSendMsg(''); setSendRes(null); setSendTo('') }
      else { const d = await res.json(); setInfo(d.error ?? 'Error') }
    } catch { setInfo('Encryption failed') }
    setTimeout(() => setInfo(''), 3000)
  }

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })

  return (
    <>
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30]">
          <h2 className="text-white font-bold text-base">Pending Messages</h2>
          <p className="text-xs text-[#4B5563] mt-0.5">Requests from people not in your friends</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pending.length === 0
            ? <EmptyState icon="📥" text="No pending messages" />
            : pending.map(m => (
              <button key={m.id} onClick={() => setActive(m)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  active?.id === m.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-[#12121E] border-l-2 border-transparent'
                }`}>
                <Avatar name={m.fromUsername} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.fromUsername}</p>
                  <p className="text-xs text-[#4B5563] truncate">{m.text ?? '...'}</p>
                  <p className="text-[10px] text-[#4B5563]/60">{fmt(m.createdAt)}</p>
                </div>
              </button>
            ))
          }
        </div>

        {/* Send pending */}
        <div className="p-3 border-t border-[#1E1E30] space-y-2">
          <p className="text-xs text-[#4B5563] uppercase tracking-wider">Send to non-friend</p>
          <div className="flex gap-1.5">
            <input className="flex-1 bg-[#12121E] border border-[#1E1E30] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
              placeholder="Username..." value={sendTo} onChange={e => setSendTo(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchUser()} />
            <button onClick={searchUser} className="px-2 text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/30">Find</button>
          </div>
          {sendRes && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 bg-[#12121E] rounded-lg px-2 py-1.5">
                <Avatar name={sendRes.username} size={22} />
                <p className="text-xs text-white">{sendRes.username}</p>
              </div>
              <textarea className="w-full bg-[#12121E] border border-[#1E1E30] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 resize-none"
                placeholder="Message..." rows={2} value={sendMsg} onChange={e => setSendMsg(e.target.value)} />
              <button onClick={sendPending} className="w-full py-1.5 text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-all">Send →</button>
            </div>
          )}
          {info && <p className="text-xs text-center text-indigo-400">{info}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {active ? (
          <div className="flex-1 flex flex-col p-8 max-w-xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-6">
              <Avatar name={active.fromUsername} size={48} />
              <div>
                <p className="font-semibold text-white">{active.fromUsername}</p>
                <p className="text-xs text-[#4B5563]">{fmt(active.createdAt)}</p>
              </div>
            </div>
            <div className="bg-[#12121E] border border-[#1E1E30] rounded-2xl p-6 mb-6">
              <p className="text-white leading-relaxed">{active.text ?? '[encrypted]'}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => accept(active)}
                className="flex-1 py-3 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl hover:bg-indigo-500/30 transition-all font-semibold">
                Accept & Start Chat
              </button>
              <button onClick={() => dismiss(active.id)}
                className="px-6 py-3 bg-[#12121E] border border-[#1E1E30] text-[#4B5563] rounded-xl hover:text-red-400 hover:border-red-500/30 transition-all">
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <EmptyState icon="📥" text="Select a pending message" sub="Accept to start a conversation, or dismiss to ignore" />
        )}
      </div>
    </>
  )
}

// ─── STORIES TAB ─────────────────────────────────────────────────────────────
function StoriesTab({ userId, username: _u, hdr }: { userId: string; username: string; hdr: Record<string, string> }) {
  const [stories,  setStories]  = useState<Story[]>([])
  const [content,  setContent]  = useState('')
  const [posting,  setPosting]  = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [active,   setActive]   = useState<Story | null>(null)

  const fetchStories = useCallback(async () => {
    const r = await fetch(`${API}/api/notes`, { headers: hdr })
    if (r.ok) setStories(await r.json())
  }, [hdr])

  useEffect(() => { fetchStories() }, [fetchStories])

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setPosting(true)
    await fetch(`${API}/api/notes`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
    setContent(''); setShowForm(false); setPosting(false); fetchStories()
  }

  const timeLeft = (exp: number) => {
    const s = exp - Math.floor(Date.now()/1000)
    if (s <= 0) return 'Expired'
    const h = Math.floor(s/3600)
    return h > 0 ? `${h}h left` : `${Math.floor(s/60)}m left`
  }

  const isMine = (s: Story) => s.userId === userId

  return (
    <>
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30] flex items-center justify-between">
          <h2 className="text-white font-bold text-base">Stories</h2>
          <button onClick={() => setShowForm(s => !s)}
            className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-lg flex items-center justify-center hover:bg-indigo-500/30 transition-all">
            +
          </button>
        </div>
        {showForm && (
          <form onSubmit={post} className="p-4 border-b border-[#1E1E30] space-y-2">
            <textarea className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-3 py-2 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
              placeholder="What's on your mind? (24h)" rows={3} value={content} onChange={e => setContent(e.target.value)} maxLength={500} autoFocus />
            <div className="flex gap-2">
              <button type="submit" disabled={posting || !content.trim()}
                className="flex-1 py-1.5 text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/30 disabled:opacity-40 transition-all">
                {posting ? 'Posting...' : 'Post Story'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-3 text-xs text-[#4B5563] hover:text-white transition-colors">Cancel</button>
            </div>
          </form>
        )}
        <div className="flex-1 overflow-y-auto">
          {stories.length === 0
            ? <EmptyState icon="📖" text="No stories yet" sub="Be first to share!" />
            : stories.map(s => (
              <button key={s.id} onClick={() => setActive(s)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  active?.id === s.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-[#12121E] border-l-2 border-transparent'
                }`}>
                <div className="relative shrink-0">
                  <Avatar name={s.userId.slice(0, 6)} size={40} />
                  {isMine(s) && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-[#0E0E1C]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{isMine(s) ? 'You' : s.userId.slice(0,8)+'...'}</p>
                  <p className="text-xs text-[#4B5563] truncate">{s.content}</p>
                  <p className="text-[10px] text-[#4B5563]/60">{timeLeft(s.expiresAt)}</p>
                </div>
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {active ? (
          <div className="max-w-lg w-full">
            <div className="bg-[#12121E] border border-[#1E1E30] rounded-2xl p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={active.userId.slice(0,6)} size={48} />
                <div>
                  <p className="font-semibold text-white text-sm">{isMine(active) ? 'You' : active.userId.slice(0,8)+'...'}</p>
                  <p className="text-xs text-[#4B5563]">{timeLeft(active.expiresAt)}</p>
                </div>
              </div>
              <p className="text-white text-base leading-relaxed">{active.content}</p>
            </div>
          </div>
        ) : (
          <EmptyState icon="📖" text="Select a story to view" sub="Stories disappear after 24 hours" />
        )}
      </div>
    </>
  )
}

// ─── NOTES TAB ────────────────────────────────────────────────────────────────
const NOTES_KEY = 'amoon:private-notes'

function NotesTab() {
  const [notes,   setNotes]   = useState<Note[]>([])
  const [active,  setActive]  = useState<Note | null>(null)
  const [text,    setText]    = useState('')
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(NOTES_KEY)
    const parsed: Note[] = raw ? JSON.parse(raw) : []
    setNotes(parsed)
    if (parsed.length > 0) { setActive(parsed[0]); setText(parsed[0].text) }
  }, [])

  const save = (list: Note[]) => { setNotes(list); localStorage.setItem(NOTES_KEY, JSON.stringify(list)) }

  const newNote = () => {
    const note: Note = { id: Date.now().toString(), text: '', updatedAt: Date.now() }
    save([note, ...notes]); setActive(note); setText(''); setChanged(false)
  }

  const saveNote = () => {
    if (!active) return
    const updated = notes.map(n => n.id === active.id ? { ...n, text, updatedAt: Date.now() } : n)
    save(updated); setActive(prev => prev ? { ...prev, text } : prev); setChanged(false)
  }

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id); save(updated)
    if (active?.id === id) { const next = updated[0] ?? null; setActive(next); setText(next?.text ?? '') }
  }

  return (
    <>
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30] flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Notes</h2>
            <p className="text-[#4B5563]/60 text-xs">Private · Local only</p>
          </div>
          <button onClick={newNote}
            className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-lg flex items-center justify-center hover:bg-indigo-500/30 transition-all">
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notes.length === 0
            ? <EmptyState icon="📝" text="No notes yet" sub="Click + to create" />
            : notes.map(n => (
              <button key={n.id} onClick={() => { setActive(n); setText(n.text); setChanged(false) }}
                className={`w-full text-left px-4 py-3 transition-colors group ${
                  active?.id === n.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-[#12121E] border-l-2 border-transparent'
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{n.text.split('\n')[0] || 'Empty note'}</p>
                    <p className="text-xs text-[#4B5563] mt-0.5">{new Date(n.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteNote(n.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[#4B5563] hover:text-red-400 transition-all text-sm">✕</button>
                </div>
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {active ? (
          <>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#1E1E30] bg-[#0E0E1C] shrink-0">
              <p className="text-sm text-[#4B5563]">
                {changed ? <span className="text-yellow-400">Unsaved changes</span> : `Saved ${new Date(active.updatedAt).toLocaleTimeString()}`}
              </p>
              <button onClick={saveNote} disabled={!changed}
                className="px-4 py-1.5 text-xs bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-lg hover:bg-indigo-500/25 disabled:opacity-30 transition-all">
                Save
              </button>
            </div>
            <textarea
              className="flex-1 bg-[#08080F] text-white text-sm leading-relaxed p-8 resize-none focus:outline-none placeholder:text-[#4B5563]/50"
              placeholder="Start writing..." value={text}
              onChange={e => { setText(e.target.value); setChanged(true) }}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveNote() } }}
            />
            <div className="px-6 py-2 border-t border-[#1E1E30] bg-[#0E0E1C] text-xs text-[#4B5563]/50 flex justify-between shrink-0">
              <span>🔒 Private — never leaves this device</span>
              <span>Ctrl+S to save</span>
            </div>
          </>
        ) : (
          <EmptyState icon="📝" text="Select or create a note" sub="Notes are stored privately on this device" />
        )}
      </div>
    </>
  )
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab({ userId, token, hdr }: { userId: string; token: string; hdr: Record<string, string> }) {
  const { logout } = useAuthStore()
  const [sub,         setSub]         = useState<'profile'|'security'|'blocks'|'passphrase'>('profile')
  const [profile,     setProfile]     = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio,         setBio]         = useState('')
  const [saving,      setSaving]      = useState(false)
  const [info,        setInfo]        = useState('')
  // TOTP
  const [totpSecret,  setTotpSecret]  = useState('')
  const [totpUrl,     setTotpUrl]     = useState('')
  const [totpCode,    setTotpCode]    = useState('')
  // Blocks
  const [blocks,      setBlocks]      = useState<BlockedUser[]>([])
  // Passphrase
  const [oldPass,     setOldPass]     = useState('')
  const [newPass,     setNewPass]     = useState('')
  const [confPass,    setConfPass]    = useState('')

  useEffect(() => {
    fetch(`${API}/api/users/me`, { headers: hdr }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setProfile(d); setDisplayName(d.displayName ?? ''); setBio(d.bio ?? '')
    })
    fetch(`${API}/api/blocks`, { headers: hdr }).then(r => r.ok ? r.json() : []).then(setBlocks)
  }, [token])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const res = await fetch(`${API}/api/users/me`, { method: 'PATCH', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, bio }) })
    setInfo(res.ok ? 'Profile updated!' : 'Save failed'); setSaving(false)
    setTimeout(() => setInfo(''), 3000)
  }

  const startTotp = async () => {
    const res = await fetch(`${API}/api/users/totp/setup`, { method: 'POST', headers: hdr })
    if (res.ok) { const d = await res.json(); setTotpSecret(d.secret); setTotpUrl(d.url) }
  }

  const verifyTotp = async () => {
    const res = await fetch(`${API}/api/users/totp/verify`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode }) })
    setInfo(res.ok ? 'TOTP enabled!' : 'Invalid code'); setTimeout(() => setInfo(''), 3000)
    if (res.ok) { setTotpSecret(''); setTotpUrl(''); setTotpCode(''); setProfile(p => p ? { ...p, totpEnabled: true } : p) }
  }

  const disableTotp = async () => {
    if (!totpCode.trim() || !confirm('Disable 2FA?')) return
    const res = await fetch(`${API}/api/users/totp/disable`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode }) })
    setInfo(res.ok ? 'TOTP disabled' : 'Invalid code'); setTimeout(() => setInfo(''), 3000)
    if (res.ok) { setTotpCode(''); setProfile(p => p ? { ...p, totpEnabled: false } : p) }
  }

  const unblock = async (uid: string) => {
    await fetch(`${API}/api/blocks/${uid}`, { method: 'DELETE', headers: hdr })
    setBlocks(b => b.filter(u => u.id !== uid))
  }

  const changePassphrase = async () => {
    if (newPass !== confPass) { setInfo("Passphrases don't match"); return }
    if (!newPass.trim())      { setInfo('Enter new passphrase'); return }
    setSaving(true)
    try {
      // Load private key raw from IDB, re-encrypt with new passphrase
      const { openDB } = await import('idb')
      const db  = await openDB('amoon-keystore', 1)
      const raw = await db.get('keys', `pk:${userId}`)
      if (!raw) { setInfo('Private key not found on this device'); setSaving(false); return }
      const { bundle, saltHex } = await encryptPrivateKeyWithPassphrase(raw as string, newPass)
      const res = await fetch(`${API}/api/auth/store-encrypted-key`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedKey: bundle, keySalt: saltHex }),
      })
      setInfo(res.ok ? 'Passphrase updated!' : 'Update failed')
    } catch { setInfo('Error updating passphrase') }
    setSaving(false); setTimeout(() => setInfo(''), 3000)
  }

  const genInvite = async () => {
    const res = await fetch(`${API}/api/users/invite-link`, { headers: hdr })
    if (res.ok) { const d = await res.json(); setInfo(`Invite link: ${d.link}`); }
  }

  const TABS = [
    { key: 'profile',    label: 'Profile' },
    { key: 'security',   label: 'Security' },
    { key: 'blocks',     label: `Blocks${blocks.length ? ` (${blocks.length})` : ''}` },
    { key: 'passphrase', label: 'Passphrase' },
  ] as const

  return (
    <>
      <div className="w-56 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30]">
          <h2 className="text-white font-bold text-base">Settings</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setSub(key)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all mb-0.5 ${
                sub === key ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white hover:bg-[#1E1E30]'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[#1E1E30]">
          <button onClick={logout} className="w-full py-2 text-xs text-red-400 hover:bg-red-950/30 rounded-xl transition-all">Sign out</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-md">
          {info && <div className="mb-4 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5">{info}</div>}

          {sub === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4">
              <h3 className="text-white font-bold text-lg mb-4">Profile</h3>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Username</label>
                <div className="bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-[#4B5563]">@{profile?.username}</div>
              </div>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Display Name</label>
                <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Bio</label>
                <textarea className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
                  placeholder="About you..." rows={3} value={bio} onChange={e => setBio(e.target.value)} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl hover:bg-indigo-500/30 disabled:opacity-50 transition-all font-semibold">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button type="button" onClick={genInvite}
                className="w-full py-2.5 bg-[#12121E] border border-[#1E1E30] text-[#4B5563] rounded-xl hover:text-white transition-all text-sm">
                Generate Invite Link
              </button>
            </form>
          )}

          {sub === 'security' && (
            <div className="space-y-6">
              <h3 className="text-white font-bold text-lg">Two-Factor Auth (TOTP)</h3>
              {profile?.totpEnabled ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                    <span className="text-green-400">✓</span>
                    <p className="text-green-400 text-sm">TOTP is enabled</p>
                  </div>
                  <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                    placeholder="Enter code to disable..." value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6} />
                  <button onClick={disableTotp} className="w-full py-2.5 bg-red-950/30 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-950/50 transition-all text-sm">Disable TOTP</button>
                </div>
              ) : totpSecret ? (
                <div className="space-y-3">
                  <div className="bg-[#12121E] border border-[#1E1E30] rounded-xl p-4 space-y-2">
                    <p className="text-xs text-[#4B5563]">Scan this URL in your authenticator app:</p>
                    <p className="text-xs text-indigo-400 break-all">{totpUrl}</p>
                    <p className="text-xs text-[#4B5563] mt-2">Secret: <span className="text-white font-mono">{totpSecret}</span></p>
                  </div>
                  <input className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                    placeholder="Enter 6-digit code to verify..." value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6} />
                  <button onClick={verifyTotp} className="w-full py-2.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl hover:bg-indigo-500/30 transition-all">Verify & Enable</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[#4B5563]">Add an extra layer of security with a TOTP authenticator app.</p>
                  <button onClick={startTotp} className="w-full py-2.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl hover:bg-indigo-500/30 transition-all">Setup TOTP</button>
                </div>
              )}
            </div>
          )}

          {sub === 'blocks' && (
            <div className="space-y-4">
              <h3 className="text-white font-bold text-lg">Blocked Users</h3>
              {blocks.length === 0
                ? <EmptyState icon="🚫" text="No blocked users" />
                : blocks.map(u => (
                  <div key={u.id} className="flex items-center gap-3 bg-[#12121E] border border-[#1E1E30] rounded-xl p-4">
                    <Avatar name={u.username} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{u.username}</p>
                      <p className="text-xs text-[#4B5563]">Blocked {new Date(u.createdAt * 1000).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => unblock(u.id)} className="px-3 py-1.5 text-xs bg-[#1E1E30] border border-[#2E2E45] text-[#4B5563] rounded-lg hover:text-white transition-all">Unblock</button>
                  </div>
                ))
              }
            </div>
          )}

          {sub === 'passphrase' && (
            <div className="space-y-4">
              <h3 className="text-white font-bold text-lg">Passphrase Backup</h3>
              <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400 text-xs leading-relaxed">
                  ⚠ Your passphrase encrypts your private key backup on the server. If you change it, the old passphrase will no longer work to restore your key on new devices.
                </p>
              </div>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Old Passphrase (to verify)</label>
                <input type="password" className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Old passphrase..." value={oldPass} onChange={e => setOldPass(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">New Passphrase</label>
                <input type="password" className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                  placeholder="New passphrase..." value={newPass} onChange={e => setNewPass(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Confirm New Passphrase</label>
                <input type="password" className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Confirm..." value={confPass} onChange={e => setConfPass(e.target.value)} />
              </div>
              <button onClick={changePassphrase} disabled={saving}
                className="w-full py-3 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl hover:bg-indigo-500/30 disabled:opacity-50 transition-all font-semibold">
                {saving ? 'Updating...' : 'Update Passphrase'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── ADMIN TAB ────────────────────────────────────────────────────────────────
function AdminTab({ hdr }: { hdr: Record<string, string> }) {
  const [reports, setReports] = useState<Report[]>([])
  const [active,  setActive]  = useState<Report | null>(null)
  const [note,    setNote]    = useState('')
  const [filter,  setFilter]  = useState<'pending'|'all'>('pending')

  useEffect(() => {
    fetch(`${API}/api/moderation/admin/reports`, { headers: hdr }).then(r => r.ok ? r.json() : []).then(setReports)
  }, [hdr])

  const action = async (id: string, act: string) => {
    const res = await fetch(`${API}/api/moderation/admin/reports/${id}/action`, {
      method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, adminNote: note }),
    })
    if (res.ok) {
      setReports(r => r.map(rep => rep.id === id ? { ...rep, status: act, adminNote: note } : rep))
      setActive(null); setNote('')
    }
  }

  const filtered = filter === 'pending' ? reports.filter(r => r.status === 'pending') : reports

  const statusColor = (s: string) => s === 'pending' ? 'text-yellow-400' : s === 'banned' ? 'text-red-400' : 'text-green-400'

  return (
    <>
      <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
        <div className="p-4 border-b border-[#1E1E30]">
          <h2 className="text-white font-bold text-base">Admin Panel</h2>
          <div className="flex gap-1.5 mt-3">
            {(['pending','all'] as const).map(k => (
              <button key={k} onClick={() => setFilter(k)}
                className={`flex-1 py-1.5 text-xs rounded-lg transition-all capitalize ${filter === k ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4B5563] hover:text-white hover:bg-[#1E1E30]'}`}>
                {k === 'pending' ? `Pending (${reports.filter(r=>r.status==='pending').length})` : 'All Reports'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0
            ? <EmptyState icon="✅" text="No reports" sub={filter === 'pending' ? 'All clear!' : 'No reports yet'} />
            : filtered.map(r => (
              <button key={r.id} onClick={() => { setActive(r); setNote(r.adminNote ?? '') }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  active?.id === r.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-[#12121E] border-l-2 border-transparent'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white truncate">@{r.reportedUsername}</p>
                    <span className={`text-[10px] ${statusColor(r.status)}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-[#4B5563] truncate">{r.reason}</p>
                  <p className="text-[10px] text-[#4B5563]/60">by @{r.reporterUsername}</p>
                </div>
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {active ? (
          <div className="max-w-lg space-y-4">
            <div>
              <h3 className="text-white font-bold text-lg mb-1">Report #{active.id.slice(0,8)}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(active.status)} bg-current/10 border-current/30`}>{active.status}</span>
            </div>
            <div className="bg-[#12121E] border border-[#1E1E30] rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-[#4B5563]">Reporter</p><p className="text-white">@{active.reporterUsername}</p></div>
                <div><p className="text-xs text-[#4B5563]">Reported</p><p className="text-white">@{active.reportedUsername}</p></div>
                <div><p className="text-xs text-[#4B5563]">Reason</p><p className="text-white">{active.reason}</p></div>
                <div><p className="text-xs text-[#4B5563]">Date</p><p className="text-white">{new Date(active.createdAt * 1000).toLocaleDateString()}</p></div>
              </div>
              {active.detail && <div><p className="text-xs text-[#4B5563]">Detail</p><p className="text-white text-sm mt-1">{active.detail}</p></div>}
            </div>
            <div>
              <label className="block text-xs text-[#4B5563] mb-1.5 uppercase tracking-wider">Admin Note</label>
              <textarea className="w-full bg-[#12121E] border border-[#1E1E30] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#4B5563] focus:outline-none focus:border-indigo-500/50 resize-none"
                placeholder="Note for admin log..." rows={2} value={note} onChange={e => setNote(e.target.value)} />
            </div>
            {active.status === 'pending' && (
              <div className="flex gap-3">
                <button onClick={() => action(active.id, 'banned')}
                  className="flex-1 py-2.5 bg-red-950/30 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-950/50 transition-all text-sm">
                  Ban User
                </button>
                <button onClick={() => action(active.id, 'dismissed')}
                  className="flex-1 py-2.5 bg-[#12121E] border border-[#1E1E30] text-[#4B5563] rounded-xl hover:text-white transition-all text-sm">
                  Dismiss
                </button>
                <button onClick={() => action(active.id, 'warned')}
                  className="flex-1 py-2.5 bg-yellow-950/20 border border-yellow-500/20 text-yellow-400 rounded-xl hover:bg-yellow-950/40 transition-all text-sm">
                  Warn
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="🛡️" text="Select a report to review" sub="Take action to keep the community safe" />
        )}
      </div>
    </>
  )
}

// ─── CALLS TAB ────────────────────────────────────────────────────────────────
// WebRTC voice/video calls using TURN from server + WebSocket signaling
interface IceServer { urls: string | string[]; username?: string; credential?: string }
type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'

function CallsTab({ userId, username, token, hdr }: { userId: string; username: string; token: string; hdr: Record<string, string> }) {
  const [friends,   setFriends]   = useState<Friend[]>([])
  const [callState, setCallState] = useState<CallState>('idle')
  const [callWith,  setCallWith]  = useState<Friend | null>(null)
  const [isVideo,   setIsVideo]   = useState(false)
  const [muted,     setMuted]     = useState(false)
  const [camOff,    setCamOff]    = useState(false)
  const [iceServers,setIceServers]= useState<IceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromId: string; offer: RTCSessionDescriptionInit } | null>(null)

  const pcRef      = useRef<RTCPeerConnection | null>(null)
  const wsRef      = useRef<WebSocket | null>(null)
  const localRef   = useRef<HTMLVideoElement>(null)
  const remoteRef  = useRef<HTMLVideoElement>(null)
  const localStream= useRef<MediaStream | null>(null)

  // Load friends + TURN credentials
  useEffect(() => {
    fetch(`${API}/api/friends`, { headers: hdr }).then(r => r.ok ? r.json() : []).then(setFriends)
    fetch(`${API}/api/calls/turn-credentials`, { headers: hdr }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.iceServers) setIceServers(Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers])
    })
  }, [token])

  // Signaling WebSocket (reuse a dedicated "calls" room via query param type=signal)
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws?token=${token}&room=signal:${userId}`)
    wsRef.current = ws
    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'call-offer') {
          setIncomingCall({ from: msg.fromUsername, fromId: msg.fromUserId, offer: msg.offer })
        } else if (msg.type === 'call-answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(msg.answer)
        } else if (msg.type === 'call-ice' && pcRef.current) {
          await pcRef.current.addIceCandidate(msg.candidate)
        } else if (msg.type === 'call-end') {
          hangup()
        }
      } catch { /* ignore */ }
    }
    return () => ws.close()
  }, [token, userId])

  const sendSignal = (toId: string, payload: object) => {
    wsRef.current?.send(JSON.stringify({ ...payload, toUserId: toId }))
  }

  const createPC = () => {
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc
    pc.onicecandidate = (e) => {
      if (e.candidate && callWith) sendSignal(callWith.friendId, { type: 'call-ice', candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected')
      if (['disconnected','failed','closed'].includes(pc.connectionState)) hangup()
    }
    return pc
  }

  const startCall = async (friend: Friend, video: boolean) => {
    setCallWith(friend); setIsVideo(video); setCallState('calling')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    localStream.current = stream
    if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true }
    const pc = createPC()
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendSignal(friend.friendId, { type: 'call-offer', fromId: userId, fromUsername: username, offer })
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    setCallState('connected')
    const fakeF: Friend = { id: incomingCall.fromId, username: incomingCall.from, publicKey: '', friendId: incomingCall.fromId }
    setCallWith(fakeF)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo })
    localStream.current = stream
    if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true }
    const pc = createPC()
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    await pc.setRemoteDescription(incomingCall.offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    sendSignal(incomingCall.fromId, { type: 'call-answer', answer })
    setIncomingCall(null)
  }

  const hangup = () => {
    if (callWith) sendSignal(callWith.friendId, { type: 'call-end' })
    localStream.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    pcRef.current = null; localStream.current = null
    if (localRef.current)  localRef.current.srcObject = null
    if (remoteRef.current) remoteRef.current.srcObject = null
    setCallState('idle'); setCallWith(null); setIncomingCall(null)
  }

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted; })
    setMuted(m => !m)
  }

  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = camOff; })
    setCamOff(c => !c)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Incoming call banner */}
      {incomingCall && (
        <div className="flex items-center gap-4 px-6 py-4 bg-green-950/40 border-b border-green-500/20">
          <div className="flex-1">
            <p className="text-white font-semibold">Incoming call from <span className="text-green-400">@{incomingCall.from}</span></p>
          </div>
          <button onClick={acceptCall} className="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-400 rounded-xl hover:bg-green-500/30 transition-all text-sm">Accept</button>
          <button onClick={() => { sendSignal(incomingCall.fromId, { type: 'call-end' }); setIncomingCall(null) }}
            className="px-4 py-2 bg-red-950/30 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-950/50 transition-all text-sm">Decline</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Friends list */}
        <div className="w-72 shrink-0 border-r border-[#1E1E30] flex flex-col bg-[#0E0E1C]">
          <div className="p-4 border-b border-[#1E1E30]">
            <h2 className="text-white font-bold text-base">Calls</h2>
            <p className="text-xs text-[#4B5563] mt-0.5">Call your friends</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friends.length === 0
              ? <EmptyState icon="📞" text="No friends yet" sub="Add friends to call them" />
              : friends.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#12121E] transition-colors">
                  <Avatar name={f.username} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{f.username}</p>
                    <p className="text-xs text-green-400">Online</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => startCall(f, false)} title="Voice call"
                      className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/30 transition-all">
                      <IconPhone size={14} />
                    </button>
                    <button onClick={() => startCall(f, true)} title="Video call"
                      className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/30 transition-all">
                      <IconVideo size={14} />
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Call area */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#08080F] relative">
          {callState === 'idle' && !incomingCall && (
            <EmptyState icon="📞" text="No active call" sub="Click the phone icon next to a friend to call them" />
          )}

          {(callState === 'calling' || callState === 'ringing') && (
            <div className="flex flex-col items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-indigo-500/20 border-2 border-indigo-500/40 flex items-center justify-center animate-pulse">
                <Avatar name={callWith?.username ?? '?'} size={80} />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-xl">{callWith?.username}</p>
                <p className="text-[#4B5563] text-sm mt-1">{callState === 'calling' ? 'Calling...' : 'Incoming...'}</p>
              </div>
              <button onClick={hangup} className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-all">
                <IconPhoneOff size={22} />
              </button>
            </div>
          )}

          {callState === 'connected' && (
            <>
              {/* Video area */}
              <div className="w-full flex-1 relative bg-[#050508] flex items-center justify-center">
                {isVideo ? (
                  <>
                    <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <video ref={localRef} autoPlay playsInline muted className="absolute bottom-4 right-4 w-36 h-24 rounded-xl object-cover border border-[#1E1E30]" />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full border-2 border-green-500/40 flex items-center justify-center">
                      <Avatar name={callWith?.username ?? '?'} size={80} />
                    </div>
                    <p className="text-white font-semibold text-xl">{callWith?.username}</p>
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
                      Connected
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4 px-8 py-5 border-t border-[#1E1E30] bg-[#0E0E1C]">
                <button onClick={toggleMute}
                  className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${muted ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-[#1E1E30] border-[#2E2E45] text-[#4B5563] hover:text-white'}`}>
                  {muted ? <IconMicOff size={18} /> : <IconMic size={18} />}
                </button>
                {isVideo && (
                  <button onClick={toggleCam}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${camOff ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-[#1E1E30] border-[#2E2E45] text-[#4B5563] hover:text-white'}`}>
                    {camOff ? <IconVideoOff size={18} /> : <IconVideo size={18} />}
                  </button>
                )}
                <button onClick={hangup} className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-all">
                  <IconPhoneOff size={22} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconChat({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
}
function IconFriends({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
}
function IconInbox({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
}
function IconStories({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
}
function IconNotes({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
}
function IconSettings({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
}
function IconAdmin({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
function IconLogout({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
}
function IconSend({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
function IconPhone({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}
function IconPhoneOff({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.01 2.21l1.29-1.29a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 1.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-2.57-2.57M6.69 6.69A19.79 19.79 0 0 0 1.61 3.4 2 2 0 0 0 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96" /><line x1="23" y1="1" x2="1" y2="23" /></svg>
}
function IconVideo({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
}
function IconVideoOff({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
}
function IconMic({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function IconMicOff({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
