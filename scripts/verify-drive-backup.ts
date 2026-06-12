/**
 * Hand-computed verification for driveBackup pure helpers.
 * Run: npx tsx scripts/verify-drive-backup.ts
 */
import {
  backupFilenameForDate,
  parseBackupDate,
  selectExpiredBackups,
  type BackupFileInfo,
} from '../src/utils/driveBackup';

let failures = 0;
const expect = (label: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`✅ ${label}`);
  else {
    failures++;
    console.error(`❌ ${label}: expected ${e}, got ${a}`);
  }
};

expect('filename', backupFilenameForDate('2026-06-12'), 'wealthlens_backup_2026-06-12.json');
expect('parse roundtrip', parseBackupDate('wealthlens_backup_2026-06-12.json'), '2026-06-12');
expect('parse rejects foreign file', parseBackupDate('wealthlens_data.json'), null);
expect('parse rejects bad date shape', parseBackupDate('wealthlens_backup_2026-6-2.json'), null);

const mk = (date: string): BackupFileInfo => ({ fileId: `id-${date}`, date, sizeBytes: 1 });

// วันนี้ 2026-06-12, retention 30 → เก็บ 2026-05-14..2026-06-12, ทิ้ง ≤ 2026-05-13
const files = [
  mk('2026-06-12'),
  mk('2026-05-14'), // วันสุดท้ายที่ยังเก็บ
  mk('2026-05-13'), // หมดอายุพอดี
  mk('2026-04-01'),
];
expect(
  'retention 30 days cutoff',
  selectExpiredBackups(files, '2026-06-12').map((f) => f.date),
  ['2026-05-13', '2026-04-01'],
);

// ข้ามเดือน/ปี: วันนี้ 2026-01-15, retention 30 → cutoff 2025-12-17
expect(
  'cross-year cutoff',
  selectExpiredBackups([mk('2025-12-17'), mk('2025-12-16')], '2026-01-15').map((f) => f.date),
  ['2025-12-16'],
);

expect('empty list', selectExpiredBackups([], '2026-06-12'), []);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\n🎉 all drive-backup helper checks passed');
