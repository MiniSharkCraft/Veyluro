import * as SecureStore from 'expo-secure-store'
import { importRsaPrivateKey } from './crypto'

export const storage = {
  getToken:    () => SecureStore.getItemAsync('amoon_token'),
  getUserId:   () => SecureStore.getItemAsync('amoon_userId'),
  getUsername: () => SecureStore.getItemAsync('amoon_username'),

  async getPrivateKey(): Promise<CryptoKey | null> {
    const userId = await this.getUserId()
    if (!userId) return null
    const pkcs8 = await SecureStore.getItemAsync(`privateKey_${userId}`)
    if (!pkcs8) return null
    return importRsaPrivateKey(pkcs8)
  },

  async getSession() {
    const [token, userId, username] = await Promise.all([
      this.getToken(),
      this.getUserId(),
      this.getUsername(),
    ])
    return { token, userId, username }
  },

  async setSession(userId: string, username: string, token: string) {
    await Promise.all([
      SecureStore.setItemAsync('amoon_userId', userId),
      SecureStore.setItemAsync('amoon_username', username),
      SecureStore.setItemAsync('amoon_token', token),
    ])
  },

  async clear() {
    const userId = await this.getUserId()
    await Promise.all([
      SecureStore.deleteItemAsync('amoon_token'),
      SecureStore.deleteItemAsync('amoon_userId'),
      SecureStore.deleteItemAsync('amoon_username'),
      userId ? SecureStore.deleteItemAsync(`privateKey_${userId}`) : Promise.resolve(),
    ])
  },
}
