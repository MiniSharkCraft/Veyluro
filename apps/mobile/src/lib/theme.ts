export const darkTheme = {
  bg: '#060D16',
  surface: '#101A27',
  surface2: '#152235',
  text: '#EAF4FF',
  muted: '#9AB0C8',
  faint: '#6D8298',
  border: '#21344A',
  accent: '#20C7B3',
  accentSoft: '#123A3A',
  accentGold: '#E7B65C',
  green: '#22C55E',
  shadow: 'rgba(0,0,0,0.28)',
}

export const lightTheme = {
  bg: '#F2F8FC',
  surface: '#FFFFFF',
  surface2: '#E8F1F7',
  text: '#0D1A2B',
  muted: '#5A738D',
  faint: '#7D95AB',
  border: '#D2E0EC',
  accent: '#0FA79A',
  accentSoft: '#D5F2EE',
  accentGold: '#B8872E',
  green: '#16A34A',
  shadow: 'rgba(15,23,42,0.10)',
}

export type AppTheme = typeof darkTheme

export function getTheme(scheme: 'light' | 'dark' | null | undefined): AppTheme {
  return scheme === 'light' ? lightTheme : darkTheme
}
