import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'

type IconKey = 'Chats' | 'Friends' | 'Pending' | 'Stories' | 'Notes'

const ICONS: Record<IconKey, string> = {
  Chats: '💬', Friends: '👥', Pending: '📨', Stories: '◉', Notes: '📝',
}

function TabIcon({ label, active, badge }: { label: string; active: boolean; badge?: number }) {
  return (
    <View style={ti.wrap}>
      <Text style={[ti.icon, active && ti.iconActive]}>{ICONS[label as IconKey] ?? '●'}</Text>
      {badge ? (
        <View style={ti.badge}>
          <Text style={ti.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap:       { alignItems: 'center' },
  icon:       { fontSize: 20, opacity: 0.4 },
  iconActive: { opacity: 1 },
  badge:      { position: 'absolute', top: -4, right: -8, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeTxt:   { color: '#fff', fontSize: 9, fontWeight: '800' },
})

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A14',
          borderTopColor: '#12121E',
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#818CF8',
        tabBarInactiveTintColor: '#2E2E45',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Chats',   tabBarIcon: ({ focused }) => <TabIcon label="Chats"   active={focused} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Bạn bè',  tabBarIcon: ({ focused }) => <TabIcon label="Friends" active={focused} /> }} />
      <Tabs.Screen name="pending" options={{ title: 'Chờ',     tabBarIcon: ({ focused }) => <TabIcon label="Pending" active={focused} /> }} />
      <Tabs.Screen name="stories" options={{ title: 'Story',   tabBarIcon: ({ focused }) => <TabIcon label="Stories" active={focused} /> }} />
      <Tabs.Screen name="notes"   options={{ title: 'Ghi chú', tabBarIcon: ({ focused }) => <TabIcon label="Notes"   active={focused} /> }} />
    </Tabs>
  )
}
