/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        thai: ['Noto Sans Thai', 'Inter', 'sans-serif'],
        mono: ['Inter', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Brand
        primary: {
          DEFAULT: '#2563EB',
          light: '#EFF6FF',
          dark: '#1D4ED8',
        },
        // Income (positive)
        income: {
          DEFAULT: '#059669',
          light: '#ECFDF5',
          bar: '#34D399',
        },
        // Expense (negative)
        expense: {
          DEFAULT: '#DC2626',
          light: '#FEF2F2',
          bar: '#F87171',
        },
        // Net & Savings
        net: '#7C3AED',
        savings: '#D97706',
        // Semantic
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
        // Expense category palette (Pie chart)
        cat: {
          housing: '#6366F1',
          vehicle: '#8B5CF6',
          utilities: '#06B6D4',
          subscription: '#F59E0B',
          finance: '#EF4444',
          entertainment: '#EC4899',
          savings: '#10B981',
          other: '#6B7280',
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
