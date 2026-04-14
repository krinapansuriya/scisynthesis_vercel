/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          darkest: '#1a1208',
          deep: '#3b2a13',
          mid: '#8a6a2b',
          light: '#c9a24a',
          highlight: '#f5d37a',
        },
        darkBg: '#1a1208', 
        darkCard: 'rgba(26, 18, 8, 0.4)',
        primaryBlue: '#c9a24a', 
        primaryPurple: '#8a6a2b',
        textMain: '#f5d37a',
        textMuted: '#8a6a2b',
        borderDark: 'rgba(201, 162, 74, 0.2)'
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'pulse-slow': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'wave 15s ease-in-out infinite',
        'wave-slow': 'wave 25s ease-in-out infinite',
        'float': 'float 10s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        wave: {
          '0%, 100%': { transform: 'translateX(0) translateY(0) rotate(0deg)' },
          '33%': { transform: 'translateX(-2%) translateY(1%) rotate(0.5deg)' },
          '66%': { transform: 'translateX(2%) translateY(-1%) rotate(-0.5deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '50%': { transform: 'translateY(-20px) translateX(10px)' },
        }
      }
    },
  },
  plugins: [],
}
