/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#F97316',
        primaryDark: '#EA580C',
        navy: '#283A7A',
        navyDark: '#1E2B5C',
        background: '#FFFFFF',
        surface: '#F4F5F7',
        border: '#E4E7EC',
        textPrimary: '#1A1D29',
        textMuted: '#667085',
        success: '#16A34A',
        danger: '#DC2626',
      },
    },
  },
  plugins: [],
};
