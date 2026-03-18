import 'expo-standard-web-crypto'
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, StatusBar, StyleSheet, SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import {
  generateRsaKeyPair, exportRsaKeyPair,
  importRsaPrivateKey, publicKeyFingerprint,
} from '@messmini/common'

WebBrowser.maybeCompleteAuthSession()

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://amoon-eclipse.fly.dev'

// Không hash client-side — server tự Argon2id, gửi thẳng qua HTTPS
const hashPassword = (pw: string) => Promise.resolve(pw)

// Mã hóa private key bằng passphrase (AES-256-GCM + PBKDF2)
async function encryptPrivateKeyWithPassphrase(privateKeyPem: string, passphrase: string) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, aesKey, enc.encode(privateKeyPem)
  )
  return {
    encryptedKey: JSON.stringify({
      salt: Array.from(salt),
      iv: Array.from(iv),
      ct: Array.from(new Uint8Array(ciphertext)),
    }),
    keySalt: Array.from(salt).join(','),
  }
}

async function setupE2eeKey(userId: string, token: string, passphrase?: string) {
  const existing = await SecureStore.getItemAsync(`privateKey:${userId}`)
  if (existing) return

  const kp = await generateRsaKeyPair()
  const { publicKey, privateKey } = await exportRsaKeyPair(kp)
  const fingerprint = await publicKeyFingerprint(publicKey)

  await SecureStore.setItemAsync(`privateKey:${userId}`, privateKey)

  await fetch(`${API}/api/auth/register-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ publicKey, fingerprint }),
  })

  // Backup key mã hóa bằng passphrase lên server
  if (passphrase) {
    const { encryptedKey, keySalt } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
    await fetch(`${API}/api/auth/store-encrypted-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ encryptedKey, keySalt }),
    })
  }
}

