import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#0f766e',
          mid: '#0d9488',
          lt: '#14b8a6',
        },
        slate: {
          dk: '#0f172a',
          DEFAULT: '#1e293b',
          mid: '#334155',
        },
      },
    },
  },
  plugins: [],
};

export default config;
