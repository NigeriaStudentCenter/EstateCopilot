/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ochre: {
          50: '#fbeee2',
          100: '#f6ddc4',
          500: '#b4530e',
          600: '#9c470b',
          700: '#7f3a09',
        },
        moss: { 600: '#0a7d3b', 700: '#075f2d' },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
