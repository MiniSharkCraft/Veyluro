import * as SecureStore from 'expo-secure-store'
import { importRsaPrivateKey } from './crypto'

const mutedKey = (userId: string) => `veyluro_muted_users_${userId}`
const legacyMutedKey = (userId: string) => `amoon_muted_users_${userId}`
const authMethodKey = (userId: string) => `auth_method_${userId}`
export type AuthMethod = 'pin' | 'passkey'

const TOKEN_KEY = 'veyluro_token'
const USER_ID_KEY = 'veyluro_userId'
const USERNAME_KEY = 'veyluro_username'
const LEGACY_TOKEN_KEY = 'veyluro_token'
const LEGACY_USER_ID_KEY = 'veyluro_userId'
const LEGACY_USERNAME_KEY = 'veyluro_username'

export const storage = {
  async getToken() {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? SecureStore.getItemAsync(LEGACY_TOKEN_KEY)
  },
  async getUserId() {
    return (await SecureStore.getItemAsync(USER_ID_KEY)) ?? SecureStore.getItemAsync(LEGACY_USER_ID_KEY)
  },
  async getUsername() {
    return (await SecureStore.getItemAsync(USERNAME_KEY)) ?? SecureStore.getItemAsync(LEGACY_USERNAME_KEY)
  },

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
      SecureStore.setItemAsync(USER_ID_KEY, userId),
      SecureStore.setItemAsync(USERNAME_KEY, username),
      SecureStore.setItemAsync(TOKEN_KEY, token),
      // legacy compatibility for old app code paths
      SecureStore.setItemAsync(LEGACY_USER_ID_KEY, userId),
      SecureStore.setItemAsync(LEGACY_USERNAME_KEY, username),
      SecureStore.setItemAsync(LEGACY_TOKEN_KEY, token),
    ])
  },

  async clear() {
    const userId = await this.getUserId()
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_ID_KEY),
      SecureStore.deleteItemAsync(USERNAME_KEY),
      SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY),
      SecureStore.deleteItemAsync(LEGACY_USER_ID_KEY),
      SecureStore.deleteItemAsync(LEGACY_USERNAME_KEY),
      userId ? SecureStore.deleteItemAsync(`privateKey_${userId}`) : Promise.resolve(),
      userId ? SecureStore.deleteItemAsync(`publicKey_${userId}`) : Promise.resolve(),
      userId ? SecureStore.deleteItemAsync(mutedKey(userId)) : Promise.resolve(),
      userId ? SecureStore.deleteItemAsync(legacyMutedKey(userId)) : Promise.resolve(),
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
    const raw = (await SecureStore.getItemAsync(mutedKey(userId)))
      ?? (await SecureStore.getItemAsync(legacyMutedKey(userId)))
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
