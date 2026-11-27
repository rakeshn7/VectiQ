/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#090d16',
          secondary: '#0f172a',
          surface: '#131c31',
          elevated: '#1a243d',
        },
        border: {
          DEFAULT: '#1e293b',
          subtle: '#172033',
          glow: '#38bdf826',
        },
        accent: {
          cyan: '#38bdf8',
          violet: '#a855f7',
          emerald: '#10b981',
          amber: '#f59e0b',
        },
        text: {
          primary: '#f8fafc',
          secondary: '#cbd5e1',
          muted: '#94a3b8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -5px rgba(56, 189, 248, 0.25)',
        'glow-violet': '0 0 25px -5px rgba(168, 85, 247, 0.25)',
      }
    },
  },
  plugins: [],
}
