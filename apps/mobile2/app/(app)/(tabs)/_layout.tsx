import { Tabs } from 'expo-router'
import { StyleSheet, useColorScheme, View } from 'react-native'
import {
  ChatCircleIcon,
  CircleDashedIcon,
  NoteIcon,
  TrayIcon,
  UsersThreeIcon,
  type Icon,
} from 'phosphor-react-native'
import { getTheme, type AppTheme } from '../../../src/lib/theme'

function TabIcon({
  icon: IconComponent,
  active,
  badge,
  theme,
}: {
  icon: Icon
  active: boolean
  badge?: number
  theme: AppTheme
}) {
  return (
    <View style={ti.wrap}>
      <IconComponent size={23} color={active ? theme.accent : theme.faint} weight={active ? 'fill' : 'bold'} />
      {badge ? <View style={ti.badge} /> : null}
    </View>
  )
}

const ti = StyleSheet.create({
  wrap:  { alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28 },
  badge: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
})

export default function TabsLayout() {
  const theme = getTheme(useColorScheme())

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.bg,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.faint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: ({ focused }) => <TabIcon icon={ChatCircleIcon} active={focused} theme={theme} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Bạn bè', tabBarIcon: ({ focused }) => <TabIcon icon={UsersThreeIcon} active={focused} theme={theme} /> }} />
      <Tabs.Screen name="pending" options={{ title: 'Chờ', tabBarIcon: ({ focused }) => <TabIcon icon={TrayIcon} active={focused} theme={theme} /> }} />
      <Tabs.Screen name="stories" options={{ title: 'Story', tabBarIcon: ({ focused }) => <TabIcon icon={CircleDashedIcon} active={focused} theme={theme} /> }} />
      <Tabs.Screen name="notes" options={{ title: 'Ghi chú', tabBarIcon: ({ focused }) => <TabIcon icon={NoteIcon} active={focused} theme={theme} /> }} />
    </Tabs>
  )
}
