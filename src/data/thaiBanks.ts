/**
 * WealthLens — Thai bank master data (F33).
 *
 * Real bank identity: brand color + logo PNG bundled locally under
 * `public/banks/<CODE>.png` (downloaded once — the app makes NO external
 * request at runtime). `resolveBank` matches an account by explicit
 * `bankKey`, else by fuzzy name/alias/code match so legacy accounts (e.g.
 * the migrated "กรุงศรี") still pick up their brand without a data migration.
 */
import type { BankAccount } from '@/types';

export interface ThaiBank {
  /** Stable key stored on the account (lowercased code). */
  key: string;
  /** Thai display name (without the "ธนาคาร" prefix). */
  label: string;
  /** Uppercase bank code (also the logo filename). */
  code: string;
  /** Lowercased strings that also identify this bank (for name-matching). */
  aliases: string[];
  /** Brand color (card accent). */
  color: string;
  /** Local logo path served from /public. */
  logo: string;
  /** Emoji avatar instead of a logo image (e.g. เงินสด 💵). */
  emoji?: string;
}

const bank = (
  key: string,
  label: string,
  code: string,
  color: string,
  aliases: string[],
): ThaiBank => ({
  key,
  label,
  code,
  color,
  aliases: [key, code.toLowerCase(), label.toLowerCase(), ...aliases],
  logo: `/banks/${code}.png`,
});

/** Common personal banks first, then the rest. */
export const THAI_BANKS: ThaiBank[] = [
  {
    key: 'cash',
    label: 'เงินสด',
    code: 'CASH',
    aliases: ['cash', 'เงินสด', 'เงินสดในมือ', 'เงินสดในกระเป๋า'],
    color: '#16a34a',
    logo: '',
    emoji: '💵',
  },
  bank('kbank', 'กสิกรไทย', 'KBANK', '#138f2d', ['กสิกร', 'kasikorn']),
  bank('scb', 'ไทยพาณิชย์', 'SCB', '#4e2e7f', ['ไทยพานิชย์', 'siam commercial']),
  bank('bay', 'กรุงศรีอยุธยา', 'BAY', '#736161', ['กรุงศรี', 'krungsri']),
  bank('bbl', 'กรุงเทพ', 'BBL', '#1d4094', ['ธนาคารกรุงเทพ', 'bangkok bank']),
  bank('ktb', 'กรุงไทย', 'KTB', '#07a4e7', ['krungthai']),
  bank('ttb', 'ทหารไทยธนชาต', 'TTB', '#0177c1', ['ทีทีบี', 'ธนชาต']),
  bank('tmb', 'ทหารไทย', 'TMB', '#0177c1', ['ทหารไทย']),
  bank('gsb', 'ออมสิน', 'GSB', '#ee068e', ['ธนาคารออมสิน']),
  bank('clicx', 'clicx', 'CLICX', '#2E86E6', ['คลิกซ์']),
  bank('baac', 'ธ.ก.ส.', 'BAAC', '#4B9B1D', ['ธกส', 'เพื่อการเกษตร']),
  bank('ghb', 'อาคารสงเคราะห์', 'GHB', '#F57D23', ['ธอส']),
  bank('uobt', 'ยูโอบี', 'UOBT', '#001f6c', ['uob']),
  bank('cimbt', 'ซีไอเอ็มบี', 'CIMBT', '#7E2F36', ['cimb']),
  bank('scbt', 'สแตนดาร์ดชาร์เตอร์ด', 'SCBT', '#0F6EA1', ['standard chartered']),
  bank('lhbank', 'แลนด์ แอนด์ เฮ้าส์', 'LHBANK', '#6D6E71', ['lh bank', 'แลนด์']),
  bank('tbank', 'ธนชาต', 'TBANK', '#f46f22', ['thanachart']),
  bank('citi', 'ซิตี้แบงก์', 'CITI', '#1583C7', ['citibank']),
  bank('hsbc', 'HSBC', 'HSBC', '#FD0D1B', ['เอชเอสบีซี']),
  bank('icbc', 'ไอซีบีซี', 'ICBC', '#C50F1C', []),
  bank('isbt', 'อิสลาม', 'ISBT', '#184615', ['islamic']),
  bank('kk', 'เกียรตินาคิน', 'KK', '#199CC5', ['kkp', 'เกียรตินาคินภัทร']),
  bank('tcrb', 'ไทยเครดิต', 'TCRB', '#0A4AB3', ['thai credit']),
  bank('tisco', 'ทิสโก้', 'TISCO', '#12549F', []),
];

const BY_KEY = new Map(THAI_BANKS.map((b) => [b.key, b]));

/** Look up a bank by its key. */
export const bankByKey = (key: string | undefined): ThaiBank | null =>
  key ? BY_KEY.get(key) ?? null : null;

/**
 * Resolve the brand for an account: explicit `bankKey` first, else a fuzzy
 * match of the account name against each bank's aliases (label/code/key are
 * folded into `aliases`), so the migrated "กรุงศรี" account shows the BAY
 * brand without a data migration. Returns null when nothing matches (caller
 * shows a neutral avatar).
 */
export const resolveBank = (
  account: Pick<BankAccount, 'name' | 'bankKey'>,
): ThaiBank | null => {
  const byKey = bankByKey(account.bankKey);
  if (byKey) return byKey;
  const name = account.name.trim().toLowerCase();
  if (!name) return null;
  for (const b of THAI_BANKS) {
    if (b.aliases.some((a) => a === name)) return b;
  }
  return null;
};
