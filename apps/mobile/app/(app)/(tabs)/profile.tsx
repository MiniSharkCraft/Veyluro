import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native'
import { router } from 'expo-router'

const MENU = [
  { icon: '🔒', label: 'Bảo mật & Quyền riêng tư', sub: 'E2EE · Zero-knowledge' },
  { icon: '🔔', label: 'Thông báo', sub: 'Tùy chỉnh âm thanh & badge' },
  { icon: '🎨', label: 'Giao diện', sub: 'Dark mode · AMoon theme' },
  { icon: '💾', label: 'Sao lưu khóa', sub: 'Export private key' },
  { icon: '❓', label: 'Trợ giúp', sub: 'FAQ · Liên hệ' },
]

export default function ProfileScreen() {
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.sub}>AMoon Eclipse</Text>
        <Text style={s.title}>Hồ sơ</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

        {/* Avatar card */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatarRing}>
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>M</Text>
              </View>
            </View>
            <TouchableOpacity style={s.editAvatarBtn} activeOpacity={0.8}>
              <Text style={s.editAvatarIco}>✎</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.displayName}>me_user</Text>
          <Text style={s.username}>@me_user</Text>

          {/* E2EE key badge */}
          <View style={s.keyBadge}>
            <View style={s.keyDot} />
            <Text style={s.keyTxt}>Private key đang được bảo vệ trên thiết bị</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[['12', 'Bạn bè'], ['5', 'Story đã đăng'], ['89', 'Tin nhắn']].map(([val, label]) => (
            <View key={label} style={s.statItem}>
              <Text style={s.statVal}>{val}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        <View style={s.menuWrap}>
          {MENU.map((item, i) => (
            <TouchableOpacity key={i} style={s.menuRow} activeOpacity={0.65}>
              <Text style={s.menuIcon}>{item.icon}</Text>
              <View style={s.menuInfo}>
                <Text style={s.menuLabel}>{item.label}</Text>
                <Text style={s.menuSub}>{item.sub}</Text>
              </View>
              <Text style={s.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} activeOpacity={0.8} onPress={() => router.replace('/(auth)/login')}>
          <Text style={s.logoutTxt}>Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={s.version}>AMoon Eclipse v0.1.0 · CongMC Dev Team 🐧</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  sub: { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },

  profileCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, marginBottom: 8 },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarRing: {
    padding: 3, borderRadius: 46,
    borderWidth: 2, borderColor: '#6366F1',
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#4C1D95', alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 30, fontWeight: '700' },
  editAvatarBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#08080F',
  },
  editAvatarIco: { color: '#fff', fontSize: 13 },
  displayName: { color: '#F1F5F9', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  username: { color: '#64748B', fontSize: 14, marginBottom: 14 },
  keyBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D1626', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1E3A5F',
  },
  keyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', marginRight: 8 },
  keyTxt: { color: '#64748B', fontSize: 12 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#12121E',
    marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 16, marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: '#F1F5F9', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#64748B', fontSize: 12, marginTop: 2 },

  menuWrap: { marginHorizontal: 16, backgroundColor: '#12121E', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1A1A2E',
  },
  menuIcon: { fontSize: 20, marginRight: 14, width: 28, textAlign: 'center' },
  menuInfo: { flex: 1 },
  menuLabel: { color: '#F1F5F9', fontSize: 15, fontWeight: '500' },
  menuSub: { color: '#374151', fontSize: 12, marginTop: 1 },
  menuArrow: { color: '#374151', fontSize: 22, fontWeight: '300' },

  logoutBtn: {
    marginHorizontal: 16, backgroundColor: '#1A0A0A',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#7F1D1D', marginBottom: 20,
  },
  logoutTxt: { color: '#EF4444', fontSize: 15, fontWeight: '600' },

  version: { color: '#1E1E30', fontSize: 12, textAlign: 'center' },
})
