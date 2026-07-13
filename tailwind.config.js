/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        thai: ['Noto Sans Thai', 'Inter', 'sans-serif'],
        mono: ['Inter', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ramp กลาง (text + border) — F46
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
        },
        // พื้น
        card: 'rgb(var(--bg-card) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        raised: 'rgb(var(--bg-raised) / <alpha-value>)',
        track: 'rgb(var(--bg-track) / <alpha-value>)',
        overlay: 'rgb(var(--bg-overlay) / <alpha-value>)',
        // accent
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
          dark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
        },
        income: {
          DEFAULT: 'rgb(var(--color-income) / <alpha-value>)',
          light: 'rgb(var(--color-income-light) / <alpha-value>)',
          bar: 'rgb(var(--color-income-bar) / <alpha-value>)',
        },
        expense: {
          DEFAULT: 'rgb(var(--color-expense) / <alpha-value>)',
          light: 'rgb(var(--color-expense-light) / <alpha-value>)',
          bar: 'rgb(var(--color-expense-bar) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          light: 'rgb(var(--color-warning-light) / <alpha-value>)',
        },
        net: 'rgb(var(--color-net) / <alpha-value>)',
        savings: 'rgb(var(--color-savings) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        cat: {
          housing: 'rgb(var(--cat-housing) / <alpha-value>)',
          vehicle: 'rgb(var(--cat-vehicle) / <alpha-value>)',
          utilities: 'rgb(var(--cat-utilities) / <alpha-value>)',
          subscription: 'rgb(var(--cat-subscription) / <alpha-value>)',
          finance: 'rgb(var(--cat-finance) / <alpha-value>)',
          entertainment: 'rgb(var(--cat-entertainment) / <alpha-value>)',
          savings: 'rgb(var(--cat-savings) / <alpha-value>)',
          other: 'rgb(var(--cat-other) / <alpha-value>)',
        },
      },
      fontSize: {
        // Type scale (UXUI.md section 3)
        display: ['2.25rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'number-xl': ['2rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'number-lg': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
