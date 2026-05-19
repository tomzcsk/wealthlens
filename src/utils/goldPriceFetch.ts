/**
 * Thai gold spot price fetcher.
 *
 * Source: api.chnwt.dev/thai-gold-api — a community proxy of สมาคมค้าทองคำ
 * (Gold Traders Association of Thailand) data. Wildcard CORS, no auth.
 *
 * Returns the gold-bar BUY price for 96.5% gold — i.e. the price a shop
 * will pay if you sell your bar back today. This is the realistic
 * "market value if I liquidated now" number for unrealized-P&L display.
 *
 * 99.99% has no Thai community API — that spot stays manual.
 */

const GOLD_API_URL = 'https://api.chnwt.dev/thai-gold-api/latest';
const FETCH_TIMEOUT_MS = 8000;

export interface FetchedGoldPrice {
  /** ทองคำแท่ง 96.5% — ราคาที่ร้านรับซื้อ (resale value). */
  price965: number;
  /** API-reported round, e.g. "เวลา 14:04 น. (ครั้งที่ 14)". For display. */
  round: string;
  /** ISO timestamp when we received the response (client clock). */
  fetchedAt: string;
}

interface ApiResponse {
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

const parseThaiNumber = (raw: string | undefined): number => {
  if (!raw) return Number.NaN;
  return Number.parseFloat(raw.replace(/,/g, ''));
};

export const fetchGoldSpotPrice = async (): Promise<FetchedGoldPrice> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(GOLD_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const json = (await res.json()) as ApiResponse;
    if (json.status !== 'success' || !json.response?.price?.gold_bar?.buy) {
      throw new Error('API response missing gold_bar.buy');
    }

    const price965 = parseThaiNumber(json.response.price.gold_bar.buy);
    if (!Number.isFinite(price965) || price965 <= 0) {
      throw new Error(`Invalid price: ${json.response.price.gold_bar.buy}`);
    }

    return {
      price965,
      round: json.response.update_time ?? '',
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
};
