declare module 'expo-crypto' {
  export const CryptoDigestAlgorithm: {
    SHA256: string
  }
  export const CryptoEncoding: {
    HEX: string
  }
  export function digestStringAsync(
    algorithm: string,
    data: string,
    options?: { encoding?: string }
  ): Promise<string>
}
