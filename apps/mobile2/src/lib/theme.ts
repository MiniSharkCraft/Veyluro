export const darkTheme = {
  bg: '#000000',
  surface: '#1F1F1F',
  surface2: '#2C2C2E',
  text: '#F8FAFC',
  muted: '#B3B3B8',
  faint: '#77777E',
  border: '#202024',
  accent: '#0A84FF',
  accentSoft: '#102C4D',
  green: '#22C55E',
  shadow: 'rgba(0,0,0,0.28)',
}

export const lightTheme = {
  bg: '#FFFFFF',
  surface: '#F1F2F4',
  surface2: '#E7E9EE',
  text: '#09090B',
  muted: '#60646C',
  faint: '#8A8F98',
  border: '#E5E7EB',
  accent: '#0A84FF',
  accentSoft: '#E8F2FF',
  green: '#16A34A',
  shadow: 'rgba(15,23,42,0.10)',
}

export type AppTheme = typeof darkTheme

export function getTheme(scheme: 'light' | 'dark' | null | undefined): AppTheme {
  return scheme === 'light' ? lightTheme : darkTheme
}
