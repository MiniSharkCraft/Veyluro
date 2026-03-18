import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { friendsApi, type FriendType } from '../../src/lib/api'
import { useRooms } from '../../src/hooks/useRooms'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

export default function GroupCreateScreen() {
  const [groupName, setGroupName] = useState('')
  const [friends, setFriends] = useState<FriendType[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const { createGroup } = useRooms()

  useEffect(() => {
    friendsApi.list().then(setFriends).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggle = (username: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(username)) {
        next.delete(username)
      } else {
        if (next.size >= 3) {
          Alert.alert('Tối đa 4 người', 'Nhóm chat tối đa 4 người (bạn + 3 người khác)')
          return prev
        }
        next.add(username)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!groupName.trim()) { Alert.alert('Thiếu tên', 'Nhập tên nhóm để tiếp tục'); return }
    if (selected.size === 0) { Alert.alert('Chọn thành viên', 'Chọn ít nhất 1 người bạn'); return }
    setCreating(true)
    try {
      const roomId = await createGroup(groupName.trim(), Array.from(selected))
      router.replace(`/(app)/room/${roomId}` as any)
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message ?? 'Không tạo được nhóm')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Tạo nhóm mới</Text>
        <TouchableOpacity
          style={[s.createBtn, (!groupName.trim() || selected.size === 0 || creating) && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!groupName.trim() || selected.size === 0 || creating}
        >
          {creating ? <ActivityIndicator color="#818CF8" size="small" /> : <Text style={s.createBtnTxt}>Tạo</Text>}
        </TouchableOpacity>
      </View>

      {/* Group name input */}
      <View style={s.nameBox}>
        <View style={s.groupIcon}>
          <Text style={{ fontSize: 22 }}>👥</Text>
        </View>
        <TextInput
          style={s.nameInput}
          placeholder="Tên nhóm..."
          placeholderTextColor="#2E2E45"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
          autoFocus
        />
      </View>

      {/* Selected chips */}
      {selected.size > 0 && (
        <View style={s.chipsRow}>
          {Array.from(selected).map(u => (
            <TouchableOpacity key={u} style={s.chip} onPress={() => toggle(u)}>
              <Text style={s.chipTxt}>@{u} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={s.sectionLabel}>Chọn bạn bè ({selected.size}/3)</Text>

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTxt}>Chưa có bạn bè nào</Text>
              <Text style={s.emptySub}>Kết bạn trước để tạo nhóm</Text>
            </View>
          }
          renderItem={({ item }) => {
            const on = selected.has(item.username)
            return (
              <TouchableOpacity style={[s.row, on && s.rowOn]} onPress={() => toggle(item.username)}>
                <View style={[s.avatar, { backgroundColor: avatarBg(item.username) }]}>
                  <Text style={s.avatarTxt}>{item.username[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>@{item.username}</Text>
                  {item.displayName && <Text style={s.rowSub}>{item.displayName}</Text>}
                </View>
                <View style={[s.check, on && s.checkOn]}>
                  {on && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#08080F' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#12121E' },
  backBtn:     { padding: 4, marginRight: 8 },
  backArrow:   { color: '#818CF8', fontSize: 30, fontWeight: '200' },
  title:       { flex: 1, color: '#F1F5F9', fontSize: 18, fontWeight: '700' },
  createBtn:   { backgroundColor: '#1E1B4B', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  createBtnTxt:{ color: '#818CF8', fontSize: 14, fontWeight: '700' },
  nameBox:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16, marginBottom: 8, backgroundColor: '#12121E', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  groupIcon:   { marginRight: 12 },
  nameInput:   { flex: 1, color: '#F1F5F9', fontSize: 16, fontWeight: '600' },
  chipsRow:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip:        { backgroundColor: '#1E1B4B', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt:     { color: '#818CF8', fontSize: 13, fontWeight: '600' },
  sectionLabel:{ color: '#4B5563', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0D0D1A' },
  rowOn:       { backgroundColor: '#0E0E1C' },
  avatar:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowName:     { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
  rowSub:      { color: '#64748B', fontSize: 13, marginTop: 2 },
  check:       { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#2E2E45', alignItems: 'center', justifyContent: 'center' },
  checkOn:     { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyTxt:    { color: '#4B5563', fontSize: 15, marginBottom: 6 },
  emptySub:    { color: '#374151', fontSize: 13 },
})
