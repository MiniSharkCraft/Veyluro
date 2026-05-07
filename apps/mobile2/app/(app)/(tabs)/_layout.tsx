import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import {
  ChatCircleIcon,
  CircleDashedIcon,
  NoteIcon,
  TrayIcon,
  UsersThreeIcon,
  type Icon,
} from 'phosphor-react-native'

function TabIcon({ icon: IconComponent, active, badge }: { icon: Icon; active: boolean; badge?: number }) {
  return (
    <View style={ti.wrap}>
      <IconComponent size={23} color={active ? '#A5B4FC' : '#3A3A4D'} weight={active ? 'fill' : 'bold'} />
      {badge ? <View style={ti.badge} /> : null}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap:  { alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28 },
  badge: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
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
        tabBarActiveTintColor: '#A5B4FC',
        tabBarInactiveTintColor: '#3A3A4D',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: ({ focused }) => <TabIcon icon={ChatCircleIcon} active={focused} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Bạn bè', tabBarIcon: ({ focused }) => <TabIcon icon={UsersThreeIcon} active={focused} /> }} />
      <Tabs.Screen name="pending" options={{ title: 'Chờ', tabBarIcon: ({ focused }) => <TabIcon icon={TrayIcon} active={focused} /> }} />
      <Tabs.Screen name="stories" options={{ title: 'Story', tabBarIcon: ({ focused }) => <TabIcon icon={CircleDashedIcon} active={focused} /> }} />
      <Tabs.Screen name="notes" options={{ title: 'Ghi chú', tabBarIcon: ({ focused }) => <TabIcon icon={NoteIcon} active={focused} /> }} />
    </Tabs>
  )
}
