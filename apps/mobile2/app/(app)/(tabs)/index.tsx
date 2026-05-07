import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native'
import { router } from 'expo-router'
import {
  ChatsCircleIcon,
  GearSixIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  UsersThreeIcon,
} from 'phosphor-react-native'
import { useRooms } from '../../../src/hooks/useRooms'
import { storage } from '../../../src/lib/storage'
import { storiesApi, type RoomType, type StoryType } from '../../../src/lib/api'
import { getTheme, type AppTheme } from '../../../src/lib/theme'

function formatLastTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) return d.toLocaleDateString('vi-VN', { weekday: 'short' })
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

const avatarColors = ['#0A84FF', '#00A884', '#FF7A1A', '#E9437A', '#7C3AED', '#0891B2']
const avatarBg = (name: string) => avatarColors[(name?.charCodeAt(0) ?? 0) % avatarColors.length]

function getRoomDisplayName(room: RoomType, myUsername: string) {
  if (room.type === 'group') return room.name
  const parts = room.name.split(',')
  const other = parts.find(p => p.trim() !== myUsername)
  return other ? `@${other.trim()}` : room.name
}

function RoomAvatar({
  name,
  type,
  theme,
  size = 56,
}: {
  name: string
  type: RoomType['type']
  theme: AppTheme
  size?: number
}) {
  const bg = type === 'group' ? theme.accent : avatarBg(name)
  const fg = '#FFFFFF'

  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      {type === 'group' ? (
        <UsersThreeIcon size={size * 0.44} color={fg} weight="fill" />
      ) : (
        <Text style={[s.avatarTxt, { fontSize: size * 0.38 }]}>{name[0]?.toUpperCase() ?? '?'}</Text>
      )}
    </View>
  )
}

