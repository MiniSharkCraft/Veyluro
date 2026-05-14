import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, View } from 'react-native'
import { router } from 'expo-router'
import { storage } from '../src/lib/storage'

export default function Index() {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let alive = true

    async function restoreSession() {
      try {
        const { token, userId } = await storage.getSession()
        if (!alive) return

        if (!token || !userId) {
          router.replace('/(auth)/login')
          return
        }

        const privateKey = await storage.getPrivateKey()
        if (!alive) return

        router.replace(privateKey ? '/(app)/(tabs)' : '/(auth)/recover-key')
      } catch (err) {
        console.warn('[session] restore failed:', err)
        if (alive) router.replace('/(auth)/login')
      } finally {
        if (alive) setChecking(false)
      }
    }

    restoreSession()
    return () => {
      alive = false
    }
  }, [])

  if (!checking) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08080F' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#A5B4FC" />
      </View>
    </SafeAreaView>
  )
}
