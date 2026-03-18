import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native'

const FEATURED_STORIES = [
  { id: '1', name: 'ghost_user',  color: '#4C1D95', time: '2g trước',  text: 'Đang debug lúc 2am 🌙' },
  { id: '2', name: 'moon_dev',    color: '#1E3A5F', time: '5g trước',  text: 'Ship feature mới rồi nha 🚀' },
  { id: '3', name: 'nova_star',   color: '#831843', time: '8g trước',  text: 'Cà phê số 4 ☕' },
  { id: '4', name: 'eclipse_99',  color: '#064E3B', time: '12g trước', text: 'Code review xong xuôi 🔥' },
  { id: '5', name: 'dark_pulse',  color: '#7C2D12', time: '19g trước', text: 'Sắp hết 24h rồi...' },
]

const COLORS = ['#4C1D95','#1E3A5F','#831843','#064E3B','#7C2D12','#1E293B']
const avatarBg = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length]

export default function ExploreScreen() {
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.sub}>AMoon Eclipse</Text>
        <Text style={s.title}>Khám phá</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

        {/* Active stories */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Story đang hoạt động</Text>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveTxt}>LIVE</Text>
            </View>
          </View>

          {FEATURED_STORIES.map(story => (
            <TouchableOpacity key={story.id} style={s.storyCard} activeOpacity={0.75}>
              <View style={[s.storyAvatar, { backgroundColor: story.color }]}>
                <Text style={s.storyAvatarTxt}>{story.name[0].toUpperCase()}</Text>
              </View>
              <View style={s.storyInfo}>
                <Text style={s.storyName}>{story.name}</Text>
                <Text style={s.storyPreview} numberOfLines={1}>{story.text}</Text>
              </View>
              <Text style={s.storyTime}>{story.time}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* My note */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Ghi chú của tôi</Text>
          <TouchableOpacity style={s.myNoteCard} activeOpacity={0.8}>
            <View style={s.myNoteTop}>
              <View style={[s.myNoteAvatar, { backgroundColor: avatarBg('me') }]}>
                <Text style={s.myNoteAvatarTxt}>M</Text>
              </View>
              <View style={s.myNoteInfo}>
                <Text style={s.myNoteName}>Ghi chú của bạn</Text>
                <Text style={s.myNoteHint}>Hết hạn sau 24 giờ</Text>
              </View>
              <TouchableOpacity style={s.editBtn} activeOpacity={0.7}>
                <Text style={s.editBtnTxt}>✎ Sửa</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.myNoteEmpty}>Nhấn "Sửa" để thêm ghi chú của bạn...</Text>
          </TouchableOpacity>
        </View>

        {/* Create story CTA */}
        <View style={s.section}>
          <TouchableOpacity style={s.ctaCard} activeOpacity={0.85}>
            <View style={s.ctaMoon}>
              <View style={s.ctaMoonOuter}>
                <View style={s.ctaMoonInner} />
              </View>
            </View>
            <Text style={s.ctaTitle}>Tạo Story mới</Text>
            <Text style={s.ctaSub}>Chia sẻ khoảnh khắc với bạn bè — tự xóa sau 24 giờ</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080F' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  sub: { color: '#6366F1', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },

  section: { marginBottom: 8, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', flex: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#450A0A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 4 },
  liveTxt: { color: '#EF4444', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  storyCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#12121E', borderRadius: 14,
    padding: 14, marginBottom: 8,
  },
  storyAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  storyAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  storyInfo: { flex: 1 },
  storyName: { color: '#F1F5F9', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  storyPreview: { color: '#64748B', fontSize: 13 },
  storyTime: { color: '#374151', fontSize: 11 },

  myNoteCard: { backgroundColor: '#12121E', borderRadius: 16, padding: 16, marginBottom: 8 },
  myNoteTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  myNoteAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  myNoteAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  myNoteInfo: { flex: 1 },
  myNoteName: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
  myNoteHint: { color: '#374151', fontSize: 12 },
  editBtn: { backgroundColor: '#1E1B4B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnTxt: { color: '#818CF8', fontSize: 12, fontWeight: '600' },
  myNoteEmpty: { color: '#374151', fontSize: 13, fontStyle: 'italic' },

  ctaCard: {
    backgroundColor: '#1E1B4B', borderRadius: 20, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#312E81',
  },
  ctaMoon: { marginBottom: 16 },
  ctaMoonOuter: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#4338CA', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 6,
  },
  ctaMoonInner: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1E1B4B' },
  ctaTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  ctaSub: { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20 },
})
