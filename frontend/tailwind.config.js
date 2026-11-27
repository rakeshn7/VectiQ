/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#FAF9F6',
          secondary: '#F3F1EC',
          surface: '#FFFFFF',
          elevated: '#EEECE5',
        },
        border: {
          DEFAULT: '#E2DFD7',
          subtle: '#ECEAE3',
          strong: '#CBD5E1',
          glow: 'rgba(62, 92, 138, 0.2)',
        },
        brand: {
          navy: '#1B2E4B',
          navyHover: '#243D63',
          slate: '#3E5C8A',
          teal: '#0F766E',
          tealLight: '#F0FDFA',
        },
        accent: {
          cyan: '#3E5C8A',
          violet: '#0F766E',
          emerald: '#047857',
          amber: '#B45309',
        },
        text: {
          primary: '#132033',
          secondary: '#475569',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'editorial-sm': '0 1px 2px rgba(19, 32, 51, 0.04), 0 1px 3px rgba(19, 32, 51, 0.03)',
        'editorial-md': '0 4px 16px -2px rgba(19, 32, 51, 0.06), 0 2px 6px -1px rgba(19, 32, 51, 0.04)',
        'editorial-lg': '0 12px 32px -4px rgba(19, 32, 51, 0.08), 0 4px 12px -2px rgba(19, 32, 51, 0.04)',
      },
    },
  },
  plugins: [],
};
