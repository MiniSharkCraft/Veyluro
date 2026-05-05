/**
 * @file _layout.tsx
 * @description Root layout — MUST install Web Crypto polyfill FIRST before
 * any @messmini/common import that calls SubtleCrypto.
 *
 * expo-standard-web-crypto patches globalThis.crypto so our crypto-engine.ts
 * runs identically to Web/Desktop with zero code changes.
 */

// ① Polyfill Web Crypto API — must be first import
import 'expo-standard-web-crypto'

import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as Font from 'expo-font'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    const prepare = async () => {
      try {
        await Font.loadAsync({
          'JetBrainsMono': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
          'JetBrainsMono-Bold': require('../assets/fonts/JetBrainsMono-Bold.ttf'),
        })
      } catch (e) {
        console.warn('Font load failed, falling back to system mono:', e)
      } finally {
        await SplashScreen.hideAsync()
      }
    }
    prepare()
  }, [])

  return (
    <>
      <StatusBar style="light" backgroundColor="#050508" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0D0D14' },
          headerTintColor: '#00FFFF',
          headerTitleStyle: { fontFamily: 'JetBrainsMono', fontSize: 14 },
          contentStyle: { backgroundColor: '#050508' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
