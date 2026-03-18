import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="room/[roomId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings"      options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="admin"         options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="group-create"  options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  )
}
