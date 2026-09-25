# Sidebar หุบ/เปิด (icon rail)

> Spec · 2026-09-25 · Phase post-ship · desktop-only

## ปัญหา / ที่มา

Sidebar เดสก์ท็อปเป็น rail ตายตัว 240px (`Sidebar.tsx`, `Layout.tsx` grid
`md:grid-cols-[240px_1fr]`). Tom อยากหุบให้แคบเพื่อได้พื้นที่เนื้อหามากขึ้น แล้วเปิดกลับได้.

## พฤติกรรมที่เลือก (จาก Tom)

หุบเหลือ **icon rail ~64px** (ไม่ซ่อนทั้งแถบ) — ยังกดเมนูได้, hover เห็นชื่อ. จำสถานะ
ข้ามการ reload. เดสก์ท็อปเท่านั้น (มือถือใช้ bottom nav — ไม่กระทบ).

## ดีไซน์

### 1. สถานะ — store เล็ก (persist localStorage)

`src/stores/uiStore.ts` (ใหม่): zustand + persist
```ts
interface UiState {
  sidebarCollapsed: boolean;      // ค่าเริ่ม false (เปิด)
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
}
```
- persist key เช่น `wealthlens_ui` — **เป็นของเครื่อง ไม่ sync Drive** (เหมือนธีม)
- แยก store จาก financeStore (UI state ไม่ควรทำ dashboard re-render / ไม่เข้า backup)

### 2. Layout — คอลัมน์วิ่งตาม Sidebar

`src/components/layout/Layout.tsx`: `md:grid-cols-[240px_1fr]` → **`md:grid-cols-[auto_1fr]`**.
คอลัมน์แรก = ความกว้างจริงของ Sidebar → Layout ไม่ต้องรู้ collapsed state (ความกว้างวิ่ง
ตาม Sidebar เอง). เปลี่ยนบรรทัดเดียว.

### 3. Sidebar — icon rail + toggle

`src/components/layout/Sidebar.tsx`:
- กว้าง `w-[240px]` ↔ `w-[64px]` ตาม `sidebarCollapsed` · `transition-[width] duration-200`
  (CSS ธรรมดา — layout transition ไม่ใช่ framer จึงไม่ชน F42)
- **collapsed:** nav link โชว์เฉพาะไอคอน (ซ่อน `<span>label`), จัดกึ่งกลาง, ใส่
  `title={item.label}` + `aria-label={item.label}` (hover เห็นชื่อ + a11y). โลโก้ย่อเหลือ
  mark (เช่น "W" หรือไอคอน), ซ่อน subtitle "บัญชีส่วนตัว". ซ่อน `<BuildInfo />`.
- **expanded:** เหมือนเดิม (icon + label)
- **ปุ่ม toggle:** chevron ที่หัว sidebar — « เมื่อเปิด (หุบ), » เมื่อหุบ (เปิด) ·
  `aria-label` "หุบเมนู" / "เปิดเมนู" · `aria-expanded`
- active state (`linkActive`) ยังเห็นที่ไอคอนตอนหุบ
- สีจาก token เท่านั้น (F46) · nav อ่านจาก `lib/nav.ts` (F47) เหมือนเดิม

### 4. a11y / รายละเอียด

- `<aside aria-label="เมนู">` เดิมคงไว้; ปุ่ม toggle มี `aria-label` ชัด
- icon-only link ต้องมีชื่อผ่าน `aria-label`/`title` (ไม่งั้น screen reader อ่านแค่ emoji)
- ไม่แตะ BottomNav / มือถือ (Sidebar `hidden md:flex`)

## Testing (TDD)

- `scripts/verify-ui-store.ts` (ใหม่, tsx): uiStore toggle (false→true→false), setSidebarCollapsed,
  ค่าเริ่ม false. (persist middleware กับ localStorage shim ถ้าจำเป็น — หรือทดสอบ logic ล้วน)
- verify-nav ไม่ regress (nav registry ไม่เปลี่ยน)
- verify:mobile ไม่ regress: เดสก์ท็อป 1280 ยังมี sidebar + sidebar อยู่ครบ (M6), มือถือ
  ไม่มี sidebar. **หมายเหตุ:** verify-mobile เช็ค "sidebar อยู่ครบ" ที่ 1280 — collapsed
  default = false จึงเปิดปกติตอนเทสต์
- ขับจริงในเบราว์เซอร์: หุบ→ไอคอนอย่างเดียว, เปิด→ปกติ, reload แล้วจำสถานะ, กดเมนูตอนหุบได้

## ไม่ทำ (YAGNI)

- ไม่ทำโหมด "ซ่อนทั้งแถบ" / overlay
- ไม่ทำ keyboard shortcut (เพิ่มทีหลังได้ถ้าอยาก)
- ไม่ยุ่ง mobile / bottom nav
- ไม่ sync สถานะขึ้น Drive (เป็น UI ของเครื่อง)
