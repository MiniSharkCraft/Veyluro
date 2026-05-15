import 'expo-standard-web-crypto'
import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, StatusBar, StyleSheet, SafeAreaView, Modal,
} from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import {
  generateRsaKeyPair, exportRsaKeyPair,
  importRsaPrivateKey, publicKeyFingerprint,
  encryptPrivateKeyWithPassphrase,
} from '../../src/lib/crypto'
import { ensureSignalReady, buildPublicSignalBundle } from '../../src/lib/signal'
import { API_BASE_URL } from '../../src/lib/runtimeConfig'

const API = API_BASE_URL
const localPublicKeyKey = (userId: string) => `publicKey_${userId}`
const authMethodKey = (userId: string) => `auth_method_${userId}`

type OAuthResult = { token: string; userId: string; username: string }
const MIN_RECOVERY_PASSPHRASE = 12

function isStrongRecoveryPassphrase(value: string) {
  return value.trim().length >= MIN_RECOVERY_PASSPHRASE
}

function mapOAuthError(code: string) {
  switch (code) {
    case 'google_not_configured':
      return 'Server chưa cấu hình Google OAuth. Cần set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và GOOGLE_REDIRECT_URI.'
    case 'cancelled':
      return 'Đăng nhập Google đã bị hủy.'
    case 'missing_state':
    case 'missing_state_cookie':
    case 'invalid_state':
    case 'expired_state':
      return 'Phiên Google OAuth không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.'
    case 'invalid_or_expired_code':
      return 'Mã đăng nhập Google đã hết hạn. Vui lòng thử lại.'
    default:
      return code
  }
}

function mapAuthErrorMessage(raw: string) {
  switch (raw) {
    case 'totp_required':
      return 'Tài khoản này đã bật 2FA. Nhập mã OTP 6 số để đăng nhập.'
    case 'totp_invalid':
      return 'Mã OTP 2FA không đúng.'
    default:
      return raw
  }
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function responseErrorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    return (body as { error?: string; message?: string }).error
      ?? (body as { error?: string; message?: string }).message
      ?? `Server ${status}`
  }
  if (typeof body === 'string' && body.trim().startsWith('<')) {
    return `Server trả về HTML thay vì JSON (${status}). Kiểm tra lại API URL/reverse proxy.`
  }
  return typeof body === 'string' && body.trim() ? body : `Server ${status}`
}

async function setupAndSaveKey(userId: string, token: string, passphrase?: string) {
  await ensureSignalReady(userId)
  const signalBundle = buildPublicSignalBundle()
  const existing = await SecureStore.getItemAsync(`privateKey_${userId}`)
  if (existing) {
    const localPublicKey = await SecureStore.getItemAsync(localPublicKeyKey(userId))
    if (localPublicKey) {
      const fingerprint = await publicKeyFingerprint(localPublicKey)
      await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicKey: localPublicKey, fingerprint, signalBundle }),
      })
    }
    if (!localPublicKey) {
      await fetch(`${API}/api/auth/register-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signalBundle }),
      })
    }
    return
  }

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

  if (passphrase) {
    const { encryptedKey, keySalt } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
    await fetch(`${API}/api/auth/store-encrypted-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ encryptedKey, keySalt }),
    })
  }
}

type Screen = 'main' | 'forgotPassword' | 'forgotUsername'

