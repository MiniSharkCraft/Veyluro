import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const CHAT_CHANNEL_ID = 'amoon-chat'
const CALL_CHANNEL_ID = 'amoon-call'
let prepared = false

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function ensureNotificationsReady() {
  if (prepared) return
  const perms = await Notifications.getPermissionsAsync()
  if (!perms.granted) {
    await Notifications.requestPermissionsAsync()
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHAT_CHANNEL_ID, {
      name: 'Tin nhắn',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 220, 180, 220],
    })
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Cuộc gọi',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
  }
  prepared = true
}

export async function notifyIncomingMessage(from: string, preview: string) {
  await ensureNotificationsReady()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: from,
      body: preview || 'Tin nhắn mới',
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: CHAT_CHANNEL_ID } : {}),
    },
    trigger: null,
  })
}

export async function notifyIncomingCall(from: string) {
  await ensureNotificationsReady()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: from,
      body: 'Đang gọi cho bạn',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...(Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : {}),
    },
    trigger: null,
  })
}
