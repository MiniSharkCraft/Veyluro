import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import {
  BroadcastIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  UsersThreeIcon,
  XIcon,
} from 'phosphor-react-native'
import type { GroupCallState, GroupPeer } from '../hooks/useGroupCall'

interface Props {
  callState: GroupCallState
  peers: GroupPeer[]
  incomingGroupCall: { fromUserId: string; fromUsername: string; roomId: string } | null
  isMuted: boolean
  onJoin: () => void
  onReject: () => void
  onLeave: () => void
  onToggleMute: () => void
}

export default function GroupCallScreen({
  callState, peers, incomingGroupCall,
  isMuted, onJoin, onReject, onLeave, onToggleMute,
}: Props) {
  if (callState === 'idle') return null

  // Incoming group call invite
  if (callState === 'ringing' && incomingGroupCall) {
    return (
      <View style={s.banner}>
        <View style={s.bannerInfo}>
          <UsersThreeIcon size={24} color="#A5B4FC" weight="fill" />
          <View>
            <Text style={s.bannerTitle}>Cuộc gọi nhóm</Text>
            <Text style={s.bannerSub}>@{incomingGroupCall.fromUsername} đã bắt đầu</Text>
          </View>
        </View>
        <View style={s.bannerActions}>
          <TouchableOpacity style={s.rejectBtn} onPress={onReject}>
            <XIcon size={16} color="#EF4444" weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity style={s.acceptBtn} onPress={onJoin}>
            <Text style={s.acceptBtnTxt}>Tham gia</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Inviting (waiting for others to join)
  if (callState === 'inviting') {
    return (
      <View style={s.inviting}>
        <BroadcastIcon size={17} color="#818CF8" weight="bold" />
        <Text style={s.invitingTxt}>Đã mời thành viên... Chờ họ tham gia</Text>
        <TouchableOpacity style={s.leaveSmallBtn} onPress={onLeave}>
          <Text style={s.leaveSmallTxt}>Hủy</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Active group call
  if (callState === 'active') {
    return (
      <View style={s.active}>
        <View style={s.peersRow}>
          <View style={s.peerSelf}>
            {isMuted ? <MicrophoneSlashIcon size={14} color="#A5B4FC" weight="bold" /> : <MicrophoneIcon size={14} color="#A5B4FC" weight="bold" />}
            <Text style={s.peerName}>Bạn</Text>
          </View>
          {peers.map(p => (
            <View key={p.userId} style={s.peerPill}>
              <MicrophoneIcon size={14} color="#94A3B8" weight="bold" />
              <Text style={s.peerName}>@{p.username}</Text>
            </View>
          ))}
        </View>
        <View style={s.controls}>
          <TouchableOpacity style={[s.ctrl, isMuted && s.ctrlActive]} onPress={onToggleMute}>
            {isMuted ? <MicrophoneSlashIcon size={20} color="#A5B4FC" weight="bold" /> : <MicrophoneIcon size={20} color="#94A3B8" weight="bold" />}
          </TouchableOpacity>
          <TouchableOpacity style={[s.ctrl, s.endBtn]} onPress={onLeave}>
            <PhoneDisconnectIcon size={21} color="#EF4444" weight="fill" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return null
}

const s = StyleSheet.create({
  banner:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D1626', marginHorizontal: 12, marginVertical: 6, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1E3A5F' },
  bannerInfo:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bannerTitle:  { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  bannerSub:    { color: '#64748B', fontSize: 12, marginTop: 2 },
  bannerActions:{ flexDirection: 'row', gap: 8 },
  rejectBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A0A0A', alignItems: 'center', justifyContent: 'center' },
  acceptBtn:    { backgroundColor: '#166534', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  acceptBtnTxt: { color: '#4ADE80', fontSize: 13, fontWeight: '700' },
  inviting:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D1626', marginHorizontal: 12, marginVertical: 6, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1E3A5F' },
  invitingTxt:  { color: '#818CF8', fontSize: 13, flex: 1 },
  leaveSmallBtn:{ backgroundColor: '#1A0A0A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  leaveSmallTxt:{ color: '#EF4444', fontSize: 13, fontWeight: '600' },
  active:       { backgroundColor: '#050510', marginHorizontal: 12, marginVertical: 6, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1E1B4B' },
  peersRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  peerSelf:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1B4B', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  peerPill:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  peerName:     { color: '#F1F5F9', fontSize: 13, fontWeight: '600' },
  controls:     { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  ctrl:         { width: 44, height: 44, borderRadius: 22, backgroundColor: '#12121E', alignItems: 'center', justifyContent: 'center' },
  ctrlActive:   { backgroundColor: '#1E1B4B' },
  endBtn:       { backgroundColor: '#1A0A0A' },
})
