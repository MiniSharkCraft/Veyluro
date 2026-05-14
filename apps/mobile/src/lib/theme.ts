export const darkTheme = {
  bg: '#070B12',
  surface: '#121A24',
  surface2: '#1A2430',
  text: '#E6F1FF',
  muted: '#98A9BD',
  faint: '#6C7D91',
  border: '#1E2A39',
  accent: '#14B8A6',
  accentSoft: '#103236',
  green: '#22C55E',
  shadow: 'rgba(0,0,0,0.28)',
}

export const lightTheme = {
  bg: '#F4F8FB',
  surface: '#FFFFFF',
  surface2: '#E9F0F5',
  text: '#0B1220',
  muted: '#5A6B80',
  faint: '#8090A3',
  border: '#D7E0EA',
  accent: '#0F766E',
  accentSoft: '#D7F2EE',
  green: '#16A34A',
  shadow: 'rgba(15,23,42,0.10)',
}

export type AppTheme = typeof darkTheme

export function getTheme(scheme: 'light' | 'dark' | null | undefined): AppTheme {
  return scheme === 'light' ? lightTheme : darkTheme
}
