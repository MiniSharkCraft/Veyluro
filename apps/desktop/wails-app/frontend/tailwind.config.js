/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#08080F',
          surface: '#0E0E1C',
          surface2: '#12121E',
          surface3: '#181828',
          border: '#1E1E2E',
          border2: '#2A2A3E',
        },
        accent: {
          DEFAULT: '#6366F1',
          light: '#818CF8',
          dark: '#4F46E5',
          muted: 'rgba(99,102,241,0.15)',
        },
        txt: {
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          muted: '#475569',
          accent: '#818CF8',
        },
        status: {
          online: '#22C55E',
          danger: '#EF4444',
          warn: '#F59E0B',
        },
        neon: {
          cyan:    '#818CF8',
          magenta: '#EC4899',
          green:   '#22C55E',
          yellow:  '#F59E0B',
          orange:  '#FF6700',
        },
        dark: {
          900: '#08080F',
          800: '#0E0E1C',
          700: '#12121E',
          600: '#181828',
          500: '#1E1E2E',
          400: '#2A2A3E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 0 1px rgba(129,140,248,0.24), 0 12px 32px rgba(0,0,0,0.32)',
        'neon-magenta': '0 0 0 1px rgba(236,72,153,0.20), 0 12px 32px rgba(0,0,0,0.32)',
        'neon-green': '0 0 0 1px rgba(34,197,94,0.20), 0 12px 32px rgba(0,0,0,0.32)',
        accent: '0 0 12px rgba(99,102,241,0.35)',
        card: '0 4px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
        'blink':      'blink 1s step-end infinite',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.6' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0' },
        },
      },
      borderRadius: { cyber: '8px', app: '12px', 'app-sm': '8px', 'app-xs': '6px' },
    },
  },
  plugins: [],
}
