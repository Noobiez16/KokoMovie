/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        km: {
          bg: 'rgb(var(--km-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--km-surface-rgb) / <alpha-value>)',
          'surface-2': 'rgb(var(--km-surface-2-rgb) / <alpha-value>)',
          surface2: 'rgb(var(--km-surface-2-rgb) / <alpha-value>)',
          card: 'rgb(var(--km-surface-rgb) / <alpha-value>)',
          border: 'rgb(var(--km-border-rgb) / <alpha-value>)',
          accent: 'rgb(var(--km-accent-rgb) / <alpha-value>)',
          'accent-hover': 'rgb(var(--km-accent-hover-rgb) / <alpha-value>)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
