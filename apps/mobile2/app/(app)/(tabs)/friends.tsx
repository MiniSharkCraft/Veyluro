import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar,
  Alert, ActivityIndicator, RefreshControl, Share,
} from 'react-native'
import { router } from 'expo-router'
import { friendsApi, usersApi, type FriendType, type FriendRequestType, type SearchUserType } from '../../../src/lib/api'
import { useRooms } from '../../../src/hooks/useRooms'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

type Subtab = 'all' | 'requests' | 'find'

export default function FriendsScreen() {
  const [subtab,      setSubtab]      = useState<Subtab>('all')
  const [friends,     setFriends]     = useState<FriendType[]>([])
  const [requests,    setRequests]    = useState<FriendRequestType[]>([])
  const [search,      setSearch]      = useState('')
  const [results,     setResults]     = useState<SearchUserType[]>([])
  const [loading,     setLoading]     = useState(true)
  const [actionId,    setActionId]    = useState<string | null>(null)
  const [inviteLink,  setInviteLink]  = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [dmLoading,   setDmLoading]   = useState<string | null>(null)
  const { startDm } = useRooms()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [f, r] = await Promise.all([friendsApi.list(), friendsApi.requests()])
      setFriends(f)
      setRequests(r)
    } catch (e) {
      console.warn('[Friends]', e)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Search debounce
  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      try { setResults(await usersApi.search(search.trim())) }
      catch (e) { console.warn('[Friends search]', e) }
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const sendRequest = async (username: string) => {
    setActionId(username)
    try {
      await friendsApi.sendRequest(username)
      Alert.alert('Đã gửi', `Lời mời kết bạn tới @${username} đã được gửi!`)
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không gửi được lời mời')
    } finally { setActionId(null) }
  }

  const acceptRequest = async (id: string) => {
    setActionId(id)
    try { await friendsApi.accept(id); await fetchAll() }
    catch { Alert.alert('Lỗi', 'Không chấp nhận được') }
    finally { setActionId(null) }
  }

  const declineRequest = async (id: string) => {
    setActionId(id)
    try { await friendsApi.remove(id); await fetchAll() }
    catch { Alert.alert('Lỗi', 'Không từ chối được') }
    finally { setActionId(null) }
  }

  const handleGetInviteLink = async () => {
    setInviteLoading(true)
    try {
      const res = await usersApi.inviteLink()
      setInviteLink(res.link)
    } catch { Alert.alert('Lỗi', 'Không tạo được link') }
    finally { setInviteLoading(false) }
  }

  const handleShareInvite = async () => {
    if (!inviteLink) return
    try { await Share.share({ message: `Kết bạn với tôi trên AMoon Eclipse!\n${inviteLink}` }) }
    catch { /* ignore */ }
  }

  const handleStartDm = async (username: string) => {
    setDmLoading(username)
    try {
      const roomId = await startDm(username)
      router.push(`/(app)/room/${roomId}` as any)
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message ?? 'Không mở được cuộc trò chuyện')
    } finally { setDmLoading(null) }
  }

  const removeFriend = (friendId: string, username: string) => {
    Alert.alert('Xóa bạn bè', `Xóa @${username} khỏi danh sách bạn bè?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try { await friendsApi.remove(friendId); await fetchAll() }
        catch { Alert.alert('Lỗi', 'Không xóa được') }
      }},
    ])
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <Text style={s.headerSub}>AMoon Eclipse</Text>
        <Text style={s.headerTitle}>Bạn bè</Text>
      </View>

      {/* Subtab */}
      <View style={s.subtabRow}>
        {([
          ['all',      `Tất cả${friends.length ? ` (${friends.length})` : ''}`],
          ['requests', `Lời mời${requests.length ? ` (${requests.length})` : ''}`],
          ['find',     'Tìm kiếm'],
        ] as [Subtab, string][]).map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setSubtab(k)} style={[s.subtab, subtab === k && s.subtabOn]}>
            <Text style={[s.subtabTxt, subtab === k && s.subtabTxtOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subtab === 'all' && (
        <FlatList
          data={friends}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#6366F1" />}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            !loading ? (
              <View style={s.empty}>
                <Text style={s.emptyIco}>👥</Text>
                <Text style={s.emptyTxt}>Chưa có bạn bè nào</Text>
                <Text style={s.emptySub}>Tìm người bạn quen ở tab "Tìm kiếm"</Text>
              </View>
            ) : <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
          }
          renderItem={({ item }: { item: FriendType }) => (
            <View style={s.row}>
              <View style={[s.avatar, { backgroundColor: avatarBg(item.username) }]}>
                <Text style={s.avatarTxt}>{item.username[0].toUpperCase()}</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={s.rowName}>@{item.username}</Text>
                <Text style={s.rowSub}>Bạn bè · E2EE</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleStartDm(item.username)}
                  style={[s.msgBtn, dmLoading === item.username && { opacity: 0.5 }]}
                  disabled={dmLoading === item.username}
                >
                  {dmLoading === item.username
                    ? <ActivityIndicator color="#818CF8" size="small" />
                    : <Text style={s.msgBtnTxt}>💬</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeFriend(item.friendId, item.username)} style={s.removeBtn}>
                  <Text style={s.removeBtnTxt}>Xóa</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {subtab === 'requests' && (
        <FlatList
          data={requests}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#6366F1" />}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            !loading ? (
              <View style={s.empty}>
                <Text style={s.emptyIco}>📬</Text>
                <Text style={s.emptyTxt}>Không có lời mời nào</Text>
              </View>
            ) : <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
          }
          renderItem={({ item }: { item: FriendRequestType }) => (
            <View style={s.row}>
              <View style={[s.avatar, { backgroundColor: avatarBg(item.username) }]}>
                <Text style={s.avatarTxt}>{item.username[0].toUpperCase()}</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={s.rowName}>@{item.username}</Text>
                <Text style={s.rowSub}>Muốn kết bạn với bạn</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[s.acceptBtn, actionId === item.id && { opacity: 0.5 }]}
                  onPress={() => acceptRequest(item.id)}
                  disabled={actionId === item.id}
                >
                  {actionId === item.id
                    ? <ActivityIndicator color="#818CF8" size="small" />
                    : <Text style={s.acceptBtnTxt}>✓</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => declineRequest(item.id)}>
                  <Text style={s.rejectBtnTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {subtab === 'find' && (
        <View style={{ flex: 1 }}>
          {/* Invite link banner */}
          <View style={s.inviteBox}>
            <Text style={s.inviteTitle}>🔗 Link kết bạn của bạn</Text>
            {inviteLink ? (
              <>
                <Text style={s.inviteLinkTxt} numberOfLines={1}>{inviteLink}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={s.inviteBtn} onPress={async () => { try { await Share.share({ message: inviteLink }) } catch { /* */ } }}>
                    <Text style={s.inviteBtnTxt}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.inviteBtn, { backgroundColor: '#1E1B4B' }]} onPress={handleShareInvite}>
                    <Text style={[s.inviteBtnTxt, { color: '#818CF8' }]}>Chia sẻ</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={s.inviteGenBtn} onPress={handleGetInviteLink} disabled={inviteLoading}>
                {inviteLoading ? <ActivityIndicator color="#818CF8" size="small" /> : <Text style={s.inviteGenTxt}>Tạo link kết bạn</Text>}
              </TouchableOpacity>
            )}
          </View>

          <View style={s.findSearch}>
            <Text style={s.searchIco}>⌕</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Tìm theo username..."
              placeholderTextColor="#2E2E45"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={results}
            keyExtractor={i => i.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              search.trim() ? (
                <View style={s.empty}>
                  <Text style={s.emptyIco}>🔍</Text>
                  <Text style={s.emptyTxt}>Không tìm thấy ai</Text>
                </View>
              ) : (
                <View style={s.empty}>
                  <Text style={s.emptySub}>Nhập username để tìm người bạn biết</Text>
                </View>
              )
            }
            renderItem={({ item }: { item: SearchUserType }) => (
              <View style={s.row}>
                <View style={[s.avatar, { backgroundColor: avatarBg(item.username) }]}>
                  <Text style={s.avatarTxt}>{item.username[0].toUpperCase()}</Text>
                </View>
                <View style={s.rowInfo}>
                  <Text style={s.rowName}>@{item.username}</Text>
                </View>
                <TouchableOpacity
                  style={[s.addBtn, actionId === item.username && { opacity: 0.5 }]}
                  onPress={() => sendRequest(item.username)}
                  disabled={actionId === item.username}
                >
                  {actionId === item.username
                    ? <ActivityIndicator color="#818CF8" size="small" />
                    : <Text style={s.addBtnTxt}>+ Thêm</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#08080F' },
  header:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerSub:   { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },
  subtabRow:   { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  subtab:      { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: '#12121E' },
  subtabOn:    { backgroundColor: '#1E1B4B' },
  subtabTxt:   { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  subtabTxtOn: { color: '#818CF8' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  rowInfo:     { flex: 1 },
  rowName:     { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
  rowSub:      { color: '#64748B', fontSize: 13, marginTop: 2 },
  msgBtn:      { backgroundColor: '#1E1B4B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 36, alignItems: 'center' },
  msgBtnTxt:   { fontSize: 16 },
  removeBtn:   { backgroundColor: '#1A0A0A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  removeBtnTxt:{ color: '#EF4444', fontSize: 12, fontWeight: '600' },
  acceptBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E1B4B', alignItems: 'center', justifyContent: 'center' },
  acceptBtnTxt:{ color: '#818CF8', fontSize: 16, fontWeight: '700' },
  rejectBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A0A0A', alignItems: 'center', justifyContent: 'center' },
  rejectBtnTxt:{ color: '#EF4444', fontSize: 14 },
  addBtn:      { backgroundColor: '#1E1B4B', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnTxt:   { color: '#818CF8', fontSize: 13, fontWeight: '700' },
  inviteBox:    { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#0E0E1C', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E3A5F' },
  inviteTitle:  { color: '#818CF8', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  inviteLinkTxt:{ color: '#6366F1', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },
  inviteBtn:    { flex: 1, backgroundColor: '#12121E', borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  inviteBtnTxt: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  inviteGenBtn: { backgroundColor: '#1E1B4B', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  inviteGenTxt: { color: '#818CF8', fontSize: 13, fontWeight: '600' },
  findSearch:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121E', marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  searchIco:   { color: '#2E2E45', fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: '#F1F5F9', fontSize: 15 },
  empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIco:    { fontSize: 48, marginBottom: 12 },
  emptyTxt:    { color: '#4B5563', fontSize: 15, marginBottom: 6 },
  emptySub:    { color: '#374151', fontSize: 13, textAlign: 'center' },
})
