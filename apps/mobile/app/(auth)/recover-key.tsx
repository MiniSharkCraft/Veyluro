/**
 * Màn hình recover private key bằng passphrase — hiện ra khi login thiết bị mới
 * mà không có private key trong SecureStore.
 */
import 'expo-standard-web-crypto'
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, StatusBar,
} from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

async function decryptPrivateKeyWithPassphrase(encryptedKeyJson: string, passphrase: string): Promise<string> {
  const { salt, iv, ct } = JSON.parse(encryptedKeyJson)
  const enc = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  )
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  )
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    new Uint8Array(ct),
  )
  return new TextDecoder().decode(plaintext)
}

export default function RecoverKeyScreen() {
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRecover = async () => {
    if (!passphrase.trim()) {
      Alert.alert('Nhập passphrase')
      return
    }
    setLoading(true)
    try {
      const token = await SecureStore.getItemAsync('amoon:token')
      const userId = await SecureStore.getItemAsync('amoon:userId')
      if (!token || !userId) throw new Error('Phiên đăng nhập hết hạn')

      // Lấy encrypted key từ server
      const res = await fetch(`${API}/api/auth/encrypted-key`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Không lấy được key từ server')
      const { encryptedKey } = await res.json() as { encryptedKey: string }

      if (!encryptedKey) {
        Alert.alert(
          'Không có backup',
          'Tài khoản này chưa có backup passphrase. Tin nhắn cũ không thể khôi phục.',
          [{ text: 'Tạo key mới', onPress: createNewKey }]
        )
        return
      }

      // Decrypt private key bằng passphrase
      const privateKey = await decryptPrivateKeyWithPassphrase(encryptedKey, passphrase)
      await SecureStore.setItemAsync(`privateKey:${userId}`, privateKey)

      Alert.alert('Thành công', 'Đã khôi phục khóa E2EE!')
      router.replace('/(app)/(tabs)')
    } catch (err) {
      Alert.alert('Sai passphrase', 'Passphrase không đúng hoặc key đã bị thay đổi.')
    } finally {
      setLoading(false)
    }
  }

  const createNewKey = async () => {
    // Tạo key pair mới — tin nhắn cũ sẽ không decrypt được
    try {
      const userId = await SecureStore.getItemAsync('amoon:userId')
      const token = await SecureStore.getItemAsync('amoon:token')
      if (!userId || !token) return

      const { generateRsaKeyPair, exportRsaKeyPair, publicKeyFingerprint } = await import('@messmini/common')
      const kp = await generateRsaKeyPair()
      const { publicKey, privateKey } = await exportRsaKeyPair(kp)
      const fingerprint = await publicKeyFingerprint(publicKey)

      await SecureStore.setItemAsync(`privateKey:${userId}`, privateKey)

      await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey, fingerprint }),
      })

      router.replace('/(app)/(tabs)')
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể tạo key mới')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', padding: 24 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.moonRow}>
          <View style={s.moonOuter}><View style={s.moonInner} /></View>
        </View>

        <Text style={s.title}>Thiết bị mới</Text>
        <Text style={s.sub}>Nhập passphrase để khôi phục khóa E2EE và đọc lại tin nhắn cũ.</Text>

        <View style={s.box}>
          <Text style={s.label}>PASSPHRASE</Text>
          <TextInput
            style={s.input}
            placeholder="cụm từ bí mật của bạn..."
            placeholderTextColor="#2E2E45"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleRecover} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Khôi phục →</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={createNewKey} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: '#EF4444', fontSize: 13 }}>Quên passphrase (mất tin nhắn cũ)</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.warn}>⚠️ Nếu quên passphrase, tin nhắn cũ sẽ không thể đọc lại. Server không lưu khóa plaintext.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  moonRow: { alignItems: 'center', marginBottom: 28 },
  moonOuter: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366F1', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 6 },
  moonInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#08080F' },
  title: { color: '#F1F5F9', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  sub: { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  box: { backgroundColor: '#12121E', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1E1E30' },
  label: { color: '#64748B', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15, marginBottom: 16,
  },
  btn: { backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  warn: { color: '#78350F', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 20, paddingHorizontal: 10 },
})
