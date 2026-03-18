import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet,
  StatusBar, ActivityIndicator, Modal, Alert,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useChat } from '../../../src/hooks/useChat'
import { storage } from '../../../src/lib/storage'
import { useVoiceCall } from '../../../src/hooks/useVoiceCall'
import { useGroupCall } from '../../../src/hooks/useGroupCall'
import CallScreen from '../../../src/components/CallScreen'
import GroupCallScreen from '../../../src/components/GroupCallScreen'
import { moderationApi, blocksApi, type MemberType } from '../../../src/lib/api'
import { useRooms } from '../../../src/hooks/useRooms'

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length] ?? COLORS[0]

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const { messages, members, connected, loading, sendMessage, wsRef } = useChat(roomId)
  const [input, setInput] = useState('')
  const [inputH, setInputH] = useState(44)
  const [myId, setMyId] = useState<string | null>(null)
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [roomType, setRoomType] = useState<'dm' | 'group'>('dm')
  const [roomName, setRoomName] = useState('Phòng chat')
  const [isGroupAdmin, setIsGroupAdmin] = useState(false)
  const flatRef = useRef<FlatList>(null)

  // Modals
  const [menuModal,     setMenuModal]     = useState(false)
  const [reportModal,   setReportModal]   = useState(false)
  const [memberModal,   setMemberModal]   = useState(false)
  const [reportReason,  setReportReason]  = useState('')
  const [reportDetail,  setReportDetail]  = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportTarget,  setReportTarget]  = useState<MemberType | null>(null)

  const { leaveGroup, rooms } = useRooms()

  // DM voice call
  const { callState, incomingCall, startCall, acceptCall, rejectCall, endCall, isMuted, toggleMute, isSpeaker, toggleSpeaker } = useVoiceCall(wsRef)

  // Group call
  const { groupCallState, peers, incomingGroupCall, startGroupCall, joinGroupCall, rejectGroupCall, leaveGroupCall, isGroupMuted, toggleGroupMute } = useGroupCall(wsRef)

  useEffect(() => {
    const load = async () => {
      const [uid, uname] = await Promise.all([storage.getUserId(), storage.getUsername()])
      setMyId(uid)
      setMyUsername(uname)
    }
    load()
  }, [])

  // Determine room type and name from members
  useEffect(() => {
    if (!members.length || !myId) return
    const others = members.filter(m => m.id !== myId)
    if (members.length > 2) {
      setRoomType('group')
      const room = rooms.find(r => r.id === roomId)
      setRoomName(room?.name ?? others.map(m => m.username).join(', '))
    } else {
      setRoomType('dm')
      setRoomName(others[0]?.username ?? 'Chat')
    }
  }, [members, myId, rooms, roomId])

  // Check if I'm group admin
  useEffect(() => {
    if (roomType !== 'group') return
    const room = rooms.find(r => r.id === roomId)
    if (room?.groupAdminId && myId && room.groupAdminId === myId) {
      setIsGroupAdmin(true)
    }
  }, [roomId, roomType, myId, rooms])

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

  const otherMember = members.find(m => m.id !== myId)
  const callRoomId = [myId, otherMember?.id].filter(Boolean).sort().join('_')

  const handleReport = async () => {
    if (!reportReason || !reportTarget) return
    setReportLoading(true)
    try {
      await moderationApi.report(reportTarget.id, reportReason, reportDetail)
      setReportModal(false)
      setReportReason('')
      setReportDetail('')
      Alert.alert('Đã báo cáo', 'Chúng tôi sẽ xem xét trong thời gian sớm nhất')
    } catch { Alert.alert('Lỗi', 'Không gửi được báo cáo') }
    finally { setReportLoading(false) }
  }

  const handleBlock = (target: MemberType) => {
    Alert.alert(`Chặn @${target.username}`, 'Bạn sẽ không thể nhắn tin với người này nữa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Chặn', style: 'destructive',
        onPress: async () => {
          try {
            await blocksApi.block(target.id)
            Alert.alert('Đã chặn', `@${target.username} đã bị chặn`)
            router.back()
          } catch { Alert.alert('Lỗi', 'Không chặn được') }
        },
      },
    ])
  }

  const handleLeaveGroup = () => {
    Alert.alert('Rời nhóm', 'Bạn sẽ rời khỏi nhóm này.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm', style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(roomId)
            router.back()
          } catch { Alert.alert('Lỗi', 'Không rời được nhóm') }
        },
      },
    ])
  }

  const handleKickMember = (target: MemberType) => {
    if (!myId) return
    Alert.alert(`Xóa @${target.username}`, 'Xóa người này khỏi nhóm?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive',
        onPress: async () => {
          try {
            await roomsApi.removeMember(roomId, target.id)
            Alert.alert('Đã xóa', `@${target.username} đã bị xóa khỏi nhóm`)
          } catch { Alert.alert('Lỗi', 'Không xóa được') }
        },
      },
    ])
  }

  const displayTitle = roomType === 'group'
    ? (roomName || 'Nhóm chat')
    : (otherMember?.username ? `@${otherMember.username}` : 'Chat')

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E1C" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>

        {roomType === 'group' ? (
          <View style={[s.avatar, { backgroundColor: '#1E1B4B' }]}>
            <Text style={{ fontSize: 18 }}>👥</Text>
          </View>
        ) : (
          <View style={[s.avatar, { backgroundColor: avatarBg(displayTitle) }]}>
            <Text style={s.avatarTxt}>{displayTitle[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}

        <View style={s.headerInfo}>
          <Text style={s.headerName} numberOfLines={1}>{displayTitle}</Text>
          <View style={s.statusRow}>
            <View style={[s.connDot, { backgroundColor: connected ? '#22C55E' : '#EF4444' }]} />
            <Text style={s.statusTxt}>
              {connected ? (roomType === 'group' ? `${members.length} thành viên · E2EE` : 'E2EE · Bảo mật') : 'Đang kết nối...'}
            </Text>
          </View>
        </View>

        {/* DM call button */}
        {roomType === 'dm' && otherMember && callState === 'idle' && groupCallState === 'idle' && (
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => startCall(otherMember.id, otherMember.username, callRoomId)}
            activeOpacity={0.7}
          >
            <Text style={s.headerBtnIco}>📞</Text>
          </TouchableOpacity>
        )}

        {/* Group call button */}
        {roomType === 'group' && groupCallState === 'idle' && callState === 'idle' && (
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => myUsername && startGroupCall(roomId, myUsername)}
            activeOpacity={0.7}
          >
            <Text style={s.headerBtnIco}>📞</Text>
          </TouchableOpacity>
        )}

        {/* Members list (group) */}
        {roomType === 'group' && (
          <TouchableOpacity style={s.headerBtn} onPress={() => setMemberModal(true)} activeOpacity={0.7}>
            <Text style={s.headerBtnIco}>👤</Text>
          </TouchableOpacity>
        )}

        {/* Menu */}
        <TouchableOpacity style={s.headerBtn} onPress={() => setMenuModal(true)} activeOpacity={0.7}>
          <Text style={s.headerBtnIco}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* DM voice call UI */}
      {roomType === 'dm' && (
        <CallScreen
          callState={callState}
          incomingCall={incomingCall}
          callingUsername={otherMember?.username}
          isMuted={isMuted}
          isSpeaker={isSpeaker}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleSpeaker={toggleSpeaker}
        />
      )}

      {/* Group call UI */}
      {roomType === 'group' && (
        <GroupCallScreen
          callState={groupCallState}
          peers={peers}
          incomingGroupCall={incomingGroupCall}
          isMuted={isGroupMuted}
          onJoin={() => myUsername && joinGroupCall(myUsername)}
          onReject={rejectGroupCall}
          onLeave={leaveGroupCall}
          onToggleMute={toggleGroupMute}
        />
      )}

      {/* Menu Modal */}
      <Modal visible={menuModal} transparent animationType="fade" onRequestClose={() => setMenuModal(false)}>
        <TouchableOpacity style={mm.overlay} activeOpacity={1} onPress={() => setMenuModal(false)}>
          <View style={mm.menu}>
            {roomType === 'dm' && otherMember && (
              <>
                <TouchableOpacity style={mm.item} onPress={() => { setMenuModal(false); setReportTarget(otherMember); setReportModal(true) }}>
                  <Text style={mm.itemTxt}>⚠️  Báo cáo @{otherMember.username}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={mm.item} onPress={() => { setMenuModal(false); handleBlock(otherMember) }}>
                  <Text style={[mm.itemTxt, { color: '#EF4444' }]}>🚫  Chặn @{otherMember.username}</Text>
                </TouchableOpacity>
              </>
            )}
            {roomType === 'group' && (
              <TouchableOpacity style={mm.item} onPress={() => { setMenuModal(false); handleLeaveGroup() }}>
                <Text style={[mm.itemTxt, { color: '#EF4444' }]}>🚪  Rời nhóm</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[mm.item, { borderBottomWidth: 0 }]} onPress={() => setMenuModal(false)}>
              <Text style={[mm.itemTxt, { color: '#64748B' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Members Modal (group) */}
      <Modal visible={memberModal} transparent animationType="slide" onRequestClose={() => setMemberModal(false)}>
        <View style={bm.overlay}>
          <View style={bm.sheet}>
            <View style={bm.handle} />
            <Text style={bm.title}>Thành viên nhóm</Text>
            {members.map(m => (
              <View key={m.id} style={bm.row}>
                <View style={[bm.avatar, { backgroundColor: avatarBg(m.username) }]}>
                  <Text style={bm.avatarTxt}>{m.username[0]?.toUpperCase()}</Text>
                </View>
                <Text style={bm.memberName} numberOfLines={1}>
                  @{m.username}{m.id === myId ? ' (bạn)' : ''}
                </Text>
                {m.id !== myId && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={bm.reportBtn} onPress={() => { setMemberModal(false); setReportTarget(m); setReportModal(true) }}>
                      <Text style={bm.reportBtnTxt}>⚠️</Text>
                    </TouchableOpacity>
                    {isGroupAdmin && (
                      <TouchableOpacity style={bm.kickBtn} onPress={() => { setMemberModal(false); handleKickMember(m) }}>
                        <Text style={bm.kickBtnTxt}>Xóa</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity style={bm.closeBtn} onPress={() => setMemberModal(false)}>
              <Text style={bm.closeBtnTxt}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal visible={reportModal} transparent animationType="slide" onRequestClose={() => setReportModal(false)}>
        <View style={rm.overlay}>
          <View style={rm.sheet}>
            <View style={rm.handle} />
            <Text style={rm.title}>Báo cáo @{reportTarget?.username}</Text>
            <Text style={rm.desc}>Chọn lý do:</Text>
            {(['harassment', 'spam', 'inappropriate', 'other'] as const).map(r => (
              <TouchableOpacity key={r} style={[rm.reasonBtn, reportReason === r && rm.reasonBtnOn]} onPress={() => setReportReason(r)}>
                <Text style={[rm.reasonTxt, reportReason === r && rm.reasonTxtOn]}>
                  {r === 'harassment' ? '😡 Quấy rối / Nhắn nhiều' :
                   r === 'spam'       ? '📢 Spam' :
                   r === 'inappropriate' ? '🚫 Nội dung không phù hợp' : '❓ Lý do khác'}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={rm.input}
              value={reportDetail}
              onChangeText={setReportDetail}
              placeholder="Mô tả thêm (không bắt buộc)..."
              placeholderTextColor="#2E2E45"
              multiline
              maxLength={300}
            />
            <View style={rm.btnRow}>
              <TouchableOpacity style={rm.cancel} onPress={() => setReportModal(false)}>
                <Text style={rm.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rm.confirm, !reportReason && { opacity: 0.4 }]}
                onPress={handleReport}
                disabled={!reportReason || reportLoading}
              >
                {reportLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={rm.confirmTxt}>Gửi</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
                <Text style={{ color: '#374151', fontSize: 13 }}>Chưa có tin nhắn · Bắt đầu nào 👋</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const prevMine = index > 0 ? messages[index - 1].mine : null
              const grouped  = prevMine === item.mine
              const sender   = members.find(m => m.id === item.senderId)
              const senderName = sender?.username ?? 'unknown'
              return (
                <View style={[s.msgRow, item.mine ? s.msgRight : s.msgLeft, grouped && { marginTop: 2 }]}>
                  {!item.mine && (
                    <View style={[s.msgAvatar, { backgroundColor: avatarBg(senderName) }, grouped && { opacity: 0 }]}>
                      <Text style={s.msgAvatarTxt}>{senderName[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View>
                    {!item.mine && !grouped && roomType === 'group' && (
                      <Text style={s.senderName}>@{senderName}</Text>
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
                </View>
              )
            }}
          />
        )}

        <View style={s.bar}>
          <TextInput
            style={[s.input, { height: Math.max(44, inputH) }]}
            placeholder="Nhắn tin (E2EE)..."
            placeholderTextColor="#2E2E45"
            value={input}
            onChangeText={setInput}
            multiline
            onContentSizeChange={e => setInputH(Math.min(e.nativeEvent.contentSize.height + 4, 120))}
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

const mm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', paddingBottom: 40 },
  menu:     { marginHorizontal: 16, backgroundColor: '#0E0E1C', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#1A1A2E' },
  item:     { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#12121E' },
  itemTxt:  { color: '#F1F5F9', fontSize: 15, fontWeight: '500' },
})

const bm = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#0E0E1C', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderTopWidth: 1, borderColor: '#1A1A2E' },
  handle:      { width: 40, height: 4, backgroundColor: '#2E2E45', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatar:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberName:  { flex: 1, color: '#F1F5F9', fontSize: 15, fontWeight: '500' },
  reportBtn:   { padding: 8, backgroundColor: '#1C1208', borderRadius: 8 },
  reportBtnTxt:{ fontSize: 16 },
  kickBtn:     { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1A0A0A', borderRadius: 8 },
  kickBtnTxt:  { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  closeBtn:    { marginTop: 16, backgroundColor: '#12121E', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnTxt: { color: '#64748B', fontSize: 15, fontWeight: '600' },
})

const rm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#0E0E1C', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: '#1A1A2E' },
  handle:       { width: 40, height: 4, backgroundColor: '#2E2E45', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:        { color: '#F1F5F9', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  desc:         { color: '#64748B', fontSize: 13, marginBottom: 14 },
  reasonBtn:    { backgroundColor: '#12121E', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1.5, borderColor: '#1E1E30' },
  reasonBtnOn:  { borderColor: '#EF4444', backgroundColor: '#1C0A0A' },
  reasonTxt:    { color: '#94A3B8', fontSize: 14 },
  reasonTxtOn:  { color: '#EF4444', fontWeight: '600' },
  input:        { backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#F1F5F9', fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginTop: 8, marginBottom: 16 },
  btnRow:       { flexDirection: 'row', gap: 10 },
  cancel:       { flex: 1, backgroundColor: '#12121E', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  cancelTxt:    { color: '#64748B', fontSize: 15, fontWeight: '600' },
  confirm:      { flex: 2, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
})

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#08080F' },
  header:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0E0E1C', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#12121E' },
  backBtn:     { padding: 6, marginRight: 2 },
  backArrow:   { color: '#818CF8', fontSize: 30, fontWeight: '200' },
  avatar:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarTxt:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerInfo:  { flex: 1 },
  headerName:  { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  statusRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  connDot:     { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusTxt:   { color: '#64748B', fontSize: 12 },
  headerBtn:   { marginLeft: 6, padding: 7 },
  headerBtnIco:{ fontSize: 18 },
  senderName:  { color: '#6366F1', fontSize: 11, fontWeight: '600', marginBottom: 2, marginLeft: 2 },
  msgList:     { paddingHorizontal: 12, paddingVertical: 12 },
  msgRow:      { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  msgLeft:     { justifyContent: 'flex-start' },
  msgRight:    { justifyContent: 'flex-end' },
  msgAvatar:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  msgAvatarTxt:{ color: '#fff', fontSize: 11, fontWeight: '700' },
  bubble:      { maxWidth: '76%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine:  { backgroundColor: '#3730A3', borderBottomRightRadius: 4 },
  bubbleTheirs:{ backgroundColor: '#1A1A2E', borderBottomLeftRadius: 4 },
  bubbleTxt:   { color: '#F1F5F9', fontSize: 15, lineHeight: 22 },
  meta:        { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  metaTime:    { color: 'rgba(241,245,249,0.35)', fontSize: 11 },
  metaTick:    { color: 'rgba(241,245,249,0.35)', fontSize: 11 },
  metaTickRead:{ color: '#818CF8' },
  bar:         { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 10, backgroundColor: '#0E0E1C', borderTopWidth: 1, borderTopColor: '#12121E' },
  input:       { flex: 1, backgroundColor: '#12121E', borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, color: '#F1F5F9', fontSize: 15, marginRight: 8 },
  sendBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#12121E', alignItems: 'center', justifyContent: 'center' },
  sendBtnOn:   { backgroundColor: '#6366F1' },
  sendIco:     { color: '#2E2E45', fontSize: 20, fontWeight: '600' },
  sendIcoOn:   { color: '#fff' },
})
