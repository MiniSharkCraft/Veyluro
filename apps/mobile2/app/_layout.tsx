// ① Polyfill Web Crypto API (full SubtleCrypto) — must be FIRST import
import { install } from 'react-native-quick-crypto'
install()

import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync()
  }, [])

  return (
    <>
      <StatusBar style="light" backgroundColor="#050508" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0D0D14' },
          headerTintColor: '#818CF8',
          contentStyle: { backgroundColor: '#08080F' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
