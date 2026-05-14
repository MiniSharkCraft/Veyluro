import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ScrollView,
  Alert, Modal, ActivityIndicator, RefreshControl,
} from 'react-native'
import { BookOpenIcon, PlusIcon } from 'phosphor-react-native'
import { storiesApi, type StoryType } from '../../../src/lib/api'
import { storage } from '../../../src/lib/storage'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (s: string) => COLORS[s.charCodeAt(0) % COLORS.length]

function timeLeft(expiresAt: number): string {
  const secs = expiresAt - Math.floor(Date.now() / 1000)
  if (secs <= 0) return 'Đã hết hạn'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}g ${m}p còn lại` : `${m}p còn lại`
}

export default function StoriesScreen() {
  const [stories,   setStories]   = useState<StoryType[]>([])
  const [loading,   setLoading]   = useState(true)
  const [myUserId,  setMyUserId]  = useState<string | null>(null)
  const [newModal,  setNewModal]  = useState(false)
  const [newText,   setNewText]   = useState('')
  const [posting,   setPosting]   = useState(false)
  const [active,    setActive]    = useState<StoryType | null>(null)

  useEffect(() => { storage.getUserId().then(setMyUserId) }, [])

  const fetchStories = useCallback(async () => {
    setLoading(true)
    try { setStories(await storiesApi.list()) }
    catch (e) { console.warn('[Stories]', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStories() }, [fetchStories])

  const postStory = async () => {
    if (!newText.trim()) return
    setPosting(true)
    try {
      await storiesApi.create(newText.trim())
      setNewModal(false)
      setNewText('')
      await fetchStories()
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Đăng story thất bại')
    } finally { setPosting(false) }
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>AMoon Eclipse</Text>
          <Text style={s.headerTitle}>Stories</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setNewModal(true)} activeOpacity={0.7}>
          <PlusIcon size={14} color="#818CF8" weight="bold" />
          <Text style={s.addBtnTxt}>Story</Text>
        </TouchableOpacity>
      </View>

      {/* Story viewer */}
      {active && (
        <TouchableOpacity style={s.viewer} onPress={() => setActive(null)} activeOpacity={1}>
          <View style={s.viewerCard}>
            <View style={s.viewerTop}>
              <View style={[s.avatar, { backgroundColor: avatarBg(active.userId) }]}>
                <Text style={s.avatarTxt}>{active.userId[0]?.toUpperCase()}</Text>
              </View>
              <View>
                <Text style={s.viewerAuthor}>{active.userId.slice(0, 8)}...</Text>
                <Text style={s.viewerTime}>{timeLeft(active.expiresAt)}</Text>
              </View>
              {active.userId === myUserId && <View style={s.meBadge}><Text style={s.meBadgeTxt}>Của tôi</Text></View>}
            </View>
            <Text style={s.viewerContent}>{active.content}</Text>
            <Text style={s.viewerDismiss}>Nhấn để đóng</Text>
          </View>
        </TouchableOpacity>
      )}

      <FlatList
        data={stories}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStories} tintColor="#6366F1" />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <BookOpenIcon size={48} color="#374151" weight="duotone" />
              <Text style={s.emptyTxt}>Chưa có story nào</Text>
              <TouchableOpacity style={s.emptyCreateBtn} onPress={() => setNewModal(true)} activeOpacity={0.8}>
                <Text style={s.emptyCreateBtnTxt}>Tạo story đầu tiên</Text>
              </TouchableOpacity>
            </View>
          ) : <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
        }
        renderItem={({ item }: { item: StoryType }) => (
          <TouchableOpacity style={[s.row, active?.id === item.id && s.rowActive]} onPress={() => setActive(item)} activeOpacity={0.7}>
            <View style={s.ringWrap}>
              <View style={[s.ring, item.userId === myUserId && s.ringMine]}>
                <View style={[s.avatar, { backgroundColor: avatarBg(item.userId) }]}>
                  <Text style={s.avatarTxt}>{item.userId[0]?.toUpperCase()}</Text>
                </View>
              </View>
            </View>
            <View style={s.rowInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.rowName}>{item.userId.slice(0, 8)}...</Text>
                {item.userId === myUserId && <View style={s.meBadge}><Text style={s.meBadgeTxt}>Tôi</Text></View>}
              </View>
              <Text style={s.rowPreview} numberOfLines={1}>{item.content}</Text>
              <Text style={s.rowTime}>{timeLeft(item.expiresAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Create story modal */}
      <Modal visible={newModal} transparent animationType="slide" onRequestClose={() => setNewModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <Text style={m.title}>Story mới</Text>
            <Text style={m.subtitle}>Tự xóa sau 24 giờ · Tối đa 500 ký tự</Text>
            <TextInput
              style={[m.input, { height: 120, textAlignVertical: 'top' }]}
              placeholder="Chia sẻ điều gì đó..."
              placeholderTextColor="#2E2E45"
              value={newText}
              onChangeText={t => setNewText(t.slice(0, 500))}
              multiline
              autoFocus
            />
            <Text style={m.charCount}>{newText.length}/500</Text>
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancel} onPress={() => setNewModal(false)} activeOpacity={0.7}>
                <Text style={m.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={m.confirm} onPress={postStory} disabled={posting || !newText.trim()} activeOpacity={0.85}>
                {posting ? <ActivityIndicator color="#fff" /> : <Text style={m.confirmTxt}>Đăng →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#08080F' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerSub:       { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle:     { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },
  addBtn:          { backgroundColor: '#1E1B4B', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtnTxt:       { color: '#818CF8', fontSize: 13, fontWeight: '700' },
  viewer:          { marginHorizontal: 16, marginBottom: 12 },
  viewerCard:      { backgroundColor: '#12121E', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E1B4B' },
  viewerTop:       { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  viewerAuthor:    { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  viewerTime:      { color: '#64748B', fontSize: 12, marginTop: 2 },
  viewerContent:   { color: '#E2E8F0', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  viewerDismiss:   { color: '#374151', fontSize: 11, textAlign: 'center' },
  meBadge:         { backgroundColor: '#1E1B4B', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' },
  meBadgeTxt:      { color: '#818CF8', fontSize: 11, fontWeight: '700' },
  row:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rowActive:       { backgroundColor: '#12121E' },
  ringWrap:        { marginRight: 12 },
  ring:            { borderRadius: 30, padding: 2.5, borderWidth: 2, borderColor: '#1E1E30' },
  ringMine:        { borderColor: '#6366F1' },
  avatar:          { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:       { color: '#fff', fontSize: 18, fontWeight: '700' },
  rowInfo:         { flex: 1 },
  rowName:         { color: '#F1F5F9', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  rowPreview:      { color: '#64748B', fontSize: 13, marginBottom: 2 },
  rowTime:         { color: '#374151', fontSize: 11 },
  empty:           { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTxt:        { color: '#4B5563', fontSize: 15, marginBottom: 20 },
  emptyCreateBtn:  { backgroundColor: '#1E1B4B', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyCreateBtnTxt:{ color: '#818CF8', fontSize: 14, fontWeight: '700' },
})

const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#12121E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  title:      { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle:   { color: '#64748B', fontSize: 13, marginBottom: 16 },
  input:      { backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#F1F5F9', fontSize: 15, marginBottom: 6 },
  charCount:  { color: '#374151', fontSize: 11, textAlign: 'right', marginBottom: 16 },
  btnRow:     { flexDirection: 'row', gap: 10 },
  cancel:     { flex: 1, backgroundColor: '#1E1E30', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelTxt:  { color: '#64748B', fontSize: 15, fontWeight: '600' },
  confirm:    { flex: 1, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
