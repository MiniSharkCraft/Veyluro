const apiBase = (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.trim()
const wsBase = (process.env.EXPO_PUBLIC_WS_BASE_URL as string | undefined)?.trim()
const updateMetaUrl = (process.env.EXPO_PUBLIC_UPDATE_META_URL as string | undefined)?.trim()

export const API_BASE_URL = apiBase && apiBase.length > 0 ? apiBase : 'http://localhost:8080'
export const WS_BASE_URL = wsBase && wsBase.length > 0 ? wsBase : API_BASE_URL.replace(/^http/, 'ws')
export const UPDATE_META_URL = updateMetaUrl && updateMetaUrl.length > 0
  ? updateMetaUrl
  : 'https://api.anhcong.dev/v1/amoon-eclipse/update'