async function handleOAuthToken(provider: 'google', accessToken: string, passphrase?: string) {
  const res = await fetch(`${API}/api/auth/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, accessToken }),
  })
  if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
  const data = await res.json() as { token: string; userId: string; username: string }

  await setupE2eeKey(data.userId, data.token, passphrase)
  await SecureStore.setItemAsync('amoon:userId', data.userId)
  await SecureStore.setItemAsync('amoon:username', data.username)
  await SecureStore.setItemAsync('amoon:token', data.token)
}

// ─── Screens ─────────────────────────────────────────────────────────────────

type Screen = 'main' | 'forgotPassword' | 'resetPassword'

export default function LoginScreen() {
  const [tab, setTab] = useState<'oauth' | 'password'>('oauth')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [screen, setScreen] = useState<Screen>('main')

  // Form fields
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')

  // Forgot password
  const [fpEmail, setFpEmail] = useState('')
  const [fpOtp, setFpOtp] = useState('')
  const [fpNewPass, setFpNewPass] = useState('')
  const [fpStep, setFpStep] = useState<'email' | 'otp'>('email')

  const [loading, setLoading] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)

  const [, , googlePrompt] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    scopes: ['profile', 'email'],
  })

  const isLoading = loading !== null

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    if (mode === 'register' && passphrase !== confirmPassphrase) {
      Alert.alert('Lỗi', 'Passphrase không khớp')
      return
    }
    setLoading('google')
    try {
      const result = await googlePrompt()
      if (result.type !== 'success') throw new Error('Đăng nhập Google bị hủy')
      await handleOAuthToken('google', result.authentication!.accessToken, passphrase || undefined)
      router.replace('/(app)/(tabs)')
    } catch (err: unknown) {
      Alert.alert('Lỗi Google', err instanceof Error ? err.message : 'Thất bại')
    } finally {
      setLoading(null)
    }
  }

  // ── Password register/login ───────────────────────────────────────────────
  const handlePassword = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Thiếu thông tin', 'Điền đủ username và mật khẩu nha.')
      return
    }
    if (mode === 'register') {
      if (!email.trim()) {
        Alert.alert('Thiếu email', 'Email dùng để khôi phục mật khẩu.')
        return
      }
      if (!passphrase.trim()) {
        Alert.alert('Thiếu passphrase', 'Passphrase dùng để khôi phục tin nhắn E2EE trên thiết bị mới.')
        return
      }
      if (passphrase !== confirmPassphrase) {
        Alert.alert('Lỗi', 'Passphrase không khớp')
        return
      }
    }

    setLoading('password')
    try {
      const passwordHash = await hashPassword(password)

      if (mode === 'register') {
        const kp = await generateRsaKeyPair()
        const { publicKey, privateKey } = await exportRsaKeyPair(kp)
        const fingerprint = await publicKeyFingerprint(publicKey)

        const res = await fetch(`${API}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            password: passwordHash,
            publicKey,
            fingerprint,
          }),
        })
        if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
        const data = await res.json() as { token: string; userId: string; username: string }

        await SecureStore.setItemAsync(`privateKey:${data.userId}`, privateKey)
        await SecureStore.setItemAsync('amoon:userId', data.userId)
        await SecureStore.setItemAsync('amoon:username', data.username)
        await SecureStore.setItemAsync('amoon:token', data.token)

        // Backup key mã hóa bằng passphrase
        const { encryptedKey, keySalt } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
        await fetch(`${API}/api/auth/store-encrypted-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ encryptedKey, keySalt }),
        })
      } else {
        const res = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password: passwordHash }),
        })
        if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
        const data = await res.json() as { token: string; userId: string; username: string }

        const pk = await SecureStore.getItemAsync(`privateKey:${data.userId}`)
        if (!pk) {
          // Thiết bị mới — cần passphrase để recover key
          await SecureStore.setItemAsync('amoon:userId', data.userId)
          await SecureStore.setItemAsync('amoon:username', data.username)
          await SecureStore.setItemAsync('amoon:token', data.token)
          router.replace('/(auth)/recover-key')
          return
        }
        await importRsaPrivateKey(pk)
        await SecureStore.setItemAsync('amoon:userId', data.userId)
        await SecureStore.setItemAsync('amoon:username', data.username)
        await SecureStore.setItemAsync('amoon:token', data.token)
      }

      router.replace('/(app)/(tabs)')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Có gì đó sai sai')
    } finally {
      setLoading(null)
    }
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotSendOTP = async () => {
    if (!fpEmail.trim()) { Alert.alert('Nhập email'); return }
    setLoading('fp')
    try {
      await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail.trim() }),
      })
      setFpStep('otp')
      Alert.alert('Đã gửi', 'Kiểm tra email lấy mã OTP (10 phút)')
    } finally {
      setLoading(null)
    }
  }

  const handleForgotReset = async () => {
    if (!fpOtp.trim() || !fpNewPass.trim()) { Alert.alert('Điền đủ thông tin'); return }
    setLoading('fp')
    try {
      const passwordHash = await hashPassword(fpNewPass)
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail, otp: fpOtp, password: passwordHash }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
      Alert.alert('Thành công', 'Mật khẩu đã được đặt lại')
      setScreen('main')
      setFpStep('email')
      setFpEmail(''); setFpOtp(''); setFpNewPass('')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'OTP sai hoặc hết hạn')
    } finally {
      setLoading(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (screen === 'forgotPassword') {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#08080F" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => setScreen('main')} style={{ marginBottom: 24 }}>
              <Text style={{ color: '#818CF8', fontSize: 15 }}>‹ Quay lại</Text>
            </TouchableOpacity>
            <Text style={[s.appName, { marginBottom: 24 }]}>Quên mật khẩu</Text>

            {fpStep === 'email' ? (
              <>
                <Field label="Email đăng ký" value={fpEmail} onChange={setFpEmail}
                  placeholder="email@example.com" focused={focused} focusKey="fpe"
                  onFocus={() => setFocused('fpe')} onBlur={() => setFocused(null)} />
                <Btn label="Gửi mã OTP" onPress={handleForgotSendOTP} loading={loading === 'fp'} />
              </>
            ) : (
              <>
                <Field label="Mã OTP (6 số)" value={fpOtp} onChange={setFpOtp}
                  placeholder="123456" focused={focused} focusKey="fpotp"
                  onFocus={() => setFocused('fpotp')} onBlur={() => setFocused(null)} keyboardType="numeric" />
                <Field label="Mật khẩu mới" value={fpNewPass} onChange={setFpNewPass}
                  placeholder="mật khẩu mới..." focused={focused} focusKey="fpnp"
                  onFocus={() => setFocused('fpnp')} onBlur={() => setFocused(null)} secure />
                <Btn label="Đặt lại mật khẩu" onPress={handleForgotReset} loading={loading === 'fp'} />
                <TouchableOpacity onPress={() => setFpStep('email')} style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#64748B', fontSize: 13 }}>Gửi lại mã OTP</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={s.hero}>
            <View style={s.moonWrap}>
              <View style={s.moonOuter}>
                <View style={s.moonInner} />
              </View>
              <View style={[s.orbitDot, { top: 4, right: 12 }]} />
              <View style={[s.orbitDot, { bottom: 10, left: 8, backgroundColor: '#EC4899', width: 5, height: 5 }]} />
            </View>
            <Text style={s.appName}>AMoon Eclipse</Text>
            <Text style={s.tagline}>Nhắn tin · Ẩn danh · An toàn</Text>
          </View>

          <View style={s.card}>
            {/* Tab */}
            <View style={s.tabRow}>
              {(['oauth', 'password'] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]} activeOpacity={0.7}>
                  <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
                    {t === 'oauth' ? 'Đăng nhập nhanh' : 'Tài khoản'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'oauth' ? (
              <View style={s.oauthBlock}>
                {/* Mode toggle cho OAuth cũng cần passphrase khi register */}
                <View style={s.modeRow}>
                  {(['login', 'register'] as const).map(m => (
                    <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.modeBtn, mode === m && s.modeBtnOn]}>
                      <Text style={[s.modeTxt, mode === m && s.modeTxtOn]}>
                        {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {mode === 'register' && (
                  <>
                    <Field label="Passphrase" value={passphrase} onChange={setPassphrase}
                      placeholder="cụm từ bí mật để khôi phục..." focused={focused} focusKey="pp"
                      onFocus={() => setFocused('pp')} onBlur={() => setFocused(null)} secure />
                    <Field label="Xác nhận passphrase" value={confirmPassphrase} onChange={setConfirmPassphrase}
                      placeholder="nhập lại..." focused={focused} focusKey="cpp"
                      onFocus={() => setFocused('cpp')} onBlur={() => setFocused(null)} secure />
                    <Text style={s.passphraseHint}>
                      ⚠️ Ghi nhớ passphrase — nếu quên sẽ mất toàn bộ tin nhắn cũ trên thiết bị mới.
                    </Text>
                  </>
                )}

                <TouchableOpacity style={[s.oauthBtn, isLoading && { opacity: 0.6 }]} onPress={handleGoogle} disabled={isLoading} activeOpacity={0.85}>
                  {loading === 'google'
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <View style={s.oauthInner}>
                        <View style={s.oauthIconWrap}>
                          <Text style={s.oauthIcon}>G</Text>
                        </View>
                        <Text style={s.oauthTxt}>Tiếp tục với Google</Text>
                      </View>
                    )}
                </TouchableOpacity>

                <Text style={s.hint}>🔒 Khóa mã hóa được tạo ngay trên thiết bị — server không đọc được tin nhắn.</Text>
              </View>
            ) : (
              <View>
                <View style={s.modeRow}>
                  {(['login', 'register'] as const).map(m => (
                    <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.modeBtn, mode === m && s.modeBtnOn]}>
                      <Text style={[s.modeTxt, mode === m && s.modeTxtOn]}>
                        {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Field label="Tên người dùng" value={username} onChange={setUsername}
                  placeholder="username..." focused={focused} focusKey="u"
                  onFocus={() => setFocused('u')} onBlur={() => setFocused(null)} />

                {mode === 'register' && (
                  <Field label="Email (để khôi phục mật khẩu)" value={email} onChange={setEmail}
                    placeholder="email@example.com" focused={focused} focusKey="em"
                    onFocus={() => setFocused('em')} onBlur={() => setFocused(null)} keyboardType="email-address" />
                )}

                <Field label="Mật khẩu" value={password} onChange={setPassword}
                  placeholder="mật khẩu..." focused={focused} focusKey="p"
                  onFocus={() => setFocused('p')} onBlur={() => setFocused(null)} secure />

                {mode === 'register' && (
                  <>
                    <Field label="Passphrase (khôi phục E2EE)" value={passphrase} onChange={setPassphrase}
                      placeholder="cụm từ bí mật..." focused={focused} focusKey="pp"
                      onFocus={() => setFocused('pp')} onBlur={() => setFocused(null)} secure />
                    <Field label="Xác nhận passphrase" value={confirmPassphrase} onChange={setConfirmPassphrase}
                      placeholder="nhập lại passphrase..." focused={focused} focusKey="cpp"
                      onFocus={() => setFocused('cpp')} onBlur={() => setFocused(null)} secure />
                    <Text style={s.passphraseHint}>
                      ⚠️ Passphrase bảo vệ khóa E2EE. Quên = mất tin nhắn cũ khi đổi thiết bị.
                    </Text>
                  </>
                )}

                <TouchableOpacity style={[s.btn, isLoading && { opacity: 0.6 }]} onPress={handlePassword} disabled={isLoading} activeOpacity={0.85}>
                  {loading === 'password'
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnTxt}>{mode === 'login' ? 'Đăng nhập →' : 'Tạo tài khoản →'}</Text>
                  }
                </TouchableOpacity>

                {mode === 'login' && (
                  <TouchableOpacity onPress={() => setScreen('forgotPassword')} style={{ marginTop: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#6366F1', fontSize: 13 }}>Quên mật khẩu?</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Reusable components ──────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, focused, focusKey, onFocus, onBlur, secure, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; focused: string | null; focusKey: string
  onFocus: () => void; onBlur: () => void; secure?: boolean
  keyboardType?: 'email-address' | 'numeric' | 'default'
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, focused === focusKey && s.inputOn]}
        placeholder={placeholder} placeholderTextColor="#2E2E45"
        value={value} onChangeText={onChange}
        onFocus={onFocus} onBlur={onBlur}
        secureTextEntry={secure} autoCapitalize="none" autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  )
}

function Btn({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{label}</Text>}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 36 },

  hero: { alignItems: 'center', marginBottom: 36 },
  moonWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  moonOuter: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#6366F1',
    alignItems: 'flex-end', justifyContent: 'flex-start', padding: 6,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 20,
  },
  moonInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#08080F' },
  orbitDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#8B5CF6' },
  appName: { color: '#F1F5F9', fontSize: 30, fontWeight: '800', letterSpacing: 0.3, marginBottom: 6 },
  tagline: { color: '#64748B', fontSize: 13, letterSpacing: 0.5 },

  card: { backgroundColor: '#12121E', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#1E1E30' },

  tabRow: { flexDirection: 'row', backgroundColor: '#08080F', borderRadius: 12, padding: 3, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#1E1B4B' },
  tabTxt: { color: '#4B5563', fontSize: 13, fontWeight: '500' },
  tabTxtOn: { color: '#818CF8', fontWeight: '700' },

  modeRow: { flexDirection: 'row', backgroundColor: '#08080F', borderRadius: 10, padding: 3, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#1E1B4B' },
  modeTxt: { color: '#4B5563', fontSize: 13, fontWeight: '500' },
  modeTxtOn: { color: '#818CF8', fontWeight: '700' },

  oauthBlock: {},
  oauthBtn: {
    backgroundColor: '#1E1E30', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2E2E45',
  },
  oauthInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  oauthIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  oauthIcon: { fontWeight: '800', fontSize: 15, color: '#1a1a1a' },
  oauthTxt: { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },

  fieldWrap: { marginBottom: 14 },
  label: { color: '#64748B', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15,
  },
  inputOn: { borderColor: '#6366F1' },

  passphraseHint: { color: '#B45309', fontSize: 12, lineHeight: 17, marginBottom: 14, backgroundColor: '#1C1408', borderRadius: 10, padding: 12 },

  btn: { backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  hint: { color: '#374151', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 8 },
})
