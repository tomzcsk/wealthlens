# F46 — Dark Mode (ชั้นสีของทั้งแอป)

**วันที่:** 2026-07-13
**สถานะ:** design approved — รอ plan
**Phase:** 5 (งานที่ 1 จาก 3: dark mode → mobile UX → analytics)

---

## 1. ปัญหา

แอปนี้มีสีเดียว: สว่าง

| ของจริงวันนี้ | จำนวน |
|---|---|
| Tailwind literal สีอ่อนที่ hardcode ในโค้ด | **1,000 จุด / 55 ไฟล์** |
| `dark:` prefix ที่ใช้อยู่ | **0** |
| CSS variable ใน `index.css` | 38 ตัว — **ไม่มี component ตัวไหนใช้เลย** |

บล็อก dark ที่เคยเขียนเผื่อไว้ใน `index.css` ตายมาตั้งแต่แรก:

```css
@media (prefers-color-scheme: dark) {
  :root.dark { ... }   /* ← ซ้อนสองชั้น: ต้องทั้ง OS มืด และมี class .dark ถึงจะติด */
}
```

ไม่มีใครใส่ class `.dark` ให้ `<html>` เลยสักครั้ง → บล็อกนี้ไม่เคยทำงาน

## 2. เป้าหมาย

เปิดโหมดมืดได้ทั้งแอป โดยที่ **โหมดสว่างต้องเหมือนเดิมทุกพิกเซล** และ component ที่จะเขียนใหม่ในอนาคต (mobile polish, analytics) ได้ dark ฟรีโดยไม่ต้องคิดเรื่องสีอีก

**Non-goal:** ไม่ปรับดีไซน์/สเปซซิ่ง/ลำดับชั้นสายตาอะไรทั้งนั้นในงานนี้ งานนี้คือ "เปลี่ยนชั้นสี" ล้วน ๆ ถ้าโหมดสว่างขยับ = แปลงผิด

---

## 3. สถาปัตยกรรม — ชั้น token แหล่งความจริงเดียว

หลักการเดียวกับ `lib/motion.ts` (จังหวะไหว) และ `utils/actionMessages.ts` (ข้อความ): **ค่าจริงอยู่ที่เดียว โค้ดที่เหลืออ้างชื่อ**

```
src/index.css          ← ค่าสีจริงทั้งหมด (:root + :root.dark)
tailwind.config.js     ← ชื่อ token ชี้ไป var()
component              ← อ้างชื่อ token เท่านั้น ไม่รู้จักค่า hex
```

### 3.1 ทำไมไม่เติม `dark:` ทุกจุด

`dark:bg-slate-800` ต่อท้ายทุก class = แก้ 1,000 จุดเหมือนกัน แต่จ่ายราคาตลอดกาล: ทุก component ใหม่ต้องจำเติมเอง ลืมทีเดียวก็หลุด และไม่มีอะไรจับได้ ส่วน token layer แก้ครั้งเดียวจบ — และมี grep gate จับคนที่เผลอถอยหลัง

### 3.2 token ที่มีอยู่แล้ว — เก็บชื่อเดิม เปลี่ยนแค่ค่า

`primary` / `income` / `expense` / `net` / `savings` / `cat-*` มีใน `tailwind.config.js` อยู่แล้ว และ component ใช้ผ่านชื่อ (`text-income`, `bg-primary`) อยู่แล้ว
→ เปลี่ยนค่าจาก hex ตรง ๆ เป็น `var(--color-income)` แล้วสลับค่า var ในโหมดมืด
→ **component เหล่านั้นไม่ต้องแก้แม้แต่บรรทัดเดียว** ได้ dark ฟรี

ในโหมดมืด สี accent ต้องสว่างขึ้นเพื่อให้ contrast ผ่าน — ใช้ตัว `-bar` ที่มีอยู่แล้วเป็นฐาน (income `#34D399`, expense `#F87171`)

### 3.3 token ใหม่ที่ต้องสร้าง — neutral

จำนวนจริงจากการ grep (palette เป็น **slate** ล้วน ไม่มี `gray-*` เลยสักตัว):

| class เดิม | จำนวน | token ใหม่ | light | dark |
|---|---:|---|---|---|
| `bg-white` | 117 | `bg-card` | `#ffffff` | `#1e293b` |
| `bg-slate-50` | 120 | `bg-surface` | `#f8fafc` | `#0f172a` |
| `bg-slate-100` | 25 | `bg-raised` | `#f1f5f9` | `#334155` |
| `text-slate-900` | 153 | `text-body` | `#0f172a` | `#f1f5f9` |
| `text-slate-700` | 163 | `text-dim` | `#334155` | `#cbd5e1` |
| `text-slate-500` | 204 | `text-muted` | `#64748b` | `#94a3b8` |
| `text-slate-400` | 115 | `text-faint` | `#94a3b8` | `#64748b` |
| `border-slate-200` | 153 | `border-subtle` | `#e2e8f0` | `#334155` |

