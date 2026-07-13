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

### 3.3 var ต้องเก็บเป็น "เลขช่องสี" ไม่ใช่ hex

ในโค้ดมี `bg-white/60`, `bg-white/10`, `bg-slate-50/40`, `bg-slate-100/70`, `bg-slate-900/50` — คือสีที่มี **opacity modifier**

ถ้าเก็บ var เป็น hex (`--bg-card: #ffffff`) แล้วเขียน `bg-card/60` มันจะ **ไม่ทำงานและไม่ error** (Tailwind ประกอบ alpha ไม่ได้ ได้สีทึบออกมา) จึงต้อง:

```css
:root { --bg-card: 255 255 255; }          /* เลขช่องสี ไม่ใช่ hex */
```
```js
colors: { card: 'rgb(var(--bg-card) / <alpha-value>)' }
```

### 3.4 neutral: ramp กลาง `ink-*` (ไม่ใช่ token ความหมาย 4 ตัว)

inventory จริง — ตัวหนังสือใช้ **8 ชั้น** ไม่ใช่ 4 (palette เป็น slate ล้วน ไม่มี `gray-*` เลยสักตัว):

`text-slate-` 500(204) · 700(158) · 900(146) · 400(110) · 600(67) · 300(9) · 800(8) · 200(1)

กฎเหล็กข้อ 2 (สว่างเหมือนเดิมทุกพิกเซล) **ห้ามยุบ 600 กับ 700 เข้าด้วยกัน** — มันคนละสีที่ตาเห็นต่าง จึงใช้ **ramp กลางที่ค่าโหมดสว่าง = ค่า slate เป๊ะทุกขั้น** แล้วพลิกในโหมดมืด. ramp เดียวนี้ใช้ได้ทั้ง text และ border:

| token | light (= slate เดิม) | dark | ใช้แทน |
|---|---|---|---|
| `ink-900` | `#0f172a` | `#f8fafc` | `text-slate-900` (146) |
| `ink-800` | `#1e293b` | `#f1f5f9` | `text-slate-800` (8) |
| `ink-700` | `#334155` | `#e2e8f0` | `text-slate-700` (158) |
| `ink-600` | `#475569` | `#cbd5e1` | `text-slate-600` (67) |
| `ink-500` | `#64748b` | `#94a3b8` | `text-slate-500` (204) |
| `ink-400` | `#94a3b8` | `#64748b` | `text-slate-400` (110) |
| `ink-300` | `#cbd5e1` | `#475569` | `text-slate-300` (9), `border-slate-300` (62) |
| `ink-200` | `#e2e8f0` | `#334155` | `border-slate-200` (153) |
| `ink-100` | `#f1f5f9` | `#28354a` | `border-slate-100` (24), `divide-slate-100` (11) |

การพลิก **ไม่ใช่การกลับด้านตรง ๆ** — เลือกค่าแล้ววัด contrast จริงทุกขั้น (ดู §7)

> **ทำไม `ink-100` มืดถึงเป็น `#28354a` ไม่ใช่ `#1e293b` (slate-800):** การกลับด้านตรง ๆ จะได้ `#1e293b` ซึ่ง **เท่ากับสีการ์ดในโหมดมืดเป๊ะ** → contrast 1.00 → เส้นคั่นในตารางหายสนิท. `#28354a` ให้ 1.18 บนการ์ด (โหมดสว่างได้ 1.10) — จาง ๆ พอกัน แต่ยังเห็น

### 3.5 surface: แยก `bg-surface` กับ `bg-hover` แม้ค่าโหมดสว่างจะเท่ากัน

| token | light | dark | ใช้แทน |
|---|---|---|---|
| `bg-card` | `#ffffff` | `#1e293b` | `bg-white` (115, รวม `/60` `/10`) |
| `bg-surface` | `#f8fafc` | `#0f172a` | `bg-slate-50` (45, รวม `/40` `/60`) — พื้นหน้า/แผงยุบ |
| `bg-hover` | `#f8fafc` | `#334155` | `hover:bg-slate-50` (68) + `focus:` (2) + `disabled:` (2) |
| `bg-raised` | `#f1f5f9` | `#334155` | `bg-slate-100` (18, รวม `/70`) + `hover:bg-slate-100` (6) |
| `bg-track` | `#e2e8f0` | `#475569` | `bg-slate-200` (11) — รางของ progress bar |

