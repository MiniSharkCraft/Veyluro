import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, SafeAreaView, StatusBar,
} from 'react-native'
import { router } from 'expo-router'
import { useState } from 'react'

const MOCK_ROOMS = [
  { id: '1', name: 'ghost_user',  lastMsg: 'Oke tao check lại',     time: '21:43', unread: 2, online: true  },
  { id: '2', name: 'dev_team',    lastMsg: 'Deploy xong chưa m?',   time: '20:11', unread: 0, online: false },
  { id: '3', name: 'congmc',      lastMsg: 'Chạy ngon rồi nha 🔐',  time: 'T2',    unread: 1, online: true  },
]

// Màu avatar theo tên — deterministic
const AVATAR_COLORS = ['#1565C0', '#1B5E20', '#4A148C', '#B71C1C', '#E65100', '#006064']
const avatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]

export default function RoomListScreen() {
  const [search, setSearch] = useState('')
  const filtered = MOCK_ROOMS.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F17" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Tin nhắn</Text>
        <TouchableOpacity style={s.newBtn} activeOpacity={0.7}>
          <Text style={s.newBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm kiếm..."
          placeholderTextColor="#3D3D52"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push(`/(app)/room/${item.id}`)}
            activeOpacity={0.65}
          >
            {/* Avatar */}
            <View style={s.avatarWrap}>
              <View style={[s.avatar, { backgroundColor: avatarColor(item.name) }]}>
                <Text style={s.avatarText}>{item.name[0].toUpperCase()}</Text>
              </View>
              {item.online && <View style={s.onlineDot} />}
            </View>

            {/* Text */}
            <View style={s.rowContent}>
              <View style={s.rowTop}>
                <Text style={s.rowName}>{item.name}</Text>
                <Text style={[s.rowTime, item.unread > 0 && s.rowTimeUnread]}>
                  {item.time}
                </Text>
              </View>
              <View style={s.rowBottom}>
                <Text style={s.rowMsg} numberOfLines={1}>{item.lastMsg}</Text>
                {item.unread > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Text style={s.emptyIconText}>?</Text>
            </View>
            <Text style={s.emptyText}>Không tìm thấy cuộc trò chuyện nào</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#0F0F17',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  newBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1E3A5F',
    alignItems: 'center', justifyContent: 'center',
  },
  newBtnText: { color: '#2196F3', fontSize: 22, fontWeight: '300', lineHeight: 26 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111120',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchIcon: { color: '#3D3D52', fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15 },

  separator: { height: 1, backgroundColor: '#111120', marginLeft: 76 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2, borderColor: '#0A0A0F',
  },

  rowContent: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowName: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowTime: { color: '#4B5563', fontSize: 12 },
  rowTimeUnread: { color: '#2196F3' },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowMsg: { color: '#6B7280', fontSize: 14, flex: 1, marginRight: 8 },

  badge: {
    backgroundColor: '#2196F3',
    borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#111120',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconText: { color: '#3D3D52', fontSize: 26, fontWeight: '300' },
  emptyText: { color: '#4B5563', fontSize: 15 },
})
