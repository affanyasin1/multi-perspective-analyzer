/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: '#faf7f1',
        ink: '#1c1a17',
        muted: '#6b6459',
        line: '#ddd5c7',
        accent: '#8b1e1e',
        gold: '#b98a2f',
      },
    },
  },
  plugins: [],
};