> **`bg-surface` กับ `bg-hover` ค่าโหมดสว่างเท่ากันเป๊ะ แต่ต้องแยก token** — `hover:bg-slate-50` อยู่บนการ์ดขาว: โหมดสว่าง hover แล้ว **มืดลง** โหมดมืด hover ต้อง **สว่างขึ้น** ถ้าใช้ token เดียวกัน hover ในโหมดมืดจะกลายเป็นหลุมดำบนการ์ด

### 3.6 tint (badge/pill)

~100 จุดเป็นพื้น tint อ่อน (`bg-emerald-50` 23, `bg-amber-50` 22, `bg-primary-light` 20, `bg-red-50` 15, …) บนพื้นมืดมันจะเป็นแผ่นสว่างแสบตา:

| เดิม | token | light | dark |
|---|---|---|---|
| `bg-emerald-50` / `bg-income-light` | `bg-income-soft` | `#ecfdf5` | `rgb(6 78 59 / .35)` |
| `bg-red-50` / `bg-expense-light` | `bg-expense-soft` | `#fef2f2` | `rgb(127 29 29 / .35)` |
| `bg-amber-50` / `bg-amber-100` | `bg-warning-soft` | `#fffbeb` | `rgb(120 53 15 / .35)` |
| `bg-primary-light` / `bg-blue-50` | `bg-primary-soft` | `#eff6ff` | `rgb(30 58 138 / .35)` |

### 3.6b accent: หนึ่งสีแบรนด์ สองบทบาท (แก้ระหว่างทาง — สำคัญที่สุดในงานนี้)

พบตอนไล่ codemod: `--color-primary` ถูกใช้สองบทบาทที่**ต้องการค่าตรงข้ามกันในโหมดมืด**

| บทบาท | ตัวอย่าง | จำนวน | ต้องการอะไรในโหมดมืด |
|---|---|---:|---|
| **พื้นปุ่ม** (มี `text-white` ทับ) | `bg-primary text-white` | 38 | **เข้มเท่าเดิม** — ถ้าสว่างขึ้น ตัวหนังสือขาวจะอ่านไม่ออก |
| **หมึกบนการ์ด** | `text-primary`, `border-primary` | 54 + 88 | **สว่างขึ้น** — ถ้าเข้มเท่าเดิมจะจมพื้นการ์ดมืด |

รอบแรกทำให้ `--color-primary` สว่างขึ้นในโหมดมืด → **ปุ่มหลักทั้งแอปกลายเป็นฟ้าอ่อนตัวหนังสือขาว** นี่คือบั๊กที่ต้องแก้ ไม่ใช่รสนิยม

**ทางออก: แยกชื่อตามบทบาท** (ทำกับทั้ง 5 ตระกูล: `primary`←blue, `income`←emerald, `expense`←red+rose, `warning`←amber, `net`←violet)

| token | ใช้กับ | light | dark |
|---|---|---|---|
| `<f>` (DEFAULT) | `bg-*` พื้นปุ่ม | สี 600 เดิม | **เท่าเดิม** |
| `<f>-fill` | `bg-*-500` แถบ progress | สี 500 เดิม | **เท่าเดิม** |
| `<f>-dark` | `hover:bg-*-700` | สี 700 เดิม | **เท่าเดิม** |
| `<f>-ink` | `text-*`, `border-*`, `ring-*` บนการ์ด | สี 600 เดิม (**ไม่ขยับ**) | สี 400 (สว่าง) |
| `<f>-{50,100,200,300}` | พื้น/ขอบ chip | สี Tailwind เดิม | พลิก (→ 900/800/700/600) |
| `<f>-{700,800,900}` | ตัวหนังสือใน chip | สี Tailwind เดิม | พลิก (→ 200/100/50) |

จุดสวยของมัน: **สี 600 ของ Tailwind = สีแบรนด์เดิมพอดีทุกตระกูล** (`emerald-600` = `#059669` = income เป๊ะ, `red-600` = expense, `blue-600` = primary, `violet-600` = net, `amber-600` = savings/warning) → `text-emerald-600` แปลงเป็น `text-income-ink` แล้ว**โหมดสว่างไม่ขยับแม้แต่บิตเดียว**

`rose-*` (6 จุด) ยุบเข้า `expense-*` — มันคือสีเดียวกันในความหมาย (ค่าลบ/เกินงบ) ที่โค้ดเดิมเผลอใช้ 2 ตระกูลปนกัน
`violet-*` = ตระกูล `net` (Dime/ลงทุน)

