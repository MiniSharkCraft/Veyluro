const EMOTICON_RULES: Array<[RegExp, string]> = [
  [/=\)\)/g, '😂'],
  [/:\)\)/g, '😆'],
  [/:'\(/g, '😢'],
  [/;\)/g, '😉'],
  [/:d/gi, '😄'],
  [/:p/gi, '😛'],
  [/:v/gi, '😛'],
  [/:0/gi, '😮'],
  [/:3/g, '😺'],
  [/:\)/g, '🙂'],
  [/:\(/g, '🙁'],
]

export function normalizeEmoticons(input: string): string {
  let output = input
  for (const [pattern, emoji] of EMOTICON_RULES) {
    output = output.replace(pattern, emoji)
  }
  return output
}
