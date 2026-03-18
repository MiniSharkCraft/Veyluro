import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useRooms } from '../../../src/hooks/useRooms'
import { storage } from '../../../src/lib/storage'
import type { RoomType } from '../../../src/lib/api'

function formatLastTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) {
    return d.toLocaleDateString('vi-VN', { weekday: 'short' })
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

function RoomAvatar({ name, type }: { name: string; type: string }) {
  if (type === 'group') {
    return (
      <View style={[s.avatar, { backgroundColor: '#1E1B4B' }]}>
        <Text style={{ fontSize: 20 }}>👥</Text>
      </View>
    )
  }
  return (
    <View style={[s.avatar, { backgroundColor: avatarBg(name) }]}>
      <Text style={s.avatarTxt}>{name[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  )
}

function getRoomDisplayName(room: RoomType, myUsername: string) {
  if (room.type === 'group') return room.name
  const parts = room.name.split(',')
  const other = parts.find(p => p.trim() !== myUsername)
  return other ? `@${other.trim()}` : room.name
}

export default function ChatsScreen() {
  const { rooms, loading, refetch } = useRooms()
  const [myUsername, setMyUsername] = useState('')

  useEffect(() => {
    storage.getUsername().then(u => { if (u) setMyUsername(u) })
  }, [])

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>AMoon Eclipse</Text>
          <Text style={s.headerTitle}>Tin nhắn</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => router.push('/(app)/group-create' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.iconBtnTxt}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => router.push('/(app)/settings' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.iconBtnTxt}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#6366F1" />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyIco}>💬</Text>
              <Text style={s.emptyTxt}>Chưa có cuộc trò chuyện nào</Text>
              <Text style={s.emptySub}>Kết bạn rồi nhắn tin để bắt đầu</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <ActivityIndicator color="#6366F1" />
            </View>
          )
        }
        renderItem={({ item }: { item: RoomType }) => {
          const displayName = myUsername ? getRoomDisplayName(item, myUsername) : item.name
          return (
            <TouchableOpacity
              style={s.row}
              onPress={() => router.push(`/(app)/room/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <RoomAvatar name={displayName} type={item.type} />
              <View style={s.rowInfo}>
                <View style={s.rowTop}>
                  <Text style={s.rowName} numberOfLines={1}>{displayName}</Text>
                  {item.lastMessageAt
                    ? <Text style={s.rowTime}>{formatLastTime(item.lastMessageAt)}</Text>
                    : item.type === 'group' && item.memberCount
                      ? <View style={s.groupBadge}><Text style={s.groupBadgeTxt}>{item.memberCount} người</Text></View>
                      : null
                  }
                </View>
                <Text style={s.rowSub} numberOfLines={1}>
                  {item.type === 'group' ? '👥 Nhóm · E2EE' : '🔒 E2EE · Bảo mật đầu cuối'}
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#08080F' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#0D0D1A' },
  headerSub:    { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle:  { color: '#F1F5F9', fontSize: 26, fontWeight: '800', marginTop: 2 },
  headerActions:{ flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn:      { backgroundColor: '#12121E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  iconBtnTxt:   { fontSize: 16 },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0A0A12' },
  avatar:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarTxt:    { color: '#fff', fontSize: 20, fontWeight: '700' },
  rowInfo:      { flex: 1 },
  rowTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rowName:      { color: '#F1F5F9', fontSize: 16, fontWeight: '700', flex: 1 },
  groupBadge:   { backgroundColor: '#1E1B4B', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  groupBadgeTxt:{ color: '#818CF8', fontSize: 11, fontWeight: '700' },
  rowTime:      { color: '#374151', fontSize: 12 },
  rowSub:       { color: '#374151', fontSize: 13 },
  chevron:      { color: '#2E2E45', fontSize: 24, paddingLeft: 8 },
  empty:        { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIco:     { fontSize: 52, marginBottom: 16 },
  emptyTxt:     { color: '#4B5563', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySub:     { color: '#374151', fontSize: 14, textAlign: 'center' },
})
