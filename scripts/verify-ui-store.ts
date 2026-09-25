/**
 * Verification for uiStore (สถานะ UI ของเครื่อง — sidebar หุบ/เปิด).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-ui-store.ts
 */
// localStorage shim ต้องมาก่อน import store (zustand persist หา localStorage ตอน init)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const run = async (): Promise<void> => {
  const { useUiStore } = await import('../src/stores/uiStore');
  let failures = 0;
  const eq = (label: string, got: unknown, want: unknown): void => {
    const ok = got === want;
    if (!ok) failures += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}: ${String(got)} (expected ${String(want)})`);
  };

  eq('เริ่มต้น sidebarCollapsed = false (เปิด)', useUiStore.getState().sidebarCollapsed, false);

  useUiStore.getState().toggleSidebar();
  eq('toggle → true (หุบ)', useUiStore.getState().sidebarCollapsed, true);

  useUiStore.getState().toggleSidebar();
  eq('toggle อีกครั้ง → false (เปิด)', useUiStore.getState().sidebarCollapsed, false);

  useUiStore.getState().setSidebarCollapsed(true);
  eq('setSidebarCollapsed(true)', useUiStore.getState().sidebarCollapsed, true);
  useUiStore.getState().setSidebarCollapsed(false);
  eq('setSidebarCollapsed(false)', useUiStore.getState().sidebarCollapsed, false);

  // หมายเหตุ: persist middleware (name 'wealthlens_ui') ทำงานจริงในเบราว์เซอร์ —
  // ใน tsx shim zustand persist เขียน localStorage ไม่ได้ (เหมือน financeStore) จึง
  // ทดสอบเฉพาะ logic ของ state; การจำข้ามการ reload ยืนยันด้วยการขับจริงในเบราว์เซอร์.

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
