import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar,
  ScrollView, TextInput, Alert, Modal, ActivityIndicator, Share,
  Image, Linking,
} from 'react-native'
import { router } from 'expo-router'
import { useState, useEffect } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as Application from 'expo-application'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CameraIcon,
  CaretRightIcon,
  KeyIcon,
  LinkIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  ShieldStarIcon,
  SignOutIcon,
  TrashIcon,
  UserIcon,
  type Icon,
} from 'phosphor-react-native'
import { usersApi, blocksApi, type ProfileType, type BlockedUserType } from '../../src/lib/api'
import { storage } from '../../src/lib/storage'
import { decideUpdate, fetchUpdateInfo, type UpdateDecision } from '../../src/lib/update'

const UPDATE_SKIP_KEY = 'amoon_skip_update_version'

function getCurrentAppVersion(): string {
  if (Constants.appOwnership === 'expo') {
    return (Constants.expoConfig as any)?.version ?? '0.0.0'
  }
  return Application.nativeApplicationVersion ?? (Constants.expoConfig as any)?.version ?? '0.0.0'
}

export default function SettingsScreen() {
  const [profile,     setProfile]     = useState<ProfileType | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [editModal,   setEditModal]   = useState(false)
  const [totpModal,   setTotpModal]   = useState(false)
  const [inviteLink,  setInviteLink]  = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)

  // Edit fields
  const [newUsername,    setNewUsername]    = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newBio,         setNewBio]         = useState('')
  const [editLoading,    setEditLoading]    = useState(false)

  // TOTP
  const [blocked,     setBlocked]     = useState<BlockedUserType[]>([])
  const [blockedModal, setBlockedModal] = useState(false)
  const [totpStep,    setTotpStep]    = useState<'setup' | 'verify' | 'disable'>('setup')
  const [totpSecret,  setTotpSecret]  = useState('')
  const [totpUrl,     setTotpUrl]     = useState('')
  const [totpCode,    setTotpCode]    = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDecision, setUpdateDecision] = useState<UpdateDecision | null>(null)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const p = await usersApi.me()
      setProfile(p)
      setNewUsername(p.username)
      setNewDisplayName(p.displayName ?? '')
      setNewBio(p.bio ?? '')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    blocksApi.list().then(setBlocked).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const runAutoCheck = async () => {
      try {
        const currentVersion = getCurrentAppVersion()
        const info = await fetchUpdateInfo()
        if (!info || cancelled) return
        const decision = decideUpdate(currentVersion, info)
        if (!decision.hasUpdate || cancelled) return
        const skippedVersion = await SecureStore.getItemAsync(UPDATE_SKIP_KEY)
        if (decision.canSkip && skippedVersion === decision.latestVersion) return
        setUpdateDecision(decision)
        setUpdateModalVisible(true)
      } catch {
        // Silent for auto-check.
      }
    }
    runAutoCheck()
    return () => { cancelled = true }
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateChecking(true)
    try {
      const currentVersion = getCurrentAppVersion()
      const info = await fetchUpdateInfo()
      if (!info) {
        Alert.alert('Không kiểm tra được', 'Không lấy được thông tin phiên bản mới.')
        return
      }
      const decision = decideUpdate(currentVersion, info)
      if (!decision.hasUpdate) {
        Alert.alert('Đang mới nhất', `${currentVersion} đã là bản mới nhất.`)
        return
      }
      setUpdateDecision(decision)
      setUpdateModalVisible(true)
    } catch {
      Alert.alert('Lỗi', 'Không thể kiểm tra cập nhật lúc này.')
    } finally {
      setUpdateChecking(false)
    }
  }

  const handleOpenUpdate = async () => {
    if (!updateDecision?.downloadUrl) return
    try {
      await Linking.openURL(updateDecision.downloadUrl)
    } catch {
      Alert.alert('Lỗi', 'Không mở được link cập nhật.')
    }
  }

  const handleSkipUpdate = async () => {
    if (!updateDecision?.canSkip) return
    try {
      await SecureStore.setItemAsync(UPDATE_SKIP_KEY, updateDecision.latestVersion)
    } catch {
      // ignore
    }
    setUpdateModalVisible(false)
  }

  const handleSaveProfile = async () => {
    setEditLoading(true)
    try {
      const updates: { username?: string; displayName?: string; bio?: string } = {}
      if (newUsername.trim() !== profile?.username) updates.username = newUsername.trim()
      if (newDisplayName.trim() !== (profile?.displayName ?? '')) updates.displayName = newDisplayName.trim()
      if (newBio.trim() !== (profile?.bio ?? '')) updates.bio = newBio.trim()
      if (Object.keys(updates).length === 0) { setEditModal(false); return }
      const res = await usersApi.updateProfile(updates)
      if (updates.username) {
        const nextUsername = res.username ?? updates.username
        const nextToken = res.token ?? (await storage.getToken()) ?? ''
        await storage.setSession(profile!.id, nextUsername, nextToken)
      }
      await load()
      setEditModal(false)
      Alert.alert('Đã lưu', 'Thông tin cá nhân đã được cập nhật')
    } catch (e: unknown) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không lưu được')
    } finally { setEditLoading(false) }
  }

  const handlePickAvatar = async () => {
    if (avatarLoading) return
    setAvatarLoading(true)
    try {
      console.log('[avatar] picker open')
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      console.log('[avatar] media permission', perm)
      if (!perm.granted) {
        Alert.alert('Thiếu quyền', 'Cho phép truy cập ảnh để đổi avatar nha.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      })
      console.log('[avatar] picker result', result)
      if (result.canceled || !result.assets?.[0]) {
        console.log('[avatar] picker canceled or empty')
        return
      }

      const asset = result.assets[0]
      if (asset.fileSize && asset.fileSize > 25 * 1024 * 1024) {
        Alert.alert('Ảnh quá lớn', 'Avatar tối đa 25MB.')
        return
      }

      const type = asset.mimeType ?? guessImageType(asset.uri)
      const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
      console.log('[avatar] picked', {
        uri: asset.uri,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      })
      const uploaded = await usersApi.uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? `avatar.${ext}`,
        type,
      })
      setProfile(p => p ? { ...p, avatarUrl: uploaded.avatarUrl, avatarThumbUrl: uploaded.avatarThumbUrl } : p)
      await load()
      Alert.alert('Đã cập nhật', 'Ảnh đại diện đã được upload lên server.')
    } catch (e: unknown) {
      console.warn('[avatar] upload error', e)
      Alert.alert('Lỗi avatar', e instanceof Error ? e.message : 'Upload ảnh thất bại')
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleDeleteAvatar = async () => {
    if (!profile?.avatarUrl || avatarLoading) return
    Alert.alert('Xóa avatar?', 'Ảnh đại diện hiện tại sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive',
        onPress: async () => {
          setAvatarLoading(true)
          try {
            await usersApi.deleteAvatar()
            setProfile(p => p ? { ...p, avatarUrl: undefined, avatarThumbUrl: undefined } : p)
            await load()
          } catch (e: unknown) {
            Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không xóa được avatar')
          } finally {
            setAvatarLoading(false)
          }
        },
      },
    ])
  }

  const handleGetInviteLink = async () => {
    try {
      const res = await usersApi.inviteLink()
      setInviteLink(res.link)
      setInviteToken(res.token)
    } catch { Alert.alert('Lỗi', 'Không tạo được link') }
  }

  const handleCopyInvite = async () => {
    if (!inviteLink) return
    try { await Share.share({ message: inviteLink }) } catch { /* ignore */ }
  }

  const handleShareInvite = async () => {
    if (!inviteLink) return
    try { await Share.share({ message: `Kết bạn với tôi trên AMoon Eclipse: ${inviteLink}` }) }
    catch { /* ignore */ }
  }

  const handleTotpSetup = async () => {
    setTotpLoading(true)
    try {
      const res = await usersApi.totpSetup()
      setTotpSecret(res.secret)
      setTotpUrl(res.url)
      setTotpStep('verify')
    } catch { Alert.alert('Lỗi', 'Không setup được 2FA') }
    finally { setTotpLoading(false) }
  }

  const handleTotpVerify = async () => {
    if (!/^\d{6}$/.test(totpCode)) { Alert.alert('Mã không hợp lệ', 'Nhập đúng 6 chữ số'); return }
    setTotpLoading(true)
    try {
      await usersApi.totpVerify(totpCode)
      await load()
      setTotpModal(false)
      setTotpCode('')
      Alert.alert('2FA đã bật', 'Tài khoản của bạn được bảo vệ bởi xác thực 2 bước')
    } catch (e: unknown) {
      Alert.alert('Sai mã', e instanceof Error ? e.message : 'Mã không đúng')
    } finally { setTotpLoading(false) }
  }

  const handleTotpDisable = async () => {
    if (!/^\d{6}$/.test(totpCode)) { Alert.alert('Mã không hợp lệ', 'Nhập đúng 6 chữ số'); return }
    setTotpLoading(true)
    try {
      await usersApi.totpDisable(totpCode)
      await load()
      setTotpModal(false)
      setTotpCode('')
      Alert.alert('2FA đã tắt')
    } catch (e: unknown) {
      Alert.alert('Sai mã', e instanceof Error ? e.message : 'Mã không đúng')
    } finally { setTotpLoading(false) }
  }

  const handleLogout = () => {
    Alert.alert('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại. Tin nhắn vẫn an toàn.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất', style: 'destructive',
        onPress: async () => { await storage.clear(); router.replace('/(auth)/login') },
      },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Xóa tài khoản?',
      'Thao tác này không thể hoàn tác. Tài khoản và dữ liệu liên quan sẽ bị xóa.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tài khoản',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Xác nhận lần cuối',
              'Bạn chắc chắn muốn xóa vĩnh viễn tài khoản này?',
              [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Xóa vĩnh viễn',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await usersApi.deleteAccount()
                      await storage.clear()
                      router.replace('/(auth)/login')
                    } catch (e: unknown) {
                      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không xóa được tài khoản')
                    }
                  },
                },
              ]
            )
          },
        },
      ]
    )
  }

  if (loading) return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366F1" />
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#08080F" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeftIcon size={23} color="#A5B4FC" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cài đặt</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={s.profileCard}>
          <TouchableOpacity style={s.avatarPress} onPress={handlePickAvatar} activeOpacity={0.82}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarThumbUrl || profile.avatarUrl, cache: 'force-cache' }} style={s.bigAvatarImg} />
            ) : (
              <View style={[s.bigAvatar, { backgroundColor: '#1E1B4B' }]}>
                <Text style={s.bigAvatarTxt}>{(profile?.displayName ?? profile?.username ?? '?')[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View style={s.avatarEditBadge}>
              {avatarLoading ? <ActivityIndicator color="#fff" size="small" /> : <CameraIcon size={15} color="#fff" weight="bold" />}
            </View>
          </TouchableOpacity>
          <Text style={s.displayName}>{profile?.displayName || profile?.username}</Text>
          {profile?.displayName && <Text style={s.usernameLabel}>@{profile.username}</Text>}
          {profile?.bio && <Text style={s.bioTxt}>{profile.bio}</Text>}
          <TouchableOpacity style={s.editProfileBtn} onPress={() => setEditModal(true)}>
            <Text style={s.editProfileTxt}>Chỉnh sửa hồ sơ</Text>
          </TouchableOpacity>
          {profile?.avatarUrl && (
            <TouchableOpacity style={s.deleteAvatarBtn} onPress={handleDeleteAvatar}>
              <TrashIcon size={14} color="#EF4444" weight="bold" />
              <Text style={s.deleteAvatarTxt}>Xóa ảnh đại diện</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite link section */}
        <SectionTitle title="Kết bạn" />
        <View style={s.section}>
          <SettingRow
            icon={UserIcon}
            label="Username của bạn"
            value={`@${profile?.username}`}
            onPress={async () => {
              try { await Share.share({ message: profile?.username ?? '' }) } catch { /* ignore */ }
            }}
          />
          {inviteLink ? (
            <View style={s.inviteLinkBox}>
              <Text style={s.inviteLinkLabel}>Link kết bạn của bạn:</Text>
              <Text style={s.inviteLinkTxt} numberOfLines={1}>{inviteLink}</Text>
              <View style={s.inviteBtnRow}>
                <TouchableOpacity style={s.inviteActionBtn} onPress={handleCopyInvite}>
                  <Text style={s.inviteActionTxt}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.inviteActionBtn, { backgroundColor: '#1E1B4B' }]} onPress={handleShareInvite}>
                  <Text style={[s.inviteActionTxt, { color: '#818CF8' }]}>Chia sẻ</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <SettingRow icon={LinkIcon} label="Tạo link kết bạn" onPress={handleGetInviteLink} chevron />
          )}
        </View>

        {/* Security section */}
        <SectionTitle title="Bảo mật" />
        <View style={s.section}>
          <SettingRow
            icon={ShieldCheckIcon}
            label="Xác thực 2 bước (2FA)"
            value={profile?.totpEnabled ? 'Đang bật' : 'Tắt'}
            valueStyle={profile?.totpEnabled ? s.valueOn : s.valueOff}
            onPress={() => {
              setTotpStep(profile?.totpEnabled ? 'disable' : 'setup')
              setTotpCode('')
              setTotpModal(true)
            }}
            chevron
          />
          <SettingRow
            icon={KeyIcon}
            label="Khôi phục khóa E2EE"
            value="Dùng PIN 6 số"
            onPress={() => router.push('/(auth)/recover-key')}
            chevron
          />
          <SettingRow
            icon={ArrowsClockwiseIcon}
            label="Kiểm tra cập nhật"
            value={updateChecking ? 'Đang kiểm tra...' : undefined}
            onPress={handleCheckUpdate}
            chevron
          />
        </View>

        {/* Blocked users */}
        <SectionTitle title="Người dùng bị chặn" />
        <View style={s.section}>
          <SettingRow
            icon={ProhibitIcon}
            label="Đang chặn"
            value={blocked.length > 0 ? `${blocked.length} người` : 'Không có ai'}
            onPress={() => setBlockedModal(true)}
            chevron
          />
        </View>

        {/* Admin section */}
        {profile?.isAdmin && (
          <>
            <SectionTitle title="Quản trị viên" />
            <View style={s.section}>
              <SettingRow
                icon={ShieldStarIcon}
                label="Xem báo cáo vi phạm"
                onPress={() => router.push('/(app)/admin' as any)}
                chevron
              />
            </View>
          </>
        )}

        {/* Danger zone */}
        <SectionTitle title="Tài khoản" />
        <View style={s.section}>
          <TouchableOpacity style={s.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
            <SignOutIcon size={20} color="#EF4444" weight="bold" style={s.logoutIco} />
            <Text style={s.logoutTxt}>Đăng xuất</Text>
          </TouchableOpacity>
          <View style={s.rowDivider} />
          <TouchableOpacity style={s.logoutRow} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <TrashIcon size={20} color="#EF4444" weight="bold" style={s.logoutIco} />
            <Text style={s.logoutTxt}>Xóa tài khoản</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.versionTxt}>AMoon Eclipse · E2EE Messaging</Text>

      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>Chỉnh sửa hồ sơ</Text>
            <View style={m.field}>
              <Text style={m.label}>Tên hiển thị</Text>
              <TextInput style={m.input} value={newDisplayName} onChangeText={setNewDisplayName}
                placeholder="Tên hiển thị..." placeholderTextColor="#2E2E45" />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Username</Text>
              <TextInput style={m.input} value={newUsername} onChangeText={setNewUsername}
                placeholder="username..." placeholderTextColor="#2E2E45" autoCapitalize="none" />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Bio (tối đa 200 ký tự)</Text>
              <TextInput style={[m.input, { height: 80, textAlignVertical: 'top' }]}
                value={newBio} onChangeText={setNewBio}
                placeholder="Giới thiệu bản thân..." placeholderTextColor="#2E2E45"
                multiline maxLength={200} />
            </View>
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancel} onPress={() => setEditModal(false)}>
                <Text style={m.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={m.confirm} onPress={handleSaveProfile} disabled={editLoading}>
                {editLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.confirmTxt}>Lưu</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Blocked Users Modal */}
      <Modal visible={blockedModal} transparent animationType="slide" onRequestClose={() => setBlockedModal(false)}>
        <View style={m.overlay}>
          <View style={[m.sheet, { maxHeight: '70%' }]}>
            <View style={m.handle} />
            <Text style={m.title}>Người dùng bị chặn</Text>
            {blocked.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', marginVertical: 20 }}>Không có ai trong danh sách chặn</Text>
            ) : (
              blocked.map(b => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#12121E' }}>
                  <Text style={{ flex: 1, color: '#F1F5F9', fontSize: 15 }}>@{b.username}</Text>
                  <TouchableOpacity
                    style={{ backgroundColor: '#12121E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#2E2E45' }}
                    onPress={() => {
                      Alert.alert('Bỏ chặn', `Bỏ chặn @${b.username}?`, [
                        { text: 'Hủy', style: 'cancel' },
                        { text: 'Bỏ chặn', onPress: async () => {
                          try {
                            await blocksApi.unblock(b.id)
                            setBlocked(prev => prev.filter(x => x.id !== b.id))
                          } catch { Alert.alert('Lỗi', 'Không bỏ chặn được') }
                        }},
                      ])
                    }}
                  >
                    <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Bỏ chặn</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity style={[m.cancel, { marginTop: 16 }]} onPress={() => setBlockedModal(false)}>
              <Text style={m.cancelTxt}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TOTP Modal */}
      <Modal visible={totpModal} transparent animationType="slide" onRequestClose={() => setTotpModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            {totpStep === 'setup' && (
              <>
                <Text style={m.title}>Bật xác thực 2 bước</Text>
                <Text style={m.desc}>Dùng Google Authenticator hoặc app TOTP để quét mã QR và bảo vệ tài khoản.</Text>
                <TouchableOpacity style={m.confirm} onPress={handleTotpSetup} disabled={totpLoading}>
                  {totpLoading ? <ActivityIndicator color="#fff" /> : <Text style={m.confirmTxt}>Tạo mã QR →</Text>}
                </TouchableOpacity>
              </>
            )}
            {totpStep === 'verify' && (
              <>
                <Text style={m.title}>Quét mã QR</Text>
                <View style={s.secretBox}>
                  <Text style={s.secretLabel}>Hoặc nhập thủ công:</Text>
                  <Text style={s.secretTxt} selectable>{totpSecret}</Text>
                  <TouchableOpacity onPress={async () => { try { await Share.share({ message: totpSecret }) } catch { /* */ } }}>
                    <Text style={{ color: '#6366F1', fontSize: 12, textAlign: 'center', marginTop: 4 }}>Copy secret</Text>
                  </TouchableOpacity>
                </View>
                <Text style={m.desc}>Nhập mã 6 số từ app TOTP để xác nhận:</Text>
                <TextInput style={m.input} value={totpCode} onChangeText={t => setTotpCode(t.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" placeholderTextColor="#2E2E45" keyboardType="numeric" maxLength={6} />
                <View style={m.btnRow}>
                  <TouchableOpacity style={m.cancel} onPress={() => setTotpModal(false)}>
                    <Text style={m.cancelTxt}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={m.confirm} onPress={handleTotpVerify} disabled={totpLoading}>
                    {totpLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.confirmTxt}>Xác nhận</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
            {totpStep === 'disable' && (
              <>
                <Text style={m.title}>Tắt xác thực 2 bước</Text>
                <Text style={m.desc}>Nhập mã 6 số từ app TOTP để xác nhận tắt 2FA:</Text>
                <TextInput style={m.input} value={totpCode} onChangeText={t => setTotpCode(t.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" placeholderTextColor="#2E2E45" keyboardType="numeric" maxLength={6} />
                <View style={m.btnRow}>
                  <TouchableOpacity style={m.cancel} onPress={() => setTotpModal(false)}>
                    <Text style={m.cancelTxt}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[m.confirm, { backgroundColor: '#EF4444' }]} onPress={handleTotpDisable} disabled={totpLoading}>
                    {totpLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.confirmTxt}>Tắt 2FA</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Update modal */}
      <Modal visible={updateModalVisible} transparent animationType="fade" onRequestClose={() => {
        if (!updateDecision?.forceUpdate) setUpdateModalVisible(false)
      }}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>Có bản cập nhật mới</Text>
            <Text style={m.desc}>
              Phiên bản hiện tại: {updateDecision?.currentVersion}{'\n'}
              Phiên bản mới: {updateDecision?.latestVersion}{'\n'}
              {updateDecision?.reason}
            </Text>
            {!!updateDecision?.notes && (
              <View style={s.updateNoteBox}>
                <Text style={s.updateNoteTxt} numberOfLines={4}>{updateDecision.notes}</Text>
              </View>
            )}
            <View style={m.btnRow}>
              {updateDecision?.canSkip && !updateDecision.forceUpdate && (
                <TouchableOpacity style={m.cancel} onPress={handleSkipUpdate}>
                  <Text style={m.cancelTxt}>Bỏ qua bản này</Text>
                </TouchableOpacity>
              )}
              {!updateDecision?.forceUpdate && (
                <TouchableOpacity style={m.cancel} onPress={() => setUpdateModalVisible(false)}>
                  <Text style={m.cancelTxt}>Để sau</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={m.confirm} onPress={handleOpenUpdate}>
                <Text style={m.confirmTxt}>Cập nhật ngay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={s.sectionTitle}>
      <Text style={s.sectionTitleTxt}>{title.toUpperCase()}</Text>
    </View>
  )
}

function SettingRow({ icon: IconComponent, label, value, valueStyle, onPress, chevron }: {
  icon: Icon; label: string; value?: string; valueStyle?: object
  onPress?: () => void; chevron?: boolean
}) {
  return (
    <TouchableOpacity style={s.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.settingIcon}>
        <IconComponent size={19} color="#94A3B8" weight="bold" />
      </View>
      <Text style={s.settingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value && <Text style={[s.settingValue, valueStyle]}>{value}</Text>}
        {chevron && <CaretRightIcon size={17} color="#374151" weight="bold" />}
      </View>
    </TouchableOpacity>
  )
}

function guessImageType(uri: string) {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#08080F' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:        { width: 36, height: 36, justifyContent: 'center' },
  headerTitle:    { flex: 1, color: '#F1F5F9', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  profileCard:    { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24, marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: '#0E0E1C', borderRadius: 20, borderWidth: 1, borderColor: '#1A1A2E' },
  avatarPress:    { width: 88, height: 88, marginBottom: 12 },
  bigAvatar:      { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  bigAvatarImg:   { width: 88, height: 88, borderRadius: 44, backgroundColor: '#12121E' },
  bigAvatarTxt:   { color: '#818CF8', fontSize: 32, fontWeight: '700' },
  avatarEditBadge:{ position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0E0E1C' },
  displayName:    { color: '#F1F5F9', fontSize: 20, fontWeight: '700', marginBottom: 2 },
  usernameLabel:  { color: '#6366F1', fontSize: 13, marginBottom: 6 },
  bioTxt:         { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 8 },
  editProfileBtn: { marginTop: 8, backgroundColor: '#1E1B4B', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  editProfileTxt: { color: '#818CF8', fontSize: 14, fontWeight: '600' },
  deleteAvatarBtn:{ marginTop: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteAvatarTxt:{ color: '#EF4444', fontSize: 13, fontWeight: '600' },
  sectionTitle:   { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionTitleTxt:{ color: '#374151', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  section:        { marginHorizontal: 16, backgroundColor: '#0E0E1C', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1A1A2E' },
  settingRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#12121E' },
  settingIcon:    { marginRight: 12, width: 26, alignItems: 'center' },
  settingLabel:   { flex: 1, color: '#E2E8F0', fontSize: 15 },
  settingValue:   { color: '#64748B', fontSize: 13 },
  valueOn:        { color: '#22C55E', fontWeight: '600' },
  valueOff:       { color: '#64748B' },
  inviteLinkBox:  { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#12121E' },
  inviteLinkLabel:{ color: '#64748B', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
  inviteLinkTxt:  { color: '#818CF8', fontSize: 13, fontFamily: 'monospace', marginBottom: 10 },
  inviteBtnRow:   { flexDirection: 'row', gap: 8 },
  inviteActionBtn:{ flex: 1, backgroundColor: '#12121E', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  inviteActionTxt:{ color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  logoutRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  rowDivider:     { height: 1, backgroundColor: '#12121E', marginHorizontal: 16 },
  logoutIco:      { marginRight: 12, width: 26 },
  logoutTxt:      { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  versionTxt:     { color: '#1E1E30', fontSize: 11, textAlign: 'center', marginTop: 28 },
  secretBox:      { backgroundColor: '#0D0D1A', borderRadius: 12, padding: 14, marginBottom: 14 },
  secretLabel:    { color: '#64748B', fontSize: 11, marginBottom: 8 },
  secretTxt:      { color: '#818CF8', fontSize: 14, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 2 },
  updateNoteBox:  { backgroundColor: '#0D0D1A', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1E1E30' },
  updateNoteTxt:  { color: '#94A3B8', fontSize: 12, lineHeight: 17 },
})

const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#0E0E1C', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: '#1A1A2E' },
  handle:     { width: 40, height: 4, backgroundColor: '#2E2E45', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:      { color: '#F1F5F9', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  desc:       { color: '#64748B', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  field:      { marginBottom: 14 },
  label:      { color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  input:      { backgroundColor: '#0D0D1A', borderWidth: 1.5, borderColor: '#1E1E30', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, color: '#F1F5F9', fontSize: 15 },
  btnRow:     { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancel:     { flex: 1, backgroundColor: '#12121E', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#1E1E30' },
  cancelTxt:  { color: '#64748B', fontSize: 15, fontWeight: '600' },
  confirm:    { flex: 2, backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