export default function LoginScreen() {
  const [tab,    setTab]    = useState<'oauth' | 'password'>('oauth')
  const [mode,   setMode]   = useState<'login' | 'register'>('login')
  const [screen, setScreen] = useState<Screen>('main')

  const [username,          setUsername]          = useState('')
  const [email,             setEmail]             = useState('')
  const [password,          setPassword]          = useState('')
  const [totpCode,          setTotpCode]          = useState('')
  const [passphrase,        setPassphrase]        = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')

  const [fpEmail,   setFpEmail]   = useState('')
  const [fpOtp,     setFpOtp]     = useState('')
  const [fpNewPass, setFpNewPass] = useState('')
  const [fpStep,    setFpStep]    = useState<'email' | 'otp'>('email')

  const [loading, setLoading] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [pendingOAuth, setPendingOAuth] = useState<OAuthResult | null>(null)
  const [showAuthChoice, setShowAuthChoice] = useState(false)

  const isLoading = loading !== null

  const setupPasskey = async (userId: string) => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    if (!hasHardware) throw new Error('Thiết bị không hỗ trợ Passkey sinh trắc')
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    if (!enrolled) throw new Error('Máy chưa cài FaceID/vân tay/PIN khóa màn hình')
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Xác nhận tạo Passkey cho tài khoản này',
      cancelLabel: 'Hủy',
      disableDeviceFallback: false,
    })
    if (!result.success) throw new Error('Không xác thực được passkey trên thiết bị')
    await SecureStore.setItemAsync(authMethodKey(userId), 'passkey')
  }

  const completeGoogleLogin = async (oauth: OAuthResult, method: 'passkey' | 'pin') => {
    setLoading('google')
    try {
      if (method === 'passkey') {
        await setupPasskey(oauth.userId)
      } else {
        await SecureStore.setItemAsync(authMethodKey(oauth.userId), 'pin')
      }

      await setupAndSaveKey(oauth.userId, oauth.token, passphrase || undefined)
      await Promise.all([
        SecureStore.setItemAsync('veyluro_userId', oauth.userId),
        SecureStore.setItemAsync('veyluro_username', oauth.username ?? ''),
        SecureStore.setItemAsync('veyluro_token', oauth.token),
      ])
      setShowAuthChoice(false)
      setPendingOAuth(null)
      router.replace('/(app)/(tabs)')
    } catch (err: unknown) {
      Alert.alert('Lỗi bảo mật', err instanceof Error ? err.message : 'Không hoàn tất được thiết lập bảo mật')
    } finally {
      setLoading(null)
    }
  }

  useEffect(() => {
    let alive = true

    async function redirectExistingSession() {
      try {
        const [token, userId] = await Promise.all([
          SecureStore.getItemAsync('veyluro_token'),
          SecureStore.getItemAsync('veyluro_userId'),
        ])
        if (!alive || !token || !userId) return

        const authMethod = await SecureStore.getItemAsync(authMethodKey(userId))
        if (authMethod === 'passkey') {
          const verify = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Mở khóa bằng Passkey',
            cancelLabel: 'Hủy',
            disableDeviceFallback: false,
          })
          if (!verify.success) return
        }

        const privateKey = await SecureStore.getItemAsync(`privateKey_${userId}`)
        if (!alive) return
        router.replace(privateKey ? '/(app)/(tabs)' : '/(auth)/recover-key')
      } catch (err) {
        console.warn('[session] login guard failed:', err)
      }
    }

    redirectExistingSession()
    return () => {
      alive = false
    }
  }, [])

  // ── Google OAuth (server-side) ───────────────────────────────────────────
  const handleGoogle = async () => {
    if (mode === 'register' && passphrase !== confirmPassphrase) {
      Alert.alert('Lỗi', 'Passphrase không khớp'); return
    }
    if (mode === 'register' && !isStrongRecoveryPassphrase(passphrase)) {
      Alert.alert('Passphrase yếu', `Passphrase khôi phục phải tối thiểu ${MIN_RECOVERY_PASSPHRASE} ký tự.`); return
    }
    setLoading('google')
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${API}/api/auth/google/start`,
        'veyluro://auth'
      )
      if (result.type !== 'success') { setLoading(null); return }
      const { queryParams } = Linking.parse(result.url)
      if (!queryParams) { setLoading(null); return }
      if (queryParams.error) throw new Error(mapOAuthError(String(queryParams.error)))
      const code = String((queryParams as Record<string, string>).code ?? '').trim()
      if (!code) throw new Error('Thiếu mã xác thực Google')
      const exchangeRes = await fetch(`${API}/api/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const exchangeBody = await parseResponseBody(exchangeRes)
      if (!exchangeRes.ok) {
        throw new Error(mapOAuthError(responseErrorMessage(exchangeBody, exchangeRes.status)))
      }
      const oauth = exchangeBody as OAuthResult
      if (!oauth?.token || !oauth?.userId) {
        throw new Error('Phản hồi OAuth không hợp lệ')
      }
      setPendingOAuth({ token: oauth.token, userId: oauth.userId, username: oauth.username ?? '' })
      setShowAuthChoice(true)
    } catch (err: unknown) {
      Alert.alert('Lỗi Google', err instanceof Error ? err.message : 'Thất bại')
    } finally { setLoading(null) }
  }

  // ── Password register/login ──────────────────────────────────────────────────
  const handlePassword = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Thiếu thông tin', 'Điền đủ username và mật khẩu nha.'); return
    }
    if (mode === 'register') {
      if (!email.trim()) { Alert.alert('Thiếu email'); return }
      if (!isStrongRecoveryPassphrase(passphrase)) {
        Alert.alert('Passphrase yếu', `Passphrase khôi phục phải tối thiểu ${MIN_RECOVERY_PASSPHRASE} ký tự`)
        return
      }
      if (passphrase !== confirmPassphrase) { Alert.alert('Lỗi', 'Passphrase không khớp'); return }
    }
    setLoading('password')
    try {
      if (mode === 'register') {
        const kp = await generateRsaKeyPair()
        const { publicKey, privateKey } = await exportRsaKeyPair(kp)
        const fingerprint = await publicKeyFingerprint(publicKey)
        const res = await fetch(`${API}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), email: email.trim(), password, publicKey, fingerprint }),
        })
        if (!res.ok) {
          const body = await parseResponseBody(res)
          console.error('[register error]', body)
          throw new Error(responseErrorMessage(body, res.status))
        }
        const data = await parseResponseBody(res) as { token: string; userId: string; username: string }
        await SecureStore.setItemAsync(`privateKey_${data.userId}`, privateKey)
        await SecureStore.setItemAsync(localPublicKeyKey(data.userId), publicKey)
        const keyRes = await fetch(`${API}/api/auth/register-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ publicKey, fingerprint }),
        })
        if (!keyRes.ok) {
          const body = await parseResponseBody(keyRes)
          throw new Error(responseErrorMessage(body, keyRes.status))
        }
        const { encryptedKey, keySalt } = await encryptPrivateKeyWithPassphrase(privateKey, passphrase)
        await fetch(`${API}/api/auth/store-encrypted-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ encryptedKey, keySalt }),
        })
        await Promise.all([
          SecureStore.setItemAsync('veyluro_userId', data.userId),
          SecureStore.setItemAsync('veyluro_username', data.username),
          SecureStore.setItemAsync('veyluro_token', data.token),
        ])
      } else {
        const res = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            password,
            ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
          }),
        })
        if (!res.ok) {
          const body = await parseResponseBody(res)
          console.error('[login error]', body)
          throw new Error(mapAuthErrorMessage(responseErrorMessage(body, res.status)))
        }
        const data = await parseResponseBody(res) as {
          token: string
          userId: string
          id: string
          username: string
          publicKey?: string
        }
        const uid = data.userId ?? data.id
        const pk = await SecureStore.getItemAsync(`privateKey_${uid}`)
        const localPublicKey = await SecureStore.getItemAsync(localPublicKeyKey(uid))
        await Promise.all([
          SecureStore.setItemAsync('veyluro_userId', uid),
          SecureStore.setItemAsync('veyluro_username', data.username),
          SecureStore.setItemAsync('veyluro_token', data.token),
          data.publicKey ? SecureStore.setItemAsync(localPublicKeyKey(uid), data.publicKey) : Promise.resolve(),
        ])
        if (!pk) {
          router.replace('/(auth)/recover-key'); return
        }
        await importRsaPrivateKey(pk)
        if (localPublicKey) {
          const fingerprint = await publicKeyFingerprint(localPublicKey)
          await fetch(`${API}/api/auth/register-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
            body: JSON.stringify({ publicKey: localPublicKey, fingerprint }),
          })
        }
      }
      router.replace('/(app)/(tabs)')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Có gì đó sai sai')
    } finally { setLoading(null) }
  }

  // ── Forgot username ──────────────────────────────────────────────────────────
  const handleForgotUsername = async () => {
    if (!fpEmail.trim()) { Alert.alert('Nhập email'); return }
    setLoading('fp')
    try {
      const res = await fetch(`${API}/api/auth/forgot-username`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail.trim() }),
      })
      if (!res.ok) {
        const body = await parseResponseBody(res)
        throw new Error(responseErrorMessage(body, res.status))
      }
      Alert.alert('Đã gửi', 'Kiểm tra email — username được gửi về hộp thư của bạn')
      setScreen('main')
      setFpEmail('')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không gửi được')
    } finally { setLoading(null) }
  }

  // ── Forgot password ──────────────────────────────────────────────────────────
  const handleForgotSendOTP = async () => {
    if (!fpEmail.trim()) { Alert.alert('Nhập email'); return }
    setLoading('fp')
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail.trim() }),
      })
      if (!res.ok) {
        const body = await parseResponseBody(res)
        throw new Error(responseErrorMessage(body, res.status))
      }
      setFpStep('otp')
      Alert.alert('Đã gửi', 'Kiểm tra email lấy mã OTP (10 phút)')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không gửi được OTP')
    } finally { setLoading(null) }
  }

  const handleForgotReset = async () => {
    if (!fpOtp.trim() || !fpNewPass.trim()) { Alert.alert('Điền đủ thông tin'); return }
    setLoading('fp')
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail, otp: fpOtp, password: fpNewPass }),
      })
      if (!res.ok) {
        const body = await parseResponseBody(res)
        throw new Error(responseErrorMessage(body, res.status))
      }
      Alert.alert('Thành công', 'Mật khẩu đã được đặt lại')
      setScreen('main'); setFpStep('email'); setFpEmail(''); setFpOtp(''); setFpNewPass('')
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'OTP sai hoặc hết hạn')
    } finally { setLoading(null) }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'forgotUsername') {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#08080F" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => setScreen('main')} style={{ marginBottom: 24 }}>
              <Text style={{ color: '#20C7B3', fontSize: 15 }}>‹ Quay lại</Text>
            </TouchableOpacity>
            <Text style={[s.appName, { marginBottom: 8 }]}>Quên username?</Text>
            <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 24 }}>Nhập email đăng ký — username sẽ được gửi về hộp thư.</Text>
            <Field label="Email đăng ký" value={fpEmail} onChange={setFpEmail}
              placeholder="email@example.com" focused={focused} focusKey="fpu"
              onFocus={() => setFocused('fpu')} onBlur={() => setFocused(null)} keyboardType="email-address" />
            <Btn label="Gửi username về email" onPress={handleForgotUsername} loading={loading === 'fp'} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  if (screen === 'forgotPassword') {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#08080F" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => setScreen('main')} style={{ marginBottom: 24 }}>
              <Text style={{ color: '#20C7B3', fontSize: 15 }}>‹ Quay lại</Text>
            </TouchableOpacity>
            <Text style={[s.appName, { marginBottom: 24 }]}>Quên mật khẩu</Text>
            {fpStep === 'email' ? (
              <>
                <Field label="Email đăng ký" value={fpEmail} onChange={setFpEmail}
                  placeholder="email@example.com" focused={focused} focusKey="fpe"
                  onFocus={() => setFocused('fpe')} onBlur={() => setFocused(null)} keyboardType="email-address" />
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
            <Text style={s.appName}>Veyluro</Text>
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

            {/* Mode */}
            <View style={s.modeRow}>
              {(['login', 'register'] as const).map(m => (
                <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.modeBtn, mode === m && s.modeBtnOn]}>
                  <Text style={[s.modeTxt, mode === m && s.modeTxtOn]}>
                    {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'oauth' ? (
              <View>
                {mode === 'register' && (
                  <>
                    <Field label="Recovery passphrase" value={passphrase} onChange={setPassphrase}
                      placeholder={`ít nhất ${MIN_RECOVERY_PASSPHRASE} ký tự...`} focused={focused} focusKey="pp"
                      onFocus={() => setFocused('pp')} onBlur={() => setFocused(null)} secure />
                    <Field label="Xác nhận passphrase" value={confirmPassphrase} onChange={setConfirmPassphrase}
                      placeholder="nhập lại passphrase..." focused={focused} focusKey="cpp"
                      onFocus={() => setFocused('cpp')} onBlur={() => setFocused(null)} secure />
                    <Text style={s.passphraseHint}>Passphrase khôi phục khóa E2EE phải đủ mạnh (tối thiểu 12 ký tự).</Text>
                  </>
                )}
                <TouchableOpacity style={[s.oauthBtn, isLoading && { opacity: 0.6 }]} onPress={handleGoogle} disabled={isLoading} activeOpacity={0.85}>
                  {loading === 'google'
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <View style={s.oauthInner}>
                        <View style={s.oauthIconWrap}><Text style={s.oauthIcon}>G</Text></View>
                        <Text style={s.oauthTxt}>Tiếp tục với Google</Text>
                      </View>
                    )}
                </TouchableOpacity>
                <Text style={s.hint}>Khóa mã hóa được tạo ngay trên thiết bị.</Text>
              </View>
            ) : (
              <View>
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
                {mode === 'login' && (
                  <Field label="Mã OTP 2FA (nếu có)" value={totpCode} onChange={t => setTotpCode(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456" focused={focused} focusKey="totp"
                    onFocus={() => setFocused('totp')} onBlur={() => setFocused(null)} keyboardType="numeric" />
                )}
                {mode === 'register' && (
                  <>
                    <Field label="Recovery passphrase" value={passphrase} onChange={setPassphrase}
                      placeholder={`ít nhất ${MIN_RECOVERY_PASSPHRASE} ký tự...`} focused={focused} focusKey="pp"
                      onFocus={() => setFocused('pp')} onBlur={() => setFocused(null)} secure />
                    <Field label="Xác nhận passphrase" value={confirmPassphrase} onChange={setConfirmPassphrase}
                      placeholder="nhập lại passphrase..." focused={focused} focusKey="cpp"
                      onFocus={() => setFocused('cpp')} onBlur={() => setFocused(null)} secure />
                    <Text style={s.passphraseHint}>Passphrase bảo vệ backup khóa E2EE. Quên passphrase sẽ không khôi phục được key cũ.</Text>
                  </>
                )}
                <TouchableOpacity style={[s.btn, isLoading && { opacity: 0.6 }]} onPress={handlePassword} disabled={isLoading} activeOpacity={0.85}>
                  {loading === 'password'
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnTxt}>{mode === 'login' ? 'Đăng nhập →' : 'Tạo tài khoản →'}</Text>
                  }
                </TouchableOpacity>
                {mode === 'login' && (
                  <View style={{ marginTop: 16, alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => setScreen('forgotPassword')}>
                      <Text style={{ color: '#0FA79A', fontSize: 13 }}>Quên mật khẩu?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setFpEmail(''); setScreen('forgotUsername') }}>
                      <Text style={{ color: '#6D8298', fontSize: 13 }}>Quên username?</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showAuthChoice} transparent animationType="fade">
        <View style={s.choiceBackdrop}>
          <View style={s.choiceCard}>
            <Text style={s.choiceTitle}>Chọn bảo mật đăng nhập</Text>
            <Text style={s.choiceSub}>Tài khoản Google này sẽ dùng 1 trong 2 cách để mở app lần sau.</Text>

            <TouchableOpacity
              style={s.choiceBtn}
              onPress={() => pendingOAuth && completeGoogleLogin(pendingOAuth, 'passkey')}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <Text style={s.choiceBtnTitle}>Passkey thiết bị</Text>
              <Text style={s.choiceBtnSub}>FaceID / Vân tay / PIN máy (khuyên dùng)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.choiceBtn}
              onPress={() => pendingOAuth && completeGoogleLogin(pendingOAuth, 'pin')}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <Text style={s.choiceBtnTitle}>Mật khẩu / PIN app</Text>
              <Text style={s.choiceBtnSub}>Dùng luồng PIN backup đang có</Text>
            </TouchableOpacity>

            {isLoading ? <ActivityIndicator color="#14B8A6" style={{ marginTop: 8 }} /> : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────
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
  root:       { flex: 1, backgroundColor: '#08080F' },
  scroll:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 36 },
  hero:       { alignItems: 'center', marginBottom: 36 },
  moonWrap:   { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  moonOuter:  { width: 60, height: 60, borderRadius: 30, backgroundColor: '#0FA79A', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 6, shadowColor: '#20C7B3', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 20 },
  moonInner:  { width: 40, height: 40, borderRadius: 20, backgroundColor: '#08080F' },
  orbitDot:   { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#20C7B3' },
  appName:    { color: '#F1F5F9', fontSize: 30, fontWeight: '800', letterSpacing: 0.3, marginBottom: 6 },
  tagline:    { color: '#64748B', fontSize: 13, letterSpacing: 0.5 },
  card:       { backgroundColor: '#102131', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#1B2F43' },
  tabRow:     { flexDirection: 'row', backgroundColor: '#08080F', borderRadius: 12, padding: 3, marginBottom: 20 },
  tab:        { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabOn:      { backgroundColor: '#133149' },
  tabTxt:     { color: '#6D8298', fontSize: 13, fontWeight: '500' },
  tabTxtOn:   { color: '#20C7B3', fontWeight: '700' },
  modeRow:    { flexDirection: 'row', backgroundColor: '#08080F', borderRadius: 10, padding: 3, marginBottom: 16 },
  modeBtn:    { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  modeBtnOn:  { backgroundColor: '#133149' },
  modeTxt:    { color: '#6D8298', fontSize: 13, fontWeight: '500' },
  modeTxtOn:  { color: '#20C7B3', fontWeight: '700' },
  oauthBtn:   { backgroundColor: '#1B2F43', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2E2E45' },
  oauthInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  oauthIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  oauthIcon:  { fontWeight: '800', fontSize: 15, color: '#1a1a1a' },
  oauthTxt:   { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
  fieldWrap:  { marginBottom: 14 },
  label:      { color: '#64748B', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  input:      { backgroundColor: '#0B1724', borderWidth: 1.5, borderColor: '#1B2F43', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15 },
  inputOn:    { borderColor: '#0FA79A' },
  passphraseHint: { color: '#B45309', fontSize: 12, lineHeight: 17, marginBottom: 14, backgroundColor: '#1C1408', borderRadius: 10, padding: 12 },
  btn:        { backgroundColor: '#0FA79A', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnTxt:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint:       { color: '#4E677F', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 8 },
  choiceBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  choiceCard: { width: '100%', maxWidth: 380, backgroundColor: '#101A27', borderWidth: 1, borderColor: '#1F2D3D', borderRadius: 16, padding: 16 },
  choiceTitle: { color: '#E2F7F4', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  choiceSub: { color: '#8FA2B7', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  choiceBtn: { backgroundColor: '#142334', borderWidth: 1, borderColor: '#22374F', borderRadius: 12, padding: 12, marginBottom: 10 },
  choiceBtnTitle: { color: '#E6F1FF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  choiceBtnSub: { color: '#8FA2B7', fontSize: 12 },
})
