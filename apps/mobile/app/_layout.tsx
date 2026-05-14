// ① Polyfill Web Crypto API (full SubtleCrypto) — must be FIRST import
import '../src/lib/text-decoder-polyfill'
import { install } from 'react-native-quick-crypto'
install()

import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { getTheme } from '../src/lib/theme'
import { ensureNotificationsReady } from '../src/lib/notifications'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const scheme = useColorScheme()
  const theme = getTheme(scheme)

  useEffect(() => {
    ensureNotificationsReady().catch((err) => {
      console.warn('[notify] init failed:', err)
    })
    SplashScreen.hideAsync()
  }, [])

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} backgroundColor={theme.bg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
