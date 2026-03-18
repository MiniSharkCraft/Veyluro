/**
 * Server-side password hashing — client gửi thẳng password qua HTTPS.
 * Server tự Argon2id hash. Client không cần hash.
 */

export interface Argon2Options {
  memorySize?: number
  iterations?: number
  parallelism?: number
  hashLength?: number
}

// Pass-through — server does all hashing
export const hashArgon2 = async (password: string, _opts?: Argon2Options): Promise<string> =>
  password

export const verifyArgon2 = async (password: string, hash: string): Promise<boolean> =>
  password === hash

export const sha256Hex = async (input: string): Promise<string> => {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
