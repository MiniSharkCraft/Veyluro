import { View, Text, TouchableOpacity, StyleSheet, Modal, Vibration } from 'react-native'
import { useEffect } from 'react'
import { CallState, IncomingCall } from '../hooks/useVoiceCall'

interface Props {
  callState: CallState
  incomingCall: IncomingCall | null
  callingUsername?: string
  isMuted: boolean
  isSpeaker: boolean
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleSpeaker: () => void
}

export default function CallScreen({
  callState, incomingCall, callingUsername,
  isMuted, isSpeaker,
  onAccept, onReject, onEnd, onToggleMute, onToggleSpeaker,
}: Props) {
  const visible = callState !== 'idle'

  useEffect(() => {
    if (callState === 'ringing') {
      const interval = setInterval(() => Vibration.vibrate(500), 1500)
      return () => { clearInterval(interval); Vibration.cancel() }
    }
  }, [callState])

  const displayName = incomingCall?.fromUsername ?? callingUsername ?? '...'

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={s.root}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={s.name}>{displayName}</Text>
        <Text style={s.status}>
          {callState === 'calling' ? 'Đang gọi...' :
           callState === 'ringing' ? 'Cuộc gọi đến' :
           callState === 'active'  ? 'Đang kết nối' : ''}
        </Text>

        {callState === 'ringing' ? (
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.rejectBtn]} onPress={onReject}>
              <Text style={s.btnIcon}>📵</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.acceptBtn]} onPress={onAccept}>
              <Text style={s.btnIcon}>📞</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.ctrlBtn, isMuted && s.btnActive]} onPress={onToggleMute}>
                <Text style={s.btnIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
                <Text style={s.btnLabel}>{isMuted ? 'Bỏ tắt' : 'Tắt mic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.ctrlBtn, isSpeaker && s.btnActive]} onPress={onToggleSpeaker}>
                <Text style={s.btnIcon}>🔊</Text>
                <Text style={s.btnLabel}>Loa ngoài</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[s.btn, s.endBtn]} onPress={onEnd}>
              <Text style={s.btnIcon}>📵</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#08080F', alignItems: 'center', justifyContent: 'center', gap: 16 },
  avatar:    { width: 96, height: 96, borderRadius: 48, backgroundColor: '#1E1B4B', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText:{ color: '#818CF8', fontSize: 40, fontWeight: '700' },
  name:      { color: '#F1F5F9', fontSize: 24, fontWeight: '700' },
  status:    { color: '#64748B', fontSize: 14, marginBottom: 32 },
  btnRow:    { flexDirection: 'row', gap: 24 },
  btn:       { alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 36 },
  acceptBtn: { backgroundColor: '#16A34A' },
  rejectBtn: { backgroundColor: '#DC2626' },
  endBtn:    { backgroundColor: '#DC2626', marginTop: 16 },
  ctrlBtn:   { backgroundColor: '#1E1E30' },
  btnActive: { backgroundColor: '#1E1B4B' },
  btnIcon:   { fontSize: 28 },
  btnLabel:  { color: '#94A3B8', fontSize: 10, marginTop: 4 },
})