### 3.6c hero สีเข้ม: `inverse` (กับดักที่จะทำตัวหนังสือหายทั้งบล็อก)

`MonthlyPage` และ `BankAccountsPage` มี hero ที่**เข้มอยู่แล้วในโหมดสว่าง** (`bg-slate-900 text-white`) ข้างในมี `text-slate-300` / `text-slate-200` / `text-emerald-300`

ถ้า ramp `ink-*` พลิกตามปกติ ตัวหนังสือพวกนี้จะกลายเป็น**สีเข้มบนพื้นเข้ม = หายสนิท**

| token | light | dark | ใช้แทน |
|---|---|---|---|
| `bg-inverse` | `#0f172a` | `#0f172a` | `bg-slate-900` (hero, ไม่ใช่ฉากหลัง Modal) |
| `text-inverse-muted` | `#cbd5e1` | `#cbd5e1` | `text-slate-300` / `text-slate-200` **ที่อยู่ใน hero** |

`text-*-300` ของ accent ที่อยู่ใน hero (`text-emerald-300` ฯลฯ) → `text-<f>-on-fill` ค่าเดียวสองโหมด

### 3.7 สิ่งที่ "ค้างสีเดิม" โดยตั้งใจ (ไม่แปลง)

| class | จำนวน | เหตุผล |
|---|---:|---|
| `text-white` | 56 | อยู่บนปุ่มสีเข้ม (primary/danger) — ถูกทั้งสองโหมดอยู่แล้ว |
| `bg-slate-900/50` · `/40` | 2 | ฉากหลัง Modal — ต้องมืดทั้งสองโหมดอยู่แล้ว → `bg-overlay` (ค่าเดียวสองโหมด) |

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

วัดทุก token บนพื้นทั้งสอง (`bg-card`, `bg-surface`) ทั้งสองโหมด แล้วบังคับ 4 กฎ:

| # | กฎ | จับอะไร |
|---|---|---|
| **R1** | token ทุกตัวมีค่าครบทั้งสองโหมด | เพิ่ม token ใหม่แล้วลืมใส่ค่าโหมดมืด |
| **R2** | ชั้นเนื้อความ `ink-500`…`ink-900` **≥ 4.5:1** | ตัวเลขเงินอ่านไม่ออก |
| **R3** | ชั้นจาง `ink-400` **≥ 2.4:1** · ชั้นเส้น `ink-100`…`ink-300` **> 1.05:1** | เส้นคั่น/ขอบการ์ดกลืนหายไปกับพื้น |
| **R4** | ทุกคู่ที่ **โหมดสว่างได้ต่ำกว่า 7:1** → โหมดมืดต้อง **≥ โหมดสว่าง** | โหมดมืดอ่านยากกว่าโหมดสว่าง ในช่วงที่ยังพอมีความเสี่ยง |

**ทำไมเกณฑ์ไม่ใช่ 4.5 ทั้งกระดาน:** วัดของจริงแล้วโค้ดวันนี้เองยังไม่ผ่าน — `text-slate-400` บนขาว = **2.56:1**, `text-income` บนขาว = **3.77:1** จะยกเกณฑ์ต้องแก้สีโหมดสว่าง ซึ่งชนกฎเหล็กข้อ 2 ตรง ๆ เกณฑ์จึงเป็น *"ไม่แย่กว่าที่เป็นอยู่"* ไม่ใช่ตัวเลขในอุดมคติที่ของเดิมสอบตกเอง

**ทำไม R4 ตัดที่ 7:1:** `ink-900` สว่าง 17.85 / มืด 13.98 — ถ้าบังคับ "มืด ≥ สว่าง" ดื้อ ๆ มันจะแดงทั้งที่ 13.98:1 สบายเกินพอทุกมาตรฐาน กฎนี้มีไว้คุมช่วงที่คับ ไม่ใช่ช่วงที่เหลือเฟือ

ค่าที่เลือกผ่านครบทั้ง 4 กฎ (วัดบน `bg-card`):

| | สว่าง | มืด | |
|---|---|---|---|
| `ink-500` (เนื้อความหลัก, 204 จุด) | 4.76 | **5.71** | ✓ |
| `ink-400` (ป้ายจาง) | 2.56 | **3.07** | ✓ |
| `ink-100` (เส้นคั่น) | 1.10 | **1.18** | ✓ |
| `income` | 3.77 | **7.61** | ✓ |
| `expense` | 4.83 | **5.29** | ✓ |

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
