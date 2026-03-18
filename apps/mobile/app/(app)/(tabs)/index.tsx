import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ScrollView,
  Alert, Modal, ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useState, useCallback } from 'react'
import { useRooms } from '../../../src/hooks/useRooms'
import { useNotes } from '../../../src/hooks/useNotes'
import { storage } from '../../../src/lib/storage'
import type { RoomType, NoteType } from '../../../src/lib/api'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length]

// ─── Stories strip (placeholder — ảnh/video làm sau) ─────────────────────────
function StoriesRow() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
      <TouchableOpacity style={st.item} activeOpacity={0.75}>
        <View style={[st.ring, st.ringAdd]}>
          <View style={[st.avatar, { backgroundColor: '#1E1B4B' }]}>
            <Text style={st.addIcon}>+</Text>
          </View>
        </View>
        <Text style={st.name}>Story</Text>
        <Text style={st.comingSoon}>Sắp có</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─── Notes strip ─────────────────────────────────────────────────────────────
function NotesRow({ notes, loading, timeLeft, onAdd }: {
  notes: NoteType[]
  loading: boolean
  timeLeft: (e: number) => string
  onAdd: () => void
}) {
  if (loading) return <View style={{ height: 130 }}><ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} /></View>

  return (
    <View style={nt.wrap}>
      <View style={nt.header}>
        <Text style={nt.title}>Ghi chú</Text>
        <TouchableOpacity onPress={onAdd} activeOpacity={0.7}>
          <Text style={nt.addBtn}>+ Thêm</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nt.strip}>
        {notes.map(n => (
          <TouchableOpacity key={n.id} style={[nt.card, { backgroundColor: avatarBg(n.username) }]} activeOpacity={0.8}>
            <Text style={nt.noteText} numberOfLines={3}>{n.content}</Text>
            <View style={nt.footer}>
              <Text style={nt.noteAuthor}>@{n.username}</Text>
              <Text style={nt.noteTime}>{timeLeft(n.expires_at)}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={nt.cardAdd} onPress={onAdd} activeOpacity={0.8}>
          <Text style={nt.cardAddIcon}>✏</Text>
          <Text style={nt.cardAddTxt}>Thêm ghi chú</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ChatsScreen() {
  const [search, setSearch] = useState('')
  const [newDmModal, setNewDmModal] = useState(false)
  const [newNoteModal, setNewNoteModal] = useState(false)
  const [dmTarget, setDmTarget] = useState('')
  const [noteText, setNoteText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const { rooms, loading: roomsLoading, refetch, startDm } = useRooms()
  const { notes, loading: notesLoading, addNote, timeLeft } = useNotes()

  const filtered = rooms.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  const handleStartDm = async () => {
    if (!dmTarget.trim()) return
    setActionLoading(true)
    try {
      const room = await startDm(dmTarget.trim())
      setNewDmModal(false)
      setDmTarget('')
      if (room) router.push(`/(app)/room/${room.id}`)
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không tìm thấy user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setActionLoading(true)
    try {
      await addNote(noteText.trim())
      setNewNoteModal(false)
      setNoteText('')
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không thêm được ghi chú')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLogout = async () => {
    await storage.clear()
    router.replace('/(auth)/login')
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>AMoon Eclipse</Text>
          <Text style={s.headerTitle}>Tin nhắn</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setNewDmModal(true)} activeOpacity={0.7}>
            <Text style={s.iconBtnTxt}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#1A0A0A' }]} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={[s.iconBtnTxt, { color: '#EF4444' }]}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIco}>⌕</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm kiếm..."
          placeholderTextColor="#2E2E45"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={roomsLoading} onRefresh={refetch} tintColor="#6366F1" />}
        ListHeaderComponent={
          <>
            <StoriesRow />
            <NotesRow notes={notes} loading={notesLoading} timeLeft={timeLeft} onAdd={() => setNewNoteModal(true)} />
            <Text style={s.sectionLabel}>Tất cả tin nhắn</Text>
          </>
        }
        ItemSeparatorComponent={() => <View style={s.sep} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          !roomsLoading ? (
            <View style={s.empty}>
              <Text style={s.emptyIco}>💬</Text>
              <Text style={s.emptyTxt}>Chưa có tin nhắn nào</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setNewDmModal(true)} activeOpacity={0.8}>
                <Text style={s.emptyBtnTxt}>Bắt đầu nhắn tin</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }: { item: RoomType }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push(`/(app)/room/${item.id}`)}
            activeOpacity={0.65}
          >
            <View style={s.avatarWrap}>
              <View style={[s.avatar, { backgroundColor: avatarBg(item.name) }]}>
                <Text style={s.avatarTxt}>{item.name[0].toUpperCase()}</Text>
              </View>
            </View>
            <View style={s.rowInfo}>
              <View style={s.rowTop}>
                <Text style={s.rowName}>{item.name}</Text>
                <Text style={s.rowTime}>
                  {new Date(item.created_at * 1000).toLocaleDateString('vi', { day: '2-digit', month: '2-digit' })}
                </Text>
              </View>
              <Text style={s.rowLast} numberOfLines={1}>
                {item.type === 'dm' ? 'Tin nhắn riêng tư 🔐' : 'Nhóm · E2EE'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Modal: Nhắn tin mới */}
      <Modal visible={newDmModal} transparent animationType="slide" onRequestClose={() => setNewDmModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <Text style={m.title}>Nhắn tin mới</Text>
            <TextInput
              style={m.input}
              placeholder="Nhập username..."
              placeholderTextColor="#2E2E45"
              value={dmTarget}
              onChangeText={setDmTarget}
              autoCapitalize="none"
              autoFocus
            />
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancel} onPress={() => setNewDmModal(false)} activeOpacity={0.7}>
                <Text style={m.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={m.confirm} onPress={handleStartDm} disabled={actionLoading} activeOpacity={0.85}>
                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={m.confirmTxt}>Tìm →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Thêm ghi chú */}
      <Modal visible={newNoteModal} transparent animationType="slide" onRequestClose={() => setNewNoteModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <Text style={m.title}>Thêm ghi chú</Text>
            <Text style={m.subtitle}>Tự xóa sau 24 giờ · Tối đa 200 ký tự</Text>
            <TextInput
              style={[m.input, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Ghi chú của bạn..."
              placeholderTextColor="#2E2E45"
              value={noteText}
              onChangeText={t => setNoteText(t.slice(0, 200))}
              multiline
              autoFocus
            />
            <Text style={m.charCount}>{noteText.length}/200</Text>
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancel} onPress={() => setNewNoteModal(false)} activeOpacity={0.7}>
                <Text style={m.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={m.confirm} onPress={handleAddNote} disabled={actionLoading} activeOpacity={0.85}>
                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={m.confirmTxt}>Đăng →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerSub: { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1E1B4B', alignItems: 'center', justifyContent: 'center' },
  iconBtnTxt: { color: '#818CF8', fontSize: 18 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121E',
    marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4,
  },
  searchIco: { color: '#2E2E45', fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: '#F1F5F9', fontSize: 15 },
  sectionLabel: { color: '#374151', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, paddingVertical: 10 },
  sep: { height: 1, backgroundColor: '#12121E', marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 20, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowName: { color: '#F1F5F9', fontSize: 16, fontWeight: '600' },
  rowTime: { color: '#374151', fontSize: 12 },
  rowLast: { color: '#64748B', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIco: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#4B5563', fontSize: 15, marginBottom: 20 },
  emptyBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
})

const st = StyleSheet.create({
  strip: { paddingHorizontal: 16, paddingVertical: 14, gap: 16 },
  item: { alignItems: 'center', width: 62 },
  ring: { width: 60, height: 60, borderRadius: 30, padding: 2.5, marginBottom: 4, borderWidth: 2 },
  ringAdd: { borderColor: '#1E1B4B', borderStyle: 'dashed' },
  avatar: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center', margin: 1 },
  addIcon: { color: '#818CF8', fontSize: 24, fontWeight: '300' },
  name: { color: '#64748B', fontSize: 11, textAlign: 'center' },
  comingSoon: { color: '#374151', fontSize: 9, textAlign: 'center' },
})

const nt = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  addBtn: { color: '#6366F1', fontSize: 13, fontWeight: '600' },
  strip: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  card: { width: 140, borderRadius: 16, padding: 14, justifyContent: 'space-between', minHeight: 110 },
  noteText: { color: '#E2E8F0', fontSize: 13, lineHeight: 18, fontWeight: '500', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  noteAuthor: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  noteTime: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
  cardAdd: { width: 100, borderRadius: 16, borderWidth: 1.5, borderColor: '#1E1E30', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 110 },
  cardAddIcon: { color: '#374151', fontSize: 20, marginBottom: 6 },
  cardAddTxt: { color: '#374151', fontSize: 12, textAlign: 'center' },
})

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#12121E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  title: { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#64748B', fontSize: 13, marginBottom: 16 },
  input: {
    backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#F1F5F9', fontSize: 16, marginBottom: 8,
  },
  charCount: { color: '#374151', fontSize: 11, textAlign: 'right', marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, backgroundColor: '#1E1E30', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  confirm: { flex: 1, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
