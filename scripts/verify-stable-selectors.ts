/**
 * Guard against an entire class of bug: Zustand selectors that build a NEW
 * object/array on every call.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-stable-selectors.ts
 *
 * `useFinanceStore((s) => s.data.bankTransactions ?? [])` looks harmless, but
 * `?? []` allocates a fresh array whenever the field is undefined. Zustand
 * compares snapshots with `Object.is`, so every render sees a "new" value →
 * re-render → new array → infinite loop → React error #185
 * ("Maximum update depth exceeded"). It only bites users whose data lacks the
 * optional field, which is exactly the users we never test with.
 *
 * Fix: select the raw field and fall back to a module-level frozen constant
 * (see `src/stores/emptyRefs.ts`), so the reference is stable.
 *
 * This scanner is deliberately textual — it must catch the pattern before it
 * ever reaches a browser, and no type system will.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;

/** `useFinanceStore(...)` (or any use*Store) whose body ends in `?? []` / `?? {}`. */
const UNSTABLE = /use\w*Store\(\s*\([^)]*\)\s*=>[^)]*\?\?\s*(\[\]|\{\})/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.tsx?$/.test(entry)
        ? [full]
        : [];
  });

/** บรรทัดคอมเมนต์ — เอกสารที่ "อ้างถึง" รูปแบบผิดไม่ใช่ตัวรูปแบบผิด. */
const isComment = (line: string): boolean =>
  /^\s*(\/\/|\*|\/\*)/.test(line);

const violations: string[] = [];
for (const file of walk(SRC)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!isComment(line) && UNSTABLE.test(line)) {
        violations.push(`${file.replace(SRC, 'src')}:${i + 1}\n    ${line.trim()}`);
      }
    });
}

if (violations.length > 0) {
  console.error(
    `✗ พบ selector ที่คืน object ใหม่ทุกครั้ง ${violations.length} จุด — ทำให้ React วน render ไม่รู้จบ (error #185)\n`,
  );
  for (const v of violations) console.error(`  ${v}\n`);
  console.error('  แก้โดยเลือก field ดิบแล้ว fallback เป็นค่าคงที่จาก src/stores/emptyRefs.ts');
  process.exit(1);
}

console.log('✓ ไม่มี selector ที่คืน object ใหม่ทุกครั้ง');
console.log('\n✅ ผ่านทั้งหมด');
