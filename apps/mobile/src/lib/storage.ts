/**
 * SecureStore helpers — tất cả auth data đều qua đây
 */
import * as SecureStore from 'expo-secure-store'
import { importRsaPrivateKey } from '@messmini/common'

export const storage = {
  getToken:    () => SecureStore.getItemAsync('amoon:token'),
  getUserId:   () => SecureStore.getItemAsync('amoon:userId'),
  getUsername: () => SecureStore.getItemAsync('amoon:username'),

  async getPrivateKey(): Promise<CryptoKey | null> {
    const userId = await this.getUserId()
    if (!userId) return null
    const pkcs8 = await SecureStore.getItemAsync(`privateKey:${userId}`)
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

  async clear() {
    const userId = await this.getUserId()
    await Promise.all([
      SecureStore.deleteItemAsync('amoon:token'),
      SecureStore.deleteItemAsync('amoon:userId'),
      SecureStore.deleteItemAsync('amoon:username'),
      userId ? SecureStore.deleteItemAsync(`privateKey:${userId}`) : Promise.resolve(),
    ])
  },
}
