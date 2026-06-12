/**
 * Thai gold spot price fetcher.
 *
 * goldtraders.or.th มี JSON API ตรง (/api/GoldPrices/Latest) แต่ไม่เปิด CORS
 * — proxy ฟรีภายนอกที่เคยใช้ทยอยพังหมด (chnwt.dev scrape เว็บเก่าที่ถูกปิด,
 * corsproxy.io ตัด free tier เป็น 403, allorigins ล่มบ่อย) จึงเลิกพึ่ง
 * third-party แล้วเรียกผ่าน same-origin path `/api/gold-price` แทน:
 * dev/preview → Vite proxy (vite.config.ts), production → Vercel rewrite
 * (vercel.json) ทั้งคู่ forward ไป goldtraders โดยไม่มีข้อมูลส่วนตัวติดไป
 *
 * ลำดับ source: same-origin proxy → chnwt.dev (เผื่อ scraper ชุมชนกลับมา)
 *
 * Returns the gold-bar BUY price for 96.5% gold — i.e. the price a shop
 * will pay if you sell your bar back today. This is the realistic
 * "market value if I liquidated now" number for unrealized-P&L display.
 *
 * 99.99% has no Thai community API — that spot stays manual.
 */

const GOLDTRADERS_PROXY_PATH = '/api/gold-price';
const LEGACY_API_URL = 'https://api.chnwt.dev/thai-gold-api/latest';
const FETCH_TIMEOUT_MS = 8000;

export interface FetchedGoldPrice {
  /** ทองคำแท่ง 96.5% — ราคาที่ร้านรับซื้อ (resale value). */
  price965: number;
  /** API-reported round, e.g. "เวลา 14:04 น. (ครั้งที่ 14)". For display. */
  round: string;
  /** ISO timestamp when we received the response (client clock). */
  fetchedAt: string;
}

interface GoldTradersResponse {
  /** ราคารับซื้อทองคำแท่ง, e.g. 64950.0 */
  bL_BuyPrice?: number;
  /** Thai local time, e.g. "2026-06-12T09:53:00" (no timezone suffix). */
  asTime?: string;
  /** รอบประกาศราคาของวัน, e.g. 6 */
  seq?: number;
}

interface LegacyApiResponse {
  status?: string;
  response?: {
    update_date?: string;
    update_time?: string;
    price?: {
      gold?: { buy?: string; sell?: string };
      gold_bar?: { buy?: string; sell?: string };
    };
  };
}

const fetchJsonWithTimeout = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
};

const formatGoldTradersRound = (asTime: string | undefined, seq: number | undefined): string => {
  const timePart = asTime?.match(/T(\d{2}):(\d{2})/);
  const time = timePart ? `เวลา ${timePart[1]}:${timePart[2]} น.` : '';
  const round = typeof seq === 'number' ? `(ครั้งที่ ${seq})` : '';
  return [time, round].filter(Boolean).join(' ');
};

const fetchFromGoldTraders = async (fetchedAt: string): Promise<FetchedGoldPrice> => {
  const json = (await fetchJsonWithTimeout(GOLDTRADERS_PROXY_PATH)) as GoldTradersResponse;

  const price965 = json.bL_BuyPrice;
  if (typeof price965 !== 'number') {
    throw new Error('รูปแบบข้อมูลจาก goldtraders เปลี่ยนไป (ไม่พบ bL_BuyPrice)');
  }
  if (!Number.isFinite(price965) || price965 <= 0) {
    throw new Error(`ราคาที่ได้ไม่ถูกต้อง: "${price965}"`);
  }

  return {
    price965,
    round: formatGoldTradersRound(json.asTime, json.seq),
    fetchedAt,
  };
};

const parseThaiNumber = (raw: string | undefined): number => {
  if (!raw) return Number.NaN;
  return Number.parseFloat(raw.replace(/,/g, ''));
};

const fetchFromLegacyProxy = async (fetchedAt: string): Promise<FetchedGoldPrice> => {
  const json = (await fetchJsonWithTimeout(LEGACY_API_URL)) as LegacyApiResponse;

  if (json.status !== 'success') {
    throw new Error(`แหล่งข้อมูลตอบกลับผิดปกติ (status: ${json.status ?? 'ไม่ทราบ'})`);
  }

  // proxy ส่ง status:"success" แต่ราคา "ว่าง" เมื่อ scraper ต้นทางขัดข้อง
  // — แยกกรณี "ค่าว่าง" ออกจาก "ไม่พบ field" เพื่อบอกผู้ใช้ได้ตรง
  const rawBuy = json.response?.price?.gold_bar?.buy?.trim();
  if (rawBuy === undefined) {
    throw new Error('รูปแบบข้อมูลจากแหล่งเปลี่ยนไป (ไม่พบ gold_bar.buy)');
  }
  if (rawBuy === '') {
    throw new Error('แหล่งข้อมูลสำรองส่งค่าว่าง');
  }

  const price965 = parseThaiNumber(rawBuy);
  if (!Number.isFinite(price965) || price965 <= 0) {
    throw new Error(`ราคาที่ได้ไม่ถูกต้อง: "${rawBuy}"`);
  }

  return {
    price965,
    round: json.response?.update_time ?? '',
    fetchedAt,
  };
};

export const fetchGoldSpotPrice = async (): Promise<FetchedGoldPrice> => {
  const fetchedAt = new Date().toISOString();

  let primaryError: unknown;
  try {
    return await fetchFromGoldTraders(fetchedAt);
  } catch (err) {
    primaryError = err;
  }

  try {
    return await fetchFromLegacyProxy(fetchedAt);
  } catch {
    const reason =
      primaryError instanceof Error ? primaryError.message : 'unknown error';
    throw new Error(
      `ดึงราคาจากทุกแหล่งไม่สำเร็จ (${reason}) — ลองใหม่ภายหลัง หรือกรอกราคาเอง`,
    );
  }
};
