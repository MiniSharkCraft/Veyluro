import { UPDATE_META_URL } from './runtimeConfig'

export type UpdateInfo = {
  latestVersion: string
  downloadUrl: string
  notes?: string
  minSupportedVersion?: string
  forceUpdate?: boolean
}

export type UpdateDecision = {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  forceUpdate: boolean
  canSkip: boolean
  reason?: string
  downloadUrl?: string
  notes?: string
  minSupportedVersion?: string
}

function parseSemver(input: string): [number, number, number] {
  const cleaned = input.trim().replace(/^v/i, '')
  const [maj, min, pat] = cleaned.split('.').map(x => Number.parseInt(x, 10) || 0)
  return [maj, min, pat]
}

function compareSemver(a: string, b: string): number {
  const av = parseSemver(a)
  const bv = parseSemver(b)
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1
    if (av[i] < bv[i]) return -1
  }
  return 0
}

function toUpdateInfo(data: any): UpdateInfo | null {
  if (!data || typeof data !== 'object') return null

  const noteText = typeof data.notes === 'string'
    ? data.notes
    : (typeof data.body === 'string' ? data.body : '')
  const forceFromNotes = /(?:#force|\[force\]|force-update|mandatory)/i.test(noteText)
  const forceUpdate = Boolean(data.forceUpdate) || forceFromNotes

  if (typeof data.latestVersion === 'string' && typeof data.downloadUrl === 'string') {
    return {
      latestVersion: data.latestVersion,
      downloadUrl: data.downloadUrl,
      notes: noteText,
      minSupportedVersion: typeof data.minSupportedVersion === 'string' ? data.minSupportedVersion : undefined,
      forceUpdate,
    }
  }

  if (typeof data.tag_name === 'string' && typeof data.html_url === 'string') {
    return {
      latestVersion: data.tag_name.replace(/^v/i, ''),
      downloadUrl: data.html_url,
      notes: noteText,
      forceUpdate,
    }
  }

  return null
}

export async function fetchUpdateInfo(signal?: AbortSignal): Promise<UpdateInfo | null> {
  const res = await fetch(UPDATE_META_URL, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const data = await res.json()
  return toUpdateInfo(data)
}

export function decideUpdate(currentVersion: string, info: UpdateInfo): UpdateDecision {
  const hasUpdate = compareSemver(info.latestVersion, currentVersion) > 0
  if (!hasUpdate) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: info.latestVersion,
      forceUpdate: false,
      canSkip: false,
      reason: 'Bạn đang ở bản mới nhất.',
    }
  }

  const [curMaj, curMin, curPatch] = parseSemver(currentVersion)
  const [latMaj, latMin, latPatch] = parseSemver(info.latestVersion)
  const forceByMin = info.minSupportedVersion
    ? compareSemver(currentVersion, info.minSupportedVersion) < 0
    : false

  const isPatchOnly = latMaj === curMaj && latMin === curMin && latPatch > curPatch
  const patchGap = isPatchOnly ? (latPatch - curPatch) : Number.MAX_SAFE_INTEGER
  const canSkip = isPatchOnly && patchGap <= 1 && !forceByMin
  const forceByPolicy = Boolean(info.forceUpdate)
  const forceUpdate = forceByPolicy || forceByMin || !canSkip
  const reason = forceByMin
    ? `Bản hiện tại quá cũ (min support: ${info.minSupportedVersion}).`
    : forceByPolicy
      ? 'Bản này được đánh dấu bắt buộc cập nhật.'
      : canSkip
        ? 'Bản vá nhỏ, có thể bỏ qua tạm thời.'
        : 'Bản nâng cấp lớn hoặc lệch nhiều bản vá, không cho bỏ qua.'

  return {
    hasUpdate: true,
    currentVersion,
    latestVersion: info.latestVersion,
    forceUpdate,
    canSkip,
    reason,
    downloadUrl: info.downloadUrl,
    notes: info.notes,
    minSupportedVersion: info.minSupportedVersion,
  }
}
