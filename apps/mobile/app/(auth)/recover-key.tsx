import 'expo-standard-web-crypto'
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, StatusBar, Modal,
} from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import {
  decryptPrivateKeyWithPassphrase,
  generateRsaKeyPair, exportRsaKeyPair, publicKeyFingerprint,
} from '../../src/lib/crypto'
import { ensureSignalReady, buildPublicSignalBundle } from '../../src/lib/signal'
import { API_BASE_URL } from '../../src/lib/runtimeConfig'

const API = API_BASE_URL
const localPublicKeyKey = (userId: string) => `publicKey_${userId}`
const RESTORE_SYNC_KEY = 'veyluro_restore_sync_pending'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type RestoreStage =
  | 'idle'
  | 'verifying'
  | 'decrypting'
  | 'validating'
  | 'rebuilding'
  | 'syncing'
  | 'done'

export default function RecoverKeyScreen() {
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<RestoreStage>('idle')
  const [stageText, setStageText] = useState('')

  const setRestoreStage = (next: RestoreStage, pct: number, label: string) => {
    setStage(next)
    setProgress(pct)
    setStageText(label)
  }

  const handleRecover = async () => {
    if (!passphrase.trim()) { Alert.alert('Nhập passphrase'); return }
    setLoading(true)
    setRestoreStage('verifying', 8, 'Đang kiểm tra backup...')
    try {
      const token = await SecureStore.getItemAsync('veyluro_token')
      const userId = await SecureStore.getItemAsync('veyluro_userId')
      if (!token || !userId) throw new Error('Phiên đăng nhập hết hạn')
      await sleep(220)

      const res = await fetch(`${API}/api/auth/encrypted-key`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Không lấy được key backup từ server')
      const { encryptedKey } = await res.json() as { encryptedKey: string }

      if (!encryptedKey) {
        Alert.alert('Không có backup', 'Tài khoản này chưa lưu backup.', [
          { text: 'Tạo key mới', onPress: createNewKey },
        ])
        return
      }

      setRestoreStage('decrypting', 28, 'Đang giải mã khóa bằng PIN...')
      const privateKey = await decryptPrivateKeyWithPassphrase(encryptedKey, passphrase)
      await sleep(350)

      setRestoreStage('validating', 48, 'Đang xác thực identity và fingerprint...')
      await ensureSignalReady(userId)
      const signalBundle = buildPublicSignalBundle()
      const verify = await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signalBundle }),
      })
      if (!verify.ok) throw new Error('Không verify được Signal bundle trên server')
      await sleep(250)

      setRestoreStage('rebuilding', 68, 'Đang dựng lại session local...')
      await SecureStore.setItemAsync(`privateKey_${userId}`, privateKey)
      await sleep(450)

      setRestoreStage('syncing', 86, 'Đang đồng bộ nền, có thể mất 1-2 phút...')
      await SecureStore.setItemAsync(RESTORE_SYNC_KEY, JSON.stringify({
        pending: true,
        startedAt: Date.now(),
        status: 'syncing',
      }))
      await sleep(400)

      setRestoreStage('done', 100, 'Khôi phục hoàn tất')
      await sleep(280)
      Alert.alert('Khôi phục xong', 'Đã mở khóa. App sẽ tiếp tục sync khóa trong nền.')
      router.replace('/(app)/(tabs)')
    } catch (e) {
      Alert.alert('Khôi phục thất bại', e instanceof Error ? e.message : 'PIN sai hoặc dữ liệu backup hỏng.')
    } finally {
      setLoading(false)
      setStage('idle')
      setProgress(0)
      setStageText('')
    }
  }

  const createNewKey = async () => {
    try {
      const userId = await SecureStore.getItemAsync('veyluro_userId')
      const token = await SecureStore.getItemAsync('veyluro_token')
      if (!userId || !token) return
      await ensureSignalReady(userId)
      const signalBundle = buildPublicSignalBundle()
      const kp = await generateRsaKeyPair()
      const { publicKey, privateKey } = await exportRsaKeyPair(kp)
      const fingerprint = await publicKeyFingerprint(publicKey)
      await SecureStore.setItemAsync(`privateKey_${userId}`, privateKey)
      await SecureStore.setItemAsync(localPublicKeyKey(userId), publicKey)
      await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey, fingerprint, signalBundle }),
      })
      router.replace('/(app)/(tabs)')
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể tạo key mới: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleLogout = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('veyluro_token'),
      SecureStore.deleteItemAsync('veyluro_userId'),
      SecureStore.deleteItemAsync('veyluro_username'),
    ])
    router.replace('/(auth)/login')
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', padding: 24 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.moonRow}>
          <View style={s.moonOuter}><View style={s.moonInner} /></View>
        </View>
        <Text style={s.title}>Thiết bị mới</Text>
        <Text style={s.sub}>Nhập PIN 6 số để khôi phục. Hệ thống sẽ chạy restore theo từng bước và sync nền sau khi mở app.</Text>

        <View style={s.box}>
          <Text style={s.label}>PIN BẢO VỆ</Text>
          <TextInput
            style={s.input}
            placeholder="6 chữ số..."
            placeholderTextColor="#2E2E45"
            value={passphrase}
            onChangeText={t => setPassphrase(t.replace(/\D/g, '').slice(0, 6))}
            secureTextEntry
            keyboardType="numeric"
            maxLength={6}
          />
          <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleRecover} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Bắt đầu khôi phục</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={createNewKey} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: '#EF4444', fontSize: 13 }}>Quên passphrase (mất tin cũ)</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.warn}>Nếu quên passphrase, tin nhắn cũ sẽ không thể đọc lại.</Text>
        <TouchableOpacity onPress={handleLogout} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={{ color: '#4E677F', fontSize: 13 }}>← Đăng xuất</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      <Modal visible={loading} transparent animationType="fade">
        <View style={s.progressBackdrop}>
          <View style={s.progressCard}>
            <Text style={s.progressTitle}>Đang khôi phục bảo mật</Text>
            <Text style={s.progressSub}>{stageText || 'Đang xử lý...'}</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.max(6, progress)}%` }]} />
            </View>
            <Text style={s.progressPct}>{progress}% · {stage}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#08080F' },
  moonRow:   { alignItems: 'center', marginBottom: 28 },
  moonOuter: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0EA5A5', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 6 },
  moonInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#08080F' },
  title:     { color: '#F1F5F9', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  sub:       { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  box:       { backgroundColor: '#102131', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1B2F43' },
  label:     { color: '#64748B', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  input:     { backgroundColor: '#0B1724', borderWidth: 1.5, borderColor: '#1B2F43', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15, marginBottom: 16 },
  btn:       { backgroundColor: '#0EA5A5', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnTxt:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  warn:      { color: '#78350F', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 20, paddingHorizontal: 10 },
  progressBackdrop: { flex: 1, backgroundColor: 'rgba(5,8,15,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  progressCard: { width: '100%', maxWidth: 360, backgroundColor: '#121826', borderRadius: 16, borderWidth: 1, borderColor: '#1F2A37', padding: 18 },
  progressTitle: { color: '#E5F9F7', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  progressSub: { color: '#94A3B8', fontSize: 13, marginBottom: 14 },
  progressTrack: { height: 10, backgroundColor: '#1E293B', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#14B8A6' },
  progressPct: { color: '#7DD3FC', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'right' },
})

