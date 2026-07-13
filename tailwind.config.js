/**
 * หนึ่งตระกูลสี accent = ชุด token เดียวกันเสมอ
 * (พื้น: DEFAULT/fill/dark/on-fill · หมึก: ink · chip: 50-300 / 700-900)
 */
const accentFamily = (name) => ({
  DEFAULT: `rgb(var(--c-${name}) / <alpha-value>)`,
  fill: `rgb(var(--c-${name}-fill) / <alpha-value>)`,
  dark: `rgb(var(--c-${name}-dark) / <alpha-value>)`,
  'on-fill': `rgb(var(--c-${name}-on-fill) / <alpha-value>)`,
  ink: `rgb(var(--c-${name}-ink) / <alpha-value>)`,
  50: `rgb(var(--c-${name}-50) / <alpha-value>)`,
  100: `rgb(var(--c-${name}-100) / <alpha-value>)`,
  200: `rgb(var(--c-${name}-200) / <alpha-value>)`,
  300: `rgb(var(--c-${name}-300) / <alpha-value>)`,
  700: `rgb(var(--c-${name}-700) / <alpha-value>)`,
  800: `rgb(var(--c-${name}-800) / <alpha-value>)`,
  900: `rgb(var(--c-${name}-900) / <alpha-value>)`,
});

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
        // กระเบื้องรองโลโก้ธนาคาร — ขาวทั้งสองโหมด (ดู src/index.css)
        logo: 'rgb(var(--bg-logo) / <alpha-value>)',
        // hero กลับด้าน (มืดทั้งสองโหมด)
        inverse: {
          DEFAULT: 'rgb(var(--bg-inverse) / <alpha-value>)',
          fg: 'rgb(var(--inverse-fg) / <alpha-value>)',
          muted: 'rgb(var(--inverse-muted) / <alpha-value>)',
          dim: 'rgb(var(--inverse-dim) / <alpha-value>)',
        },
        // accent — สองบทบาทต่อหนึ่งแบรนด์สี (ดูคำอธิบายใน src/index.css)
        //   DEFAULT / fill / dark / on-fill = "พื้น" ค่าไม่ขยับข้ามโหมด
        //   ink                             = "หมึก" สว่างขึ้นในโหมดมืด
        //   50–300 / 700–900                = chip (พื้น / ตัวหนังสือ) กลับด้านในโหมดมืด
        primary: accentFamily('primary'),
        income: accentFamily('income'),
        expense: {
          ...accentFamily('expense'),
          'on-fill': {
            DEFAULT: 'rgb(var(--c-expense-on-fill) / <alpha-value>)',
            100: 'rgb(var(--c-expense-on-fill-100) / <alpha-value>)',
          },
        },
        warning: accentFamily('warning'),
        net: accentFamily('net'),
        // savings ใช้ค่าชุดเดียวกับ warning (amber) — คนละชื่อ คนละความหมายในโดเมน
        savings: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          ink: 'rgb(var(--c-warning-ink) / <alpha-value>)',
        },
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
