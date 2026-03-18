import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Alert, Modal, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useState, useEffect, useCallback } from 'react'
import { moderationApi, type ReportType } from '../../src/lib/api'

export default function AdminScreen() {
  const [reports,   setReports]   = useState<ReportType[]>([])
  const [loading,   setLoading]   = useState(true)
  const [actionId,  setActionId]  = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{ id: string; action: string } | null>(null)
  const [adminNote, setAdminNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await moderationApi.adminReports()
      setReports(data)
    } catch (e: unknown) {
      Alert.alert('Lỗi', 'Không tải được danh sách báo cáo')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAction = async (id: string, action: string, note?: string) => {
    setActionId(id)
    try {
      await moderationApi.adminAction(id, action, note)
      await load()
      setNoteModal(null)
      setAdminNote('')
      Alert.alert('Xong', action === 'ban' ? 'Đã ban chat người dùng' : action === 'dismiss' ? 'Đã bỏ qua báo cáo' : 'Đã xử lý')
    } catch { Alert.alert('Lỗi', 'Thử lại sau') }
    finally { setActionId(null) }
  }

  const reasonLabel: Record<string, string> = {
    spam: 'Spam',
    harassment: 'Quấy rối',
    inappropriate: 'Nội dung không phù hợp',
    other: 'Khác',
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Báo cáo vi phạm</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={s.subtitle}>
        {reports.length} báo cáo đang chờ xử lý
      </Text>

      <FlatList
        data={reports}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#EF4444" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={s.emptyTxt}>Không có báo cáo nào đang chờ</Text>
            </View>
          ) : null
        }
        renderItem={({ item }: { item: ReportType }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <View style={[s.reasonBadge, { backgroundColor: item.reason === 'harassment' ? '#1C0A0A' : '#0A1C0A' }]}>
                <Text style={[s.reasonTxt, { color: item.reason === 'harassment' ? '#EF4444' : '#22C55E' }]}>
                  {reasonLabel[item.reason] ?? item.reason}
                </Text>
              </View>
              <Text style={s.dateStr}>
                {new Date(item.createdAt * 1000).toLocaleDateString('vi', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </Text>
            </View>

            <View style={s.rowInfo}>
              <View style={s.userRow}>
                <Text style={s.roleLabel}>Người báo cáo</Text>
                <Text style={s.username}>@{item.reporterUsername}</Text>
              </View>
              <Text style={s.arrow}>→</Text>
              <View style={s.userRow}>
                <Text style={s.roleLabel}>Bị báo cáo</Text>
                <Text style={[s.username, { color: '#EF4444' }]}>@{item.reportedUsername}</Text>
              </View>
            </View>

            {item.detail ? (
              <View style={s.detailBox}>
                <Text style={s.detailTxt}>"{item.detail}"</Text>
              </View>
            ) : null}

            <View style={s.actions}>
              <TouchableOpacity
                style={s.dismissBtn}
                onPress={() => handleAction(item.id, 'dismiss')}
                disabled={actionId === item.id}
              >
                <Text style={s.dismissTxt}>Bỏ qua</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.warnBtn}
                onPress={() => { setNoteModal({ id: item.id, action: 'warn' }); setAdminNote('') }}
                disabled={actionId === item.id}
              >
                <Text style={s.warnTxt}>Cảnh cáo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.banBtn}
                onPress={() => { setNoteModal({ id: item.id, action: 'ban' }); setAdminNote('') }}
                disabled={actionId === item.id}
              >
                {actionId === item.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.banTxt}>Ban chat</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Admin note modal */}
      <Modal visible={!!noteModal} transparent animationType="slide" onRequestClose={() => setNoteModal(null)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>
              {noteModal?.action === 'ban' ? 'Ban chat người dùng' : 'Gửi cảnh cáo'}
            </Text>
            <Text style={m.desc}>Ghi chú nội bộ (không hiển thị cho người dùng):</Text>
            <TextInput
              style={m.input}
              value={adminNote}
              onChangeText={setAdminNote}
              placeholder="Lý do xử lý..."
              placeholderTextColor="#2E2E45"
              multiline
            />
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancel} onPress={() => setNoteModal(null)}>
                <Text style={m.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.confirm, noteModal?.action === 'ban' && { backgroundColor: '#EF4444' }]}
                onPress={() => noteModal && handleAction(noteModal.id, noteModal.action, adminNote)}
                disabled={!!actionId}
              >
                {actionId
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={m.confirmTxt}>{noteModal?.action === 'ban' ? 'Ban chat' : 'Cảnh cáo'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#08080F' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backTxt:    { color: '#818CF8', fontSize: 28, fontWeight: '300' },
  headerTitle:{ flex: 1, color: '#F1F5F9', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle:   { color: '#64748B', fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 },
  card:       { backgroundColor: '#0E0E1C', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1A1A2E' },
  cardTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  reasonBadge:{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  reasonTxt:  { fontSize: 12, fontWeight: '700' },
  dateStr:    { color: '#374151', fontSize: 12 },
  rowInfo:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  userRow:    { flex: 1 },
  roleLabel:  { color: '#374151', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  username:   { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
  arrow:      { color: '#374151', fontSize: 18, marginHorizontal: 8 },
  detailBox:  { backgroundColor: '#0D0D1A', borderRadius: 10, padding: 12, marginBottom: 14 },
  detailTxt:  { color: '#94A3B8', fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  actions:    { flexDirection: 'row', gap: 8 },
  dismissBtn: { flex: 1, backgroundColor: '#12121E', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  dismissTxt: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  warnBtn:    { flex: 1, backgroundColor: '#1C1408', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  warnTxt:    { color: '#F59E0B', fontSize: 13, fontWeight: '600' },
  banBtn:     { flex: 1, backgroundColor: '#1C0A0A', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  banTxt:     { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyTxt:   { color: '#4B5563', fontSize: 15 },
})

const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#0E0E1C', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  handle:     { width: 40, height: 4, backgroundColor: '#2E2E45', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:      { color: '#F1F5F9', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  desc:       { color: '#64748B', fontSize: 13, marginBottom: 14 },
  input:      { backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  btnRow:     { flexDirection: 'row', gap: 10 },
  cancel:     { flex: 1, backgroundColor: '#12121E', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  cancelTxt:  { color: '#64748B', fontSize: 15, fontWeight: '600' },
  confirm:    { flex: 2, backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
