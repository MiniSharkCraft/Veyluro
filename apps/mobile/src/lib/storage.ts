import * as SecureStore from 'expo-secure-store'
import { importRsaPrivateKey } from './crypto'

const mutedKey = (userId: string) => `amoon_muted_users_${userId}`
const authMethodKey = (userId: string) => `auth_method_${userId}`
export type AuthMethod = 'pin' | 'passkey'

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
      userId ? SecureStore.deleteItemAsync(`publicKey_${userId}`) : Promise.resolve(),
      userId ? SecureStore.deleteItemAsync(mutedKey(userId)) : Promise.resolve(),
      userId ? SecureStore.deleteItemAsync(authMethodKey(userId)) : Promise.resolve(),
    ])
  },

  async getAuthMethod(): Promise<AuthMethod | null> {
    const userId = await this.getUserId()
    if (!userId) return null
    const method = await SecureStore.getItemAsync(authMethodKey(userId))
    if (method === 'pin' || method === 'passkey') return method
    return null
  },

  async setAuthMethod(method: AuthMethod): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return
    await SecureStore.setItemAsync(authMethodKey(userId), method)
  },

  async setAuthMethodForUser(userId: string, method: AuthMethod): Promise<void> {
    await SecureStore.setItemAsync(authMethodKey(userId), method)
  },

  async getMutedUserIds(): Promise<string[]> {
    const userId = await this.getUserId()
    if (!userId) return []
    const raw = await SecureStore.getItemAsync(mutedKey(userId))
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      return []
    }
  },

  async isUserMuted(targetUserId: string): Promise<boolean> {
    const muted = await this.getMutedUserIds()
    return muted.includes(targetUserId)
  },

  async setUserMuted(targetUserId: string, muted: boolean): Promise<void> {
    const userId = await this.getUserId()
    if (!userId) return
    const current = await this.getMutedUserIds()
    const next = muted
      ? Array.from(new Set([...current, targetUserId]))
      : current.filter(id => id !== targetUserId)
    await SecureStore.setItemAsync(mutedKey(userId), JSON.stringify(next))
  },
}