function NotesRail({
  notes,
  theme,
}: {
  notes: StoryType[]
  theme: AppTheme
}) {
  const visibleNotes = notes.slice(0, 12)
  if (visibleNotes.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.notesRail}
    >
      {visibleNotes.map(note => {
        const owner = note.displayName || note.username || 'AMoon'
        return (
          <TouchableOpacity
            key={note.id}
            activeOpacity={0.75}
            style={s.noteItem}
          >
            <View style={s.noteCard}>
              <RoomAvatar name={owner} type="dm" theme={theme} size={62} />
              <View style={[s.noteBubble, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                <Text style={[s.noteBubbleText, { color: theme.text }]} numberOfLines={2}>
                  {note.content}
                </Text>
              </View>
              <View style={[s.onlineDot, { backgroundColor: theme.green, borderColor: theme.bg }]} />
            </View>
            <Text style={[s.noteName, { color: theme.text }]} numberOfLines={1}>
              {owner.replace(/^@/, '')}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

export default function ChatsScreen() {
  const scheme = useColorScheme()
  const theme = getTheme(scheme)
  const { rooms, loading, refetch } = useRooms()
  const [myUsername, setMyUsername] = useState('')
  const [notes, setNotes] = useState<StoryType[]>([])
  const [search, setSearch] = useState('')
  const styles = useMemo(() => createStyles(theme), [theme])
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter(room => {
      const display = myUsername ? getRoomDisplayName(room, myUsername) : room.name
      return display.toLowerCase().includes(q) || room.name.toLowerCase().includes(q)
    })
  }, [rooms, search, myUsername])

  const fetchNotes = async () => {
    try {
      setNotes(await storiesApi.list())
    } catch (e) {
      console.warn('[notes]', e)
    }
  }

  useEffect(() => {
    storage.getUsername().then(u => {
      if (u) setMyUsername(u)
    })
    fetchNotes()
  }, [])

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={scheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.bg}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>AMoon</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(app)/group-create' as any)}
            activeOpacity={0.75}
          >
            <UsersThreeIcon size={22} color={theme.text} weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(app)/settings' as any)}
            activeOpacity={0.75}
          >
            <GearSixIcon size={22} color={theme.text} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchPill}>
        <MagnifyingGlassIcon size={25} color={theme.faint} weight="bold" />
        <TextInput
          style={styles.searchText}
          value={search}
          onChangeText={setSearch}
          placeholder="Hỏi AMoon AI hoặc tìm kiếm"
          placeholderTextColor={theme.muted}
          returnKeyType="search"
        />
      </View>

      <NotesRail notes={notes} theme={theme} />

      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleWrap}>
          <ChatsCircleIcon size={20} color={theme.accent} weight="fill" />
          <Text style={styles.sectionTitle}>Tin nhắn</Text>
        </View>
        <TouchableOpacity activeOpacity={0.75} style={styles.composeBtn}>
          <NotePencilIcon size={19} color={theme.accent} weight="bold" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={i => i.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              refetch()
              fetchNotes()
            }}
            tintColor={theme.accent}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <ChatsCircleIcon size={54} color={theme.faint} weight="duotone" />
              <Text style={styles.emptyTxt}>
                {search.trim() ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện nào'}
              </Text>
              <Text style={styles.emptySub}>
                {search.trim() ? 'Thử tên hoặc username khác' : 'Kết bạn rồi nhắn tin để bắt đầu'}
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )
        }
        renderItem={({ item }: { item: RoomType }) => {
          const displayName = myUsername ? getRoomDisplayName(item, myUsername) : item.name
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(app)/room/${item.id}` as any)}
              activeOpacity={0.72}
            >
              <RoomAvatar name={displayName} type={item.type} theme={theme} />
              <View style={styles.rowInfo}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {item.lastMessageAt ? (
                    <Text style={styles.rowTime}>{formatLastTime(item.lastMessageAt)}</Text>
                  ) : item.type === 'group' && item.memberCount ? (
                    <View style={styles.groupBadge}>
                      <Text style={styles.groupBadgeTxt}>{item.memberCount} người</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.rowSubWrap}>
                  {item.type === 'group' ? (
                    <UsersThreeIcon size={14} color={theme.faint} weight="bold" />
                  ) : (
                    <LockSimpleIcon size={14} color={theme.faint} weight="bold" />
                  )}
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.type === 'group' ? 'Nhóm · E2EE' : 'E2EE · Bảo mật đầu cuối'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#FFFFFF', fontWeight: '800' },
  notesRail: { gap: 14, paddingHorizontal: 18, paddingBottom: 14, paddingTop: 2 },
  noteItem: { alignItems: 'center', width: 78 },
  noteCard: {
    width: 78,
    height: 91,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  noteBubble: {
    position: 'absolute',
    top: 0,
    maxWidth: 74,
    minHeight: 31,
    borderRadius: 15.5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    zIndex: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  noteBubbleText: { fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 13 },
  onlineDot: {
    position: 'absolute',
    right: 10,
    bottom: 5,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 3,
  },
  noteName: { fontSize: 12, fontWeight: '600', maxWidth: 76, textAlign: 'center' },
})

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 10,
    },
    headerTitle: { color: theme.text, fontSize: 32, fontWeight: '900', letterSpacing: 0 },
    headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    searchPill: {
      minHeight: 48,
      marginHorizontal: 18,
      marginBottom: 12,
      paddingHorizontal: 16,
      borderRadius: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.surface,
    },
    searchText: { color: theme.text, fontSize: 17, fontWeight: '500', flex: 1, paddingVertical: 0 },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 4,
    },
    sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    composeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
    },
    listContent: { paddingHorizontal: 8, paddingBottom: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 16,
      gap: 12,
    },
    rowInfo: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
    rowName: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1 },
    groupBadge: {
      backgroundColor: theme.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    groupBadgeTxt: { color: theme.accent, fontSize: 11, fontWeight: '800' },
    rowTime: { color: theme.faint, fontSize: 12, fontWeight: '600' },
    rowSubWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    rowSub: { color: theme.faint, fontSize: 13, fontWeight: '600', flex: 1 },
    empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 40 },
    emptyTxt: { color: theme.text, fontSize: 16, fontWeight: '800', marginTop: 14, marginBottom: 8 },
    emptySub: { color: theme.faint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  })
}
