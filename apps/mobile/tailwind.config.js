/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neon: {
          cyan:    '#00FFFF',
          magenta: '#FF00FF',
          green:   '#39FF14',
          yellow:  '#FFE600',
        },
        dark: {
          900: '#050508',
          800: '#0D0D14',
          700: '#12121C',
          400: '#2E2E48',
        },
      },
      fontFamily: {
        mono: ['JetBrainsMono'],
      },
    },
  },
  plugins: [],
}
