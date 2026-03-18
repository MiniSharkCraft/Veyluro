/**
 * Mobile stub — không dùng hash-wasm/WASM trên React Native.
 * Metro tự pick file này (.native.ts) thay vì argon2.ts trên RN.
 * Password gửi thẳng qua HTTPS — server tự Argon2id hash server-side.
 */

export interface Argon2Options {
  memorySize?: number
  iterations?: number
  parallelism?: number
  hashLength?: number
}

// On mobile: pass through — server does all Argon2id hashing
export const hashArgon2 = async (password: string, _opts?: Argon2Options): Promise<string> =>
  password

export const verifyArgon2 = async (password: string, hash: string): Promise<boolean> =>
  password === hash

// SHA-256 via expo-crypto (no WASM needed)
export const sha256Hex = async (input: string): Promise<string> => {
  const Crypto = await import('expo-crypto')
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.HEX }
  )
}
