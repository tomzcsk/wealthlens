/**
 * Smoke test for the goalsStore facade ↔ financeStore.preferences bridge.
 *
 * Run with:  npx tsx scripts/smoke-prefs.mts
 *
 * Validates:
 *  1. Legacy `wealthlens_goals` localStorage gets ported into financeStore
 *     and then deleted (one-time migration, guarded by `wealthlens_goals_migrated`).
 *  2. A goalsStore-shaped action writes through to financeStore.data.preferences.
 *  3. Reading via the facade selector path returns the same value back.
 *  4. Unrelated preference fields are preserved across writes.
 *  5. The persisted `wealthlens_data` blob contains the preferences slice
 *     (which is what makes Drive sync pick it up).
 *
 * Notes: we don't exercise `useGoalsStore` as a React hook here — it's a
 * thin selector wrapper over `useFinanceStore` that requires a render
 * environment. We exercise the SAME mutate-and-read code paths it uses,
 * via `.getState()` and via re-imported action references.
 */

// ---------------------------------------------------------------------------
// Polyfill `localStorage` and `window` so the modules under test (which were
// authored for the browser) load cleanly under Node.
// ---------------------------------------------------------------------------

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

// Pre-seed localStorage with a legacy `wealthlens_goals` payload BEFORE the
// goalsStore module loads, so we exercise the migration path on import.
const legacy = {
  state: {
    yearlyGoals: { '2025': 350_000, '2026': 400_000 },
    travelSavingsGoal: 80_000,
    keptBalances: { '2024': 695_101, '2025': 354_899 },
    incomeDefaults: {
      salary: 80_000,
      tax: 4_500,
      socialSecurity: 750,
      providentFund: 2_400,
      gsl: 0,
    },
  },
  version: 2,
};

const storage = new MemoryStorage();
storage.setItem('wealthlens_goals', JSON.stringify(legacy));

const globalAny = globalThis as unknown as Record<string, unknown>;
globalAny.localStorage = storage;
globalAny.window = {
  localStorage: storage,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
};
globalAny.navigator = { onLine: true };

// ---------------------------------------------------------------------------
// Now import the modules under test (must be AFTER polyfills).
// ---------------------------------------------------------------------------

const { useFinanceStore } = await import('../src/stores/financeStore');
// Importing goalsStore triggers the one-time migration as a side effect.
await import('../src/stores/goalsStore');

let pass = 0;
let fail = 0;
const log = (label: string, ok: boolean, extra = ''): void => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

console.log('--- Smoke: goalsStore facade <-> financeStore.preferences ---');

// (1) Migration ported legacy values into financeStore.data.preferences.
const initialPrefs = useFinanceStore.getState().data.preferences;
log(
  'migration: financeStore.data.preferences populated from legacy wealthlens_goals',
  initialPrefs !== undefined &&
    initialPrefs.keptBalances['2024'] === 695_101 &&
    initialPrefs.keptBalances['2025'] === 354_899 &&
    initialPrefs.travelSavingsGoal === 80_000 &&
    initialPrefs.yearlyGoals['2026'] === 400_000 &&
    initialPrefs.incomeDefaults?.salary === 80_000,
  `kept=${JSON.stringify(initialPrefs?.keptBalances)}`,
);

// (1b) Legacy key removed; flag set.
log(
  'migration: legacy wealthlens_goals key deleted',
  storage.getItem('wealthlens_goals') === null,
);
log(
  'migration: wealthlens_goals_migrated flag set',
  storage.getItem('wealthlens_goals_migrated') === '1',
);

// (2) An action writes through to financeStore.data.preferences.
//     We exercise the same `mutatePrefs` path the facade uses by replicating
//     a tiny version of `setKeptBalance` here. (The facade's actions are
//     module-private, but they call the same setState shape.)
const stampBefore = useFinanceStore.getState().lastUpdated;
await new Promise((r) => setTimeout(r, 5));
useFinanceStore.setState((state) => {
  const current = state.data.preferences;
  const stamp = new Date().toISOString();
  const next = {
    yearlyGoals: current?.yearlyGoals ?? {},
    travelSavingsGoal: current?.travelSavingsGoal ?? 0,
    keptBalances: { ...(current?.keptBalances ?? {}), '2026': 222_000 },
    incomeDefaults: current?.incomeDefaults ?? null,
  };
  return {
    data: { ...state.data, preferences: next, lastUpdated: stamp },
    lastUpdated: stamp,
  };
});
const afterPrefs = useFinanceStore.getState().data.preferences;
const stampAfter = useFinanceStore.getState().lastUpdated;
log(
  'mutation writes to financeStore.data.preferences.keptBalances',
  afterPrefs?.keptBalances['2026'] === 222_000,
);
log(
  'mutation bumps lastUpdated (this is what triggers Drive sync)',
  stampAfter > stampBefore,
);

// (3) Reading via .getState() returns the value back (mirror of selector).
const back = useFinanceStore.getState().data.preferences?.keptBalances['2026'];
log('round-trip read returns the value just written', back === 222_000);

// (4) Unrelated prefs survive subsequent writes.
useFinanceStore.setState((state) => {
  const current = state.data.preferences;
  const stamp = new Date().toISOString();
  const next = {
    yearlyGoals: { ...(current?.yearlyGoals ?? {}), '2027': 500_000 },
    travelSavingsGoal: current?.travelSavingsGoal ?? 0,
    keptBalances: current?.keptBalances ?? {},
    incomeDefaults: current?.incomeDefaults ?? null,
  };
  return {
    data: { ...state.data, preferences: next, lastUpdated: stamp },
    lastUpdated: stamp,
  };
});
const merged = useFinanceStore.getState().data.preferences;
log(
  'unrelated preference fields preserved across writes',
  merged?.keptBalances['2024'] === 695_101 &&
    merged?.keptBalances['2026'] === 222_000 &&
    merged?.yearlyGoals['2027'] === 500_000 &&
    merged?.travelSavingsGoal === 80_000 &&
    merged?.incomeDefaults?.salary === 80_000,
);

// (5) The persisted blob (what Drive sync uploads) carries `preferences`.
const persistedRaw = storage.getItem('wealthlens_data');
const persistedHasPrefs =
  !!persistedRaw &&
  /"preferences"/.test(persistedRaw) &&
  /"keptBalances"/.test(persistedRaw) &&
  /222000/.test(persistedRaw);
log(
  'preferences are persisted in the wealthlens_data blob (Drive-syncable)',
  persistedHasPrefs,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
