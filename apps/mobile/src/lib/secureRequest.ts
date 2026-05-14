import { NativeModules, Platform } from 'react-native'
import 'react-native-get-random-values'
import { API_BASE_URL } from './runtimeConfig'

type InterceptorConfig = {
  method?: string
  baseURL?: string
  url?: string
  data?: unknown
  headers?: Record<string, string>
}

type InterceptorCapable = {
  interceptors?: {
    request?: {
      use: (handler: (config: InterceptorConfig) => Promise<InterceptorConfig> | InterceptorConfig) => void
    }
  }
}

const { IntegrityModule } = NativeModules as {
  IntegrityModule?: { getAppSum?: (nonce: string) => Promise<string> }
}

const _sigKeyParts = ['amoon', 'sig', 'key', 'v1', '2026']
const SIG_KEY = _sigKeyParts.join('-')
const API_URL = API_BASE_URL

function newNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function signRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string,
  key: string
): Promise<string> {
  const enc = new TextEncoder()
  const message = [method.toUpperCase(), path, timestamp, nonce, body].join('\n')
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return bytesToHex(new Uint8Array(sig))
}

async function getAppSum(nonce: string): Promise<string> {
  try {
    if (!IntegrityModule?.getAppSum) {
      return 'dev-mode-no-native'
    }
    const sum = await IntegrityModule.getAppSum(nonce)
    return sum || 'integrity-failed'
  } catch {
    return 'integrity-error'
  }
}

function serializeBody(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof FormData !== 'undefined' && data instanceof FormData) return ''
  try {
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

function extractPath(config: InterceptorConfig): string {
  try {
    const base = config.baseURL ?? ''
    const url = config.url ?? ''
    const full = url.startsWith('http') ? url : base + url
    const parsed = new URL(full)
    return parsed.pathname + (parsed.search || '')
  } catch {
    return config.url ?? '/'
  }
}

async function buildSecureHeaders(method: string, path: string, body: string): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = newNonce()
  const [appSum, signature] = await Promise.all([
    getAppSum(nonce),
    signRequest(method, path, timestamp, nonce, body, SIG_KEY),
  ])
  return {
    'X-App-Sum': appSum,
    'X-Nonce': nonce,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'X-Platform': Platform.OS,
  }
}

export function setupSecureInterceptor(instance: InterceptorCapable): void {
  const request = instance.interceptors?.request
  if (!request) return
  request.use(async (config) => {
    const method = (config.method ?? 'GET').toUpperCase()
    const path = extractPath(config)
    const body = serializeBody(config.data)
    const secureHeaders = await buildSecureHeaders(method, path, body)
    config.headers = { ...(config.headers ?? {}), ...secureHeaders }
    return config
  })
}

async function secureFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const fullUrl = path.startsWith('http') ? path : `${API_URL}${path}`
  const parsed = new URL(fullUrl)
  const body = serializeBody(init.body)
  const secureHeaders = await buildSecureHeaders(method, parsed.pathname + (parsed.search || ''), body)
  const headers = new Headers(init.headers ?? {})
  Object.entries(secureHeaders).forEach(([k, v]) => headers.set(k, v))

  return fetch(fullUrl, { ...init, method, headers })
}

export const secureApi = {
  request: secureFetch,
  get: (path: string, init: RequestInit = {}) => secureFetch(path, { ...init, method: 'GET' }),
  post: (path: string, data?: unknown, init: RequestInit = {}) => {
    const body = data instanceof FormData || typeof data === 'string' ? data : data == null ? undefined : JSON.stringify(data)
    const headers = new Headers(init.headers ?? {})
    if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    return secureFetch(path, { ...init, method: 'POST', headers, body })
  },
}

export default secureApi
