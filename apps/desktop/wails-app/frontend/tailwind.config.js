/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neon: {
          cyan:    '#00FFFF',
          magenta: '#FF00FF',
          green:   '#39FF14',
          yellow:  '#FFE600',
          orange:  '#FF6700',
        },
        dark: {
          900: '#050508',
          800: '#0D0D14',
          700: '#12121C',
          600: '#1A1A28',
          500: '#242436',
          400: '#2E2E48',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Menlo', 'monospace'],
        sans: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'neon-cyan':    '0 0 8px #00FFFF, 0 0 20px rgba(0,255,255,0.3)',
        'neon-magenta': '0 0 8px #FF00FF, 0 0 20px rgba(255,0,255,0.3)',
        'neon-green':   '0 0 8px #39FF14, 0 0 20px rgba(57,255,20,0.3)',
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
      borderRadius: { cyber: '2px' },
    },
  },
  plugins: [],
}
