const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const wsBase = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim()
const originBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'

export const API_BASE_URL = apiBase && apiBase.length > 0 ? apiBase : originBase
export const WS_BASE_URL = wsBase && wsBase.length > 0 ? wsBase : API_BASE_URL.replace(/^http/, 'ws')
