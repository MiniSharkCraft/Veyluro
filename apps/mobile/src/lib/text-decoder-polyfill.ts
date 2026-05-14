const NativeTextDecoder = globalThis.TextDecoder

const normalizeEncoding = (encoding?: string) =>
  String(encoding || 'utf-8')
    .trim()
    .toLowerCase()
    .replace('_', '-')

const isUtf16Le = (encoding?: string) => {
  const normalized = normalizeEncoding(encoding)
  return (
    normalized === 'utf-16le' ||
    normalized === 'utf16le' ||
    normalized === 'ucs-2' ||
    normalized === 'ucs2'
  )
}

const toUint8Array = (input?: BufferSource): Uint8Array => {
  if (!input) return new Uint8Array()
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
}

const decodeUtf16Le = (input?: BufferSource) => {
  const bytes = toUint8Array(input)
  let start = 0
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) start = 2

  let out = ''
  const chunkSize = 8192
  for (let i = start; i + 1 < bytes.length; i += chunkSize * 2) {
    const end = Math.min(bytes.length - ((bytes.length - i) % 2), i + chunkSize * 2)
    const codes: number[] = []
    for (let j = i; j + 1 < end; j += 2) {
      const code = bytes[j] | (bytes[j + 1] << 8)
      if (code === 0) break
      codes.push(code)
    }
    out += String.fromCharCode(...codes)
  }
  return out
}

class TextDecoderWithUtf16Le {
  private readonly decoder?: TextDecoder
  readonly encoding: string
  readonly fatal: boolean
  readonly ignoreBOM: boolean

  constructor(encoding = 'utf-8', options?: TextDecoderOptions) {
    this.encoding = normalizeEncoding(encoding)
    this.fatal = Boolean(options?.fatal)
    this.ignoreBOM = Boolean(options?.ignoreBOM)
    if (!isUtf16Le(encoding)) {
      this.decoder = NativeTextDecoder ? new NativeTextDecoder(encoding, options) : undefined
    }
  }

  decode(input?: BufferSource, options?: TextDecodeOptions) {
    if (isUtf16Le(this.encoding)) return decodeUtf16Le(input)
    if (!this.decoder) {
      throw new RangeError(`Unknown encoding: ${this.encoding} (normalized: ${this.encoding})`)
    }
    return this.decoder.decode(input, options)
  }
}

if (NativeTextDecoder) {
  try {
    new NativeTextDecoder('utf-16le')
  } catch {
    ;(globalThis as typeof globalThis & { TextDecoder: typeof TextDecoder }).TextDecoder =
      TextDecoderWithUtf16Le as unknown as typeof TextDecoder
  }
}

export {}
