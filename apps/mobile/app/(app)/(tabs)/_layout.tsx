import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'

function TabIcon({ label, active, dot }: { label: string; active: boolean; dot?: boolean }) {
  const icons: Record<string, string> = {
    'Chats': '💬', 'Khám phá': '◎', 'Hồ sơ': '◉',
  }
  return (
    <View style={ti.wrap}>
      <Text style={[ti.icon, active && ti.iconActive]}>{icons[label]}</Text>
      {dot && <View style={ti.dot} />}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap: { alignItems: 'center', position: 'relative' },
  icon: { fontSize: 22, opacity: 0.4 },
  iconActive: { opacity: 1 },
  dot: {
    position: 'absolute', top: 0, right: -4,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#EC4899',
    borderWidth: 1.5, borderColor: '#08080F',
  },
})

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0E0E1C',
          borderTopColor: '#1A1A2E',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#818CF8',
        tabBarInactiveTintColor: '#374151',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused }) => <TabIcon label="Chats" active={focused} dot />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Khám phá',
          tabBarIcon: ({ focused }) => <TabIcon label="Khám phá" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarIcon: ({ focused }) => <TabIcon label="Hồ sơ" active={focused} />,
        }}
      />
    </Tabs>
  )
}