ตัวหนังสือมี **4 ชั้นจริง** ไม่ใช่ 2 — ถ้ายุบเหลือ 2 ลำดับชั้นสายตาของโหมดสว่างจะเปลี่ยน ซึ่งผิดกฎเหล็กข้อ 2

### 3.4 token ใหม่ — พื้นอ่อน (badge/pill)

~100 จุดเป็นพื้น tint อ่อน (`bg-emerald-50` 23, `bg-amber-50` 22, `bg-primary-light` 20, `bg-red-50` 15, …) บนพื้นมืดมันจะเป็นแผ่นสว่างแสบตา ต้องกลายเป็น tint มืด:

| เดิม | token | light | dark |
|---|---|---|---|
| `bg-emerald-50` / `bg-income-light` | `bg-income-soft` | `#ecfdf5` | `rgb(6 78 59 / .35)` |
| `bg-red-50` / `bg-expense-light` | `bg-expense-soft` | `#fef2f2` | `rgb(127 29 29 / .35)` |
| `bg-amber-50` | `bg-warning-soft` | `#fffbeb` | `rgb(120 53 15 / .35)` |
| `bg-primary-light` / `bg-blue-50` | `bg-primary-soft` | `#eff6ff` | `rgb(30 58 138 / .35)` |

---

## 4. ตัวคุมโหมด

### 4.1 `src/lib/theme.ts` — pure ล้วน

ไม่ import React / Zustand / DOM → ทดสอบใน node ล้วนได้ (หลักเดียวกับ `motion.ts`)

```ts
export type ThemeMode = 'light' | 'dark' | 'system';  // สิ่งที่ผู้ใช้เลือก
export type Resolved  = 'light' | 'dark';             // สิ่งที่จอเห็นจริง

resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): Resolved
cycleTheme(mode: ThemeMode): ThemeMode   // system → light → dark → system
```

### 4.2 `src/stores/themeStore.ts` — Zustand + persist

key แยก `wealthlens-theme` (ไม่ปนกับ finance data)

> **โหมดเป็นของเครื่อง ไม่ sync ขึ้น Drive โดยตั้งใจ** — มือถือกลางคืนอยากมืด เดสก์ท็อปกลางวันอยากสว่าง ถ้า sync ข้ามเครื่องมันจะแย่งกันเปลี่ยน และมันไม่ใช่ข้อมูลการเงิน จึงไม่ควรอยู่ใน `wealthlens_data.json`

โหมด `system` ฟัง `matchMedia('(prefers-color-scheme: dark)')` change → OS สลับตอนพระอาทิตย์ตก แอปสลับตาม ไม่ต้อง refresh

### 4.3 กัน FOUC — inline script ใน `index.html`

```html
<script>
  try {
    var m = localStorage.getItem('wealthlens-theme');
    var mode = m ? JSON.parse(m).state.mode : 'system';
    var dark = mode === 'dark' || (mode === 'system' &&
      matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
</script>
```

ต้องรันก่อน bundle โหลด ไม่งั้นเห็นแฟลชขาวทุกครั้งที่ refresh ในโหมดมืด — ไม่มีทางเลี่ยงด้วย React
`try/catch` เพราะ localStorage อาจถูกปิด (โหมดส่วนตัวบางเบราว์เซอร์) — ธีมพังต้องไม่ทำให้แอปไม่ขึ้น

### 4.4 ปุ่ม

ใน `Header.tsx` ข้าง `<SyncStatusIndicator />` — ☀️ สว่าง / 🌙 มืด / 💻 ตามเครื่อง วนสามจังหวะ, `aria-label` บอกโหมดปัจจุบัน

`tailwind.config.js`: `darkMode: 'class'`

---

## 5. กราฟ

`stroke="var(--x)"` **ใช้ไม่ได้** — Recharts ยัดค่าลงเป็น SVG presentation attribute ซึ่งสเปกไม่รับ `var()` ผลคือเส้นหายเงียบ ๆ ไม่มี error ให้เห็น

**`src/lib/chartTheme.ts`** — pure เช่นกัน:

```ts
chartPalette(resolved: Resolved): {
  grid, axis, tooltipBg, tooltipBorder, tooltipText, dotFill
}
```

`useChartTheme()` (hook บาง ๆ อ่านจาก themeStore) → กราฟทั้ง 7 ชุดเลิก hardcode `#94A3B8` (8 จุด), `#E2E8F0` (4), `#FFFFFF` (4)

สีหมวด `cat-*` ทั้ง 8 **คงค่าเดิม** — สดพอจะอ่านออกทั้งสองพื้น แต่ตัวหนังสือใน legend/tooltip ต้องเป็น token

---

## 6. เคสขอบ

