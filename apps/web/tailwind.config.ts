import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── App Palette (Dark Indigo — matches mobile2) ─────────────────────────
      colors: {
        app: {
          bg:        '#08080F',
          surface:   '#0E0E1C',
          surface2:  '#12121E',
          surface3:  '#181828',
          border:    '#1E1E2E',
          border2:   '#2A2A3E',
        },
        accent: {
          DEFAULT: '#6366F1',
          light:   '#818CF8',
          dark:    '#4F46E5',
          muted:   'rgba(99,102,241,0.15)',
        },
        txt: {
          primary:   '#F1F5F9',
          secondary: '#94A3B8',
          muted:     '#475569',
          accent:    '#818CF8',
        },
        status: {
          online:  '#22C55E',
          danger:  '#EF4444',
          warn:    '#F59E0B',
        },
      },
      // ── Font ────────────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      // ── Shadows ─────────────────────────────────────────────────────────────
      boxShadow: {
        'accent': '0 0 12px rgba(99,102,241,0.4)',
        'accent-sm': '0 0 6px rgba(99,102,241,0.3)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
      },
      // ── Border radius ───────────────────────────────────────────────────────
      borderRadius: {
        'app': '12px',
        'app-sm': '8px',
        'app-xs': '6px',
      },
    },
  },
  plugins: [],
} satisfies Config
