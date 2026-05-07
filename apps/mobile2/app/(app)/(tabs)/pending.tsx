import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Alert, RefreshControl, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { useState, useEffect, useCallback } from 'react'
import { LockSimpleIcon, TrayIcon } from 'phosphor-react-native'
import { pendingApi, type PendingMessageType } from '../../../src/lib/api'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

export default function PendingScreen() {
  const [messages, setMessages] = useState<PendingMessageType[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await pendingApi.list()
      setMessages(data)
    } catch (e) {
      console.warn('[pending]', e)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAccept = async (msg: PendingMessageType) => {
    setActionId(msg.id)
    try {
      const res = await pendingApi.accept(msg.id)
      Alert.alert('Đã chấp nhận', `Bạn và ${msg.fromUsername} giờ là bạn bè!`, [
        { text: 'Chat ngay', onPress: () => router.push(`/(app)/room/`) },
        { text: 'OK' },
      ])
      await load()
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Thử lại sau')
    } finally { setActionId(null) }
  }

  const handleDismiss = async (id: string) => {
    Alert.alert('Bỏ qua?', 'Tin nhắn này sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Bỏ qua', style: 'destructive',
        onPress: async () => {
          setActionId(id)
          try { await pendingApi.dismiss(id); await load() }
          catch { /* ignore */ }
          finally { setActionId(null) }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <View>
          <Text style={s.brandTxt}>Hộp thư</Text>
          <Text style={s.title}>Tin nhắn chờ</Text>
        </View>
      </View>

      <Text style={s.desc}>
        Tin nhắn từ người chưa kết bạn. Chấp nhận để trò chuyện, bỏ qua để xóa.
      </Text>

      <FlatList
        data={messages}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#6366F1" />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <TrayIcon size={52} color="#374151" weight="duotone" />
              <Text style={s.emptyTitle}>Không có tin nhắn nào</Text>
              <Text style={s.emptyDesc}>Khi ai đó nhắn cho bạn mà chưa kết bạn, tin nhắn sẽ xuất hiện ở đây.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }: { item: PendingMessageType }) => (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={[s.avatar, { backgroundColor: avatarBg(item.fromUsername) }]}>
                <Text style={s.avatarTxt}>{item.fromUsername[0]?.toUpperCase()}</Text>
              </View>
              <View style={s.cardInfo}>
                <Text style={s.senderName}>{item.fromUsername}</Text>
                <Text style={s.time}>
                  {new Date(item.createdAt * 1000).toLocaleDateString('vi', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
            <View style={s.encNote}>
              <LockSimpleIcon size={15} color="#818CF8" weight="bold" />
              <Text style={s.encNoteTxt}>Tin nhắn được mã hóa E2EE — chỉ đọc được sau khi chấp nhận</Text>
            </View>
            <View style={s.btnRow}>
              <TouchableOpacity
                style={s.dismissBtn}
                onPress={() => handleDismiss(item.id)}
                disabled={actionId === item.id}
              >
                <Text style={s.dismissTxt}>Bỏ qua</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.acceptBtn}
                onPress={() => handleAccept(item)}
                disabled={actionId === item.id}
              >
                {actionId === item.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.acceptTxt}>Chấp nhận + Kết bạn</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#08080F' },
  header:     { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  brandTxt:   { color: '#6366F1', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  title:      { color: '#F1F5F9', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  desc:       { color: '#4B5563', fontSize: 13, lineHeight: 18, paddingHorizontal: 20, paddingBottom: 16 },
  card:       { backgroundColor: '#0E0E1C', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1A1A2E' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  cardInfo:   { flex: 1 },
  senderName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  time:       { color: '#4B5563', fontSize: 12, marginTop: 2 },
  encNote:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1626', borderRadius: 10, padding: 10, marginBottom: 14, gap: 8 },
  encNoteTxt: { color: '#6366F1', fontSize: 12, flex: 1, lineHeight: 16 },
  btnRow:     { flexDirection: 'row', gap: 8 },
  dismissBtn: { flex: 1, backgroundColor: '#12121E', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  dismissTxt: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  acceptBtn:  { flex: 2, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  acceptTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc:  { color: '#4B5563', fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