| จุด | ทำอะไร | ทำไม |
|---|---|---|
| `/report/:year` (PDF) | **ขาวเสมอ** — `useEffect` ถอด class `dark` ออกจาก `<html>` ตอน mount คืนตอน unmount + ไม่แปลง `PrintReportPage.tsx` | พิมพ์ลงกระดาษขาว พื้นดำกินหมึกและอ่านไม่ออก. ถอด class ที่ `<html>` ไม่ใช่แค่เว้นไฟล์ — เพราะพื้น `<body>` มาจาก token จะยังมืดอยู่ |
| `LoginPage` | gradient สว่าง (`from-slate-50 via-blue-50 to-indigo-50`) → มีคู่มืด | หน้าเดียวที่พื้นเป็น gradient ไม่ใช่ token |
| `BankAvatar` | โลโก้รองด้วย **chip ขาวคงที่ทั้งสองโหมด** + ring `border-subtle` | PNG โลโก้สีเข้ม (CITI/BBL) จมหายบนพื้นมืด. `bg-white` ตรงนี้ตั้งใจ — ใส่ comment กำกับ ไม่งั้นคนมาเก็บกวาดทีหลังเผลอแปลง |
| `GoogleSignInButton` | **ห้ามแตะ** สีแบรนด์ (`#4CAF50`/`#1976D2`/`#FFC107`/`#FF3D00`) | กติกาแบรนด์ Google |

---

## 7. พิสูจน์ว่าไม่พัง

### `scripts/verify-theme.ts` (pure, node ล้วน)
- เมทริกซ์ `resolveTheme` ครบ 6 ช่อง (3 mode × 2 OS)
- `cycleTheme` วนครบวงกลับที่เดิม
- **token ทุกตัวมีค่าครบทั้งสองโหมด** — ขาดตัวเดียว = แดง
- **contrast ratio (WCAG 2.1)** ของ text token ทุกตัว บนพื้นทุกตัว ทั้งสองโหมด:

| token | เกณฑ์ | เหตุผล |
|---|---|---|
| `text-body` / `text-dim` / `text-muted` | **≥ 4.5:1** | ตัวเลขเงินและเนื้อความ — อ่านไม่ออกคือบั๊ก ไม่ใช่รสนิยม |
| `text-faint` | **≥ 2.5:1** | ป้ายกำกับจาง ๆ ไม่ใช่เนื้อความ |
| accent (`income`/`expense`/`primary`) บนพื้น | **≥ 4.5:1** | ตัวเลขบวก/ลบใช้สีนี้ |
| **ทุกคู่** | **dark ≥ light** | ห้ามโหมดมืดอ่านยากกว่าโหมดสว่าง |

> **ทำไม `text-faint` ไม่ใช่ 4.5:** วัดของจริงแล้ว `text-slate-400` บนพื้นขาว = **2.56:1** — วันนี้ก็ไม่ผ่าน 4.5 อยู่แล้ว. จะยกเกณฑ์ต้องแก้สีโหมดสว่าง ซึ่งชนกฎเหล็กข้อ 2 ตรง ๆ. เกณฑ์จึงเป็น "พื้นไม่ต่ำกว่าที่เป็นอยู่ + มืดห้ามแย่กว่าสว่าง" ไม่ใช่ตัวเลขในอุดมคติที่โค้ดวันนี้สอบตกเอง.
> ค่าที่เลือกไว้ผ่านหมด: `text-muted` มืด **5.71:1** (สว่าง 4.76), `text-faint` มืด **3.08:1** (สว่าง 2.56), `income` มืด `#34D399` = **7.64:1**, `expense` มืด `#F87171` = **5.29:1**

### `scripts/verify-no-hardcoded-colors.ts` (grep gate)
`bg-white` / `bg-slate-*` / `text-slate-*` / `border-slate-*` ต้องเหลือ **0 จุด** นอก allowlist:
`PrintReportPage.tsx`, `BankAvatar.tsx`, `GoogleSignInButton.tsx`
→ กันการถอยหลังในอนาคต ไม่ใช่แค่ตรวจงานวันนี้

### UI จริง (Playwright)
- สลับสามจังหวะ → class บน `<html>` เปลี่ยนตาม
- refresh แล้วโหมดคงเดิม + **ไม่มีแฟลชขาว** (จับสีพื้นเฟรมแรก)
- โหมด `system` + OS มืด (`emulateMedia`) → มืดโดยไม่ต้องกดอะไร
- `/report/2025` ขาวแม้แอปอยู่โหมดมืด
- **screenshot ทุกหน้าโหมดสว่าง ก่อน/หลัง ต้องตรงกัน** ← กฎเหล็กข้อ 2

### เดิมต้องไม่พัง
verify ทั้ง 26 ตัว + typecheck + lint + build

---

## 8. สิ่งที่ไม่ทำโดยตั้งใจ

- **ไม่ปรับดีไซน์** — งานนี้เปลี่ยนชั้นสี ไม่ใช่ปรับหน้าตา
- **ไม่ sync ธีมขึ้น Drive** — ดู 4.2
- **ไม่ทำ theme หลายสี** (sepia / high-contrast) — YAGNI. โครง token รองรับอยู่แล้วถ้าวันหนึ่งอยากได้: เพิ่ม class ใหม่บน `<html>` เท่านั้น
