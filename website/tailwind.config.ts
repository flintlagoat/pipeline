import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070710',
          900: '#0B0B16',
          850: '#101020',
          800: '#15152a',
          700: '#1d1d38',
          600: '#2a2a4a',
        },
        quill: {
          400: '#8b8bf5',
          500: '#6d6df0',
          600: '#5a52d6',
        },
        gold: {
          300: '#f2d08a',
          400: '#e8b84b',
          500: '#d99f2b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      maxWidth: {
        content: '1120px',
      },
    },
  },
  plugins: [],
};

export default config;
