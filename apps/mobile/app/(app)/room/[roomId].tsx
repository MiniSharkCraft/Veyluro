import { useState, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet,
  StatusBar, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useChat } from '../../../src/hooks/useChat'
import { storage } from '../../../src/lib/storage'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[name?.charCodeAt(0) % COLORS.length] ?? COLORS[0]

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const { messages, members, connected, loading, sendMessage } = useChat(roomId)
  const [input, setInput] = useState('')
  const [inputH, setInputH] = useState(44)
  const [myId, setMyId] = useState<string | null>(null)
  const flatRef = useRef<FlatList>(null)

  useEffect(() => {
    storage.getUserId().then(setMyId)
  }, [])

  // Scroll xuống khi có tin mới
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80)
    }
  }, [messages.length])

  const send = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
    setInputH(44)
  }

  // Tìm tên room từ members (tên của người kia trong DM)
  const roomName = members
    .filter(m => m.id !== myId)
    .map(m => m.username)
    .join(', ') || 'Phòng chat'

  const firstLetter = roomName[0]?.toUpperCase() ?? '?'

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E1C" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>

        <View style={[s.avatar, { backgroundColor: avatarBg(roomName) }]}>
          <Text style={s.avatarTxt}>{firstLetter}</Text>
        </View>

        <View style={s.headerInfo}>
          <Text style={s.headerName} numberOfLines={1}>{roomName}</Text>
          <View style={s.statusRow}>
            <View style={[s.connDot, { backgroundColor: connected ? '#22C55E' : '#EF4444' }]} />
            <Text style={s.statusTxt}>{connected ? 'Đã kết nối' : 'Đang kết nối...'}</Text>
          </View>
        </View>

        <View style={s.e2eePill}>
          <View style={s.e2eeDot} />
          <Text style={s.e2eeTxt}>E2EE</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Messages */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#6366F1" size="large" />
            <Text style={{ color: '#64748B', marginTop: 12, fontSize: 13 }}>Đang tải tin nhắn...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={s.msgList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Text style={{ color: '#374151', fontSize: 13 }}>Chưa có tin nhắn · Hãy bắt đầu 👋</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const prevMine = index > 0 ? messages[index - 1].mine : null
              const grouped = prevMine === item.mine

              // Tìm tên sender
              const sender = members.find(m => m.id === item.senderId)
              const senderName = sender?.username ?? 'unknown'

              return (
                <View style={[s.msgRow, item.mine ? s.msgRight : s.msgLeft, grouped && { marginTop: 2 }]}>
                  {!item.mine && (
                    <View style={[s.msgAvatar, { backgroundColor: avatarBg(senderName) }, grouped && { opacity: 0 }]}>
                      <Text style={s.msgAvatarTxt}>{senderName[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={[s.bubble, item.mine ? s.bubbleMine : s.bubbleTheirs, item.pending && { opacity: 0.6 }]}>
                    <Text style={s.bubbleTxt}>{item.text}</Text>
                    <View style={s.meta}>
                      <Text style={s.metaTime}>{item.time}</Text>
                      {item.mine && (
                        <Text style={[s.metaTick, item.status === 'read' && s.metaTickRead]}>
                          {item.pending ? ' ○' : item.status === 'sent' ? ' ✓' : ' ✓✓'}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              )
            }}
          />
        )}

        {/* Input bar */}
        <View style={s.bar}>
          <TextInput
            style={[s.input, { height: Math.max(44, inputH) }]}
            placeholder="Nhắn tin (E2EE)..."
            placeholderTextColor="#2E2E45"
            value={input}
            onChangeText={setInput}
            multiline
            onContentSizeChange={e =>
              setInputH(Math.min(e.nativeEvent.contentSize.height + 4, 120))
            }
          />
          <TouchableOpacity
            style={[s.sendBtn, input.trim() && s.sendBtnOn]}
            onPress={send}
            disabled={!input.trim()}
            activeOpacity={0.8}
          >
            <Text style={[s.sendIco, input.trim() && s.sendIcoOn]}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0E0E1C',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#12121E',
  },
  backBtn: { padding: 6, marginRight: 2 },
  backArrow: { color: '#818CF8', fontSize: 30, fontWeight: '200' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  connDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusTxt: { color: '#64748B', fontSize: 12 },
  e2eePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1626',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1E3A5F',
  },
  e2eeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#6366F1', marginRight: 5 },
  e2eeTxt: { color: '#818CF8', fontSize: 11, fontWeight: '700' },

  msgList: { paddingHorizontal: 12, paddingVertical: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  msgAvatarTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bubble: { maxWidth: '76%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#3730A3', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#1A1A2E', borderBottomLeftRadius: 4 },
  bubbleTxt: { color: '#F1F5F9', fontSize: 15, lineHeight: 22 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  metaTime: { color: 'rgba(241,245,249,0.35)', fontSize: 11 },
  metaTick: { color: 'rgba(241,245,249,0.35)', fontSize: 11 },
  metaTickRead: { color: '#818CF8' },

  bar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    backgroundColor: '#0E0E1C', borderTopWidth: 1, borderTopColor: '#12121E',
  },
  input: {
    flex: 1, backgroundColor: '#12121E', borderRadius: 22,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    color: '#F1F5F9', fontSize: 15, marginRight: 8,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#12121E', alignItems: 'center', justifyContent: 'center' },
  sendBtnOn: { backgroundColor: '#6366F1' },
  sendIco: { color: '#2E2E45', fontSize: 20, fontWeight: '600' },
  sendIcoOn: { color: '#fff' },
})
