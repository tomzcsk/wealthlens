/**
 * WealthLens — Gold Holdings Manager (🪙 ทองคำ).
 *
 * One screen that surfaces:
 *   - KPI strip: weight held, cost basis, market value at user-entered
 *     spot, realized + unrealized P&L
 *   - SpotPriceEditor: manual entry for 96.5% and 99.99% spot prices
 *   - Active holdings table with per-row sell / edit / delete
 *   - Sold holdings (collapsed) showing realized P&L per row
 *
 * Spot price is intentionally manual — see UserPreferences.goldSpotPrice
 * docs in types/index.ts for the reasoning.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import {
  selectGoldAssistantSignals,
  selectGoldHoldingMarketValue,
  selectGoldSummary,
  type AssistantSignalTone,
} from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import { Modal } from '@/components/ui/Modal';
import GoldForm from '@/components/forms/GoldForm';
import SellGoldForm from '@/components/forms/SellGoldForm';
import type { GoldHolding, GoldPurity } from '@/types';
import { GRAMS_PER_BAHT } from '@/types';
import { formatNumber, formatTHB } from '@/utils/formatters';
import { fetchGoldSpotPrice } from '@/utils/goldPriceFetch';

const PURITY_LABELS: Record<GoldPurity, string> = {
  '96.5': 'ทอง 96.5%',
  '99.99': 'ทอง 99.99%',
};

const TYPE_LABELS = {
  bar: '🟨 แท่ง',
  jewelry: '💍 รูปพรรณ',
} as const;

// ---------------------------------------------------------------------------
// Spot price editor — inline, lives next to the KPI strip
// ---------------------------------------------------------------------------

interface SpotEntryProps {
  purity: GoldPurity;
  value: number | undefined;
}

const parseSpotInput = (input: string): number => {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

const SpotEntry = ({ purity, value }: SpotEntryProps): ReactNode => {
  const setGoldSpotPrice = useFinanceStore((s) => s.setGoldSpotPrice);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    value != null ? formatNumber(value) : '',
  );

  const handleSave = (): void => {
    const parsed = parseSpotInput(draft);
    setGoldSpotPrice(purity, parsed > 0 ? parsed : null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 rounded-md hover:bg-hover">
        <span className="text-sm text-ink-600">{PURITY_LABELS[purity]}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm financial-number tabular-nums text-ink-900">
            {value != null ? `${formatTHB(value)} / บาท` : '—'}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(value != null ? formatNumber(value) : '');
              setEditing(true);
            }}
            className="inline-flex items-center min-h-11 md:min-h-0 text-xs text-primary-ink hover:text-primary-700"
          >
            แก้ไข
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="text-sm text-ink-600 shrink-0">
        {PURITY_LABELS[purity]}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="44,000"
        className="flex-1 bg-surface border border-ink-200 rounded-md px-2 py-1 text-sm financial-number text-right focus:outline-none focus:ring-2 focus:ring-primary-ink"
      />
      <button
        type="button"
        onClick={handleSave}
        className="px-2 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary-dark"
      >
        บันทึก
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="px-2 py-1 text-xs text-ink-500 hover:text-ink-900"
      >
        ยกเลิก
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Holding row — used in both active and sold lists
//
// สองร่างในคอมโพเนนต์เดียว:
//   - จอเล็ก (< lg) → การ์ดหนึ่งใบต่อหนึ่งรายการ
//   - จอใหญ่ (≥ lg) → กริด 12 คอลัมน์ของเดิม ไม่แตะสักพิกเซล
//
// ทำไมเป็นการ์ด ไม่ใช่ "เลื่อนแนวนอน + ตรึงคอลัมน์แรก" แบบ F47: แพทเทิร์นนั้น
// มีไว้สำหรับตารางตัวเลขที่ "มีไว้เทียบกันข้ามแถว" (CLAUDE.md) แต่นี่คือสมุด
// สินทรัพย์ที่มีปุ่มลงมือทำต่อแถว — เราเทียบ ต้นทุน กับ มูลค่าตลาด "ภายในแถว
// เดียวกัน" การ์ดจึงเป็นรูปทรงที่ซื่อสัตย์กว่า (และตรงกับหน้า /accounts อยู่แล้ว)
//
// จุดตัดเป็น lg ไม่ใช่ md โดยตั้งใจ: sidebar โผล่ที่ md (240px) ทำให้เนื้อที่
// เหลือ ~464px ที่ 768px — กริด 12 ช่องตรงนั้นแคบยิ่งกว่าบนมือถือเสียอีก
// ---------------------------------------------------------------------------

interface HoldingRowProps {
  holding: GoldHolding;
  marketValue: number | null;
  onSell?: (h: GoldHolding) => void;
  onEdit: (h: GoldHolding) => void;
  onDelete: (h: GoldHolding) => void;
  onUnsell?: (h: GoldHolding) => void;
}

/** ตัวเลขของทองหนึ่งก้อน — คำนวณครั้งเดียว ใช้ทั้งการ์ดและกริด */
const holdingFigures = (
  holding: GoldHolding,
  marketValue: number | null,
) => {
  const isSold = holding.sold != null;
  return {
    isSold,
    pricePerBaht: holding.totalCost / holding.weightBaht,
    grams: formatNumber(holding.weightBaht * GRAMS_PER_BAHT, { decimals: 2 }),
    unrealizedPnl:
      !isSold && marketValue != null ? marketValue - holding.totalCost : null,
    realizedPnl:
      isSold && holding.sold
        ? holding.sold.soldPrice - holding.totalCost
        : null,
  };
};

const pnlClass = (pnl: number): string =>
  pnl >= 0 ? 'text-income-ink' : 'text-expense-ink';

const signed = (pnl: number): string =>
  `${pnl >= 0 ? '+' : ''}${formatTHB(pnl)}`;

/** แถวป้าย/ค่า ในการ์ด — ป้ายซ้าย ตัวเลขขวา ไม่มีใครเบียดใคร */
const Figure = ({
  label,
  value,
  sub,
  subClass = 'text-ink-400',
}: {
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
}): ReactNode => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-sm text-ink-500 shrink-0">{label}</span>
    <span className="text-right">
      <span className="block text-sm financial-number tabular-nums text-ink-900">
        {value}
      </span>
      {sub && (
        <span
          className={`block text-xs financial-number tabular-nums ${subClass}`}
        >
          {sub}
        </span>
      )}
    </span>
  </div>
);

const HoldingCard = ({
  holding,
  marketValue,
  onSell,
  onEdit,
  onDelete,
  onUnsell,
}: HoldingRowProps): ReactNode => {
  const { isSold, pricePerBaht, grams, unrealizedPnl, realizedPnl } =
    holdingFigures(holding, marketValue);

  return (
    <div className="lg:hidden border-b border-ink-100 last:border-b-0 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink-900 truncate" title={holding.brand}>
            {holding.brand}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {TYPE_LABELS[holding.type]} · {holding.purity}%
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-ink-500">ซื้อ {holding.purchaseDate}</div>
          {isSold && holding.sold && (
            <div className="text-xs text-ink-400 mt-0.5">
              ขาย {holding.sold.soldDate}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-ink-100 pt-3">
        <Figure
          label="น้ำหนัก"
          value={`${holding.weightBaht} บาท`}
          sub={`= ${grams}g`}
        />
        <Figure
          label="ต้นทุน"
          value={formatTHB(holding.totalCost)}
          sub={`${formatTHB(pricePerBaht, { decimals: 0 })}/บาท`}
        />
        {isSold && holding.sold && realizedPnl != null ? (
          <Figure
            label="ราคาขาย"
            value={formatTHB(holding.sold.soldPrice)}
            sub={signed(realizedPnl)}
            subClass={pnlClass(realizedPnl)}
          />
        ) : marketValue != null ? (
          <Figure
            label="มูลค่าตลาด"
            value={formatTHB(marketValue)}
            sub={unrealizedPnl != null ? signed(unrealizedPnl) : undefined}
            subClass={
              unrealizedPnl != null ? pnlClass(unrealizedPnl) : undefined
            }
          />
        ) : (
          <Figure label="มูลค่าตลาด" value="—" />
        )}
      </div>

      <div className="space-y-2">
        {!isSold && onSell && (
          <button
            type="button"
            onClick={() => onSell(holding)}
            className="w-full min-h-11 inline-flex items-center justify-center px-3 text-sm font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-md hover:bg-warning-100 transition"
          >
            💰 ขาย
          </button>
        )}
        {isSold && onUnsell && (
          <button
            type="button"
            onClick={() => onUnsell(holding)}
            className="w-full min-h-11 inline-flex items-center justify-center px-3 text-sm text-ink-600 border border-ink-200 rounded-md hover:bg-hover transition"
          >
            ↩️ ยกเลิกขาย
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(holding)}
            className="flex-1 min-h-11 inline-flex items-center justify-center px-3 text-sm text-ink-700 border border-ink-200 rounded-md hover:bg-hover transition"
          >
            ✏️ แก้ไข
          </button>
          <button
            type="button"
            onClick={() => onDelete(holding)}
            className="flex-1 min-h-11 inline-flex items-center justify-center px-3 text-sm text-expense-ink border border-ink-200 rounded-md hover:bg-hover transition"
          >
            🗑️ ลบ
          </button>
        </div>
      </div>
    </div>
  );
};

const HoldingRow = (props: HoldingRowProps): ReactNode => (
  <>
    <HoldingCard {...props} />
    <HoldingGridRow {...props} />
  </>
);

const HoldingGridRow = ({
  holding,
  marketValue,
  onSell,
  onEdit,
  onDelete,
  onUnsell,
}: HoldingRowProps): ReactNode => {
  const { isSold, pricePerBaht, unrealizedPnl, realizedPnl } =
    holdingFigures(holding, marketValue);

  return (
    <div className="hidden lg:grid grid-cols-12 gap-2 items-center px-3 py-2.5 border-b border-ink-100 last:border-b-0 text-sm hover:bg-hover transition">
      <div className="col-span-2 text-ink-700">
        <div>{holding.purchaseDate}</div>
        {isSold && holding.sold && (
          <div className="text-xs text-ink-400 mt-0.5">
            ขาย {holding.sold.soldDate}
          </div>
        )}
      </div>
      <div className="col-span-2 min-w-0">
        <div className="text-ink-900 truncate" title={holding.brand}>
          {holding.brand}
        </div>
        <div className="text-xs text-ink-500">
          {TYPE_LABELS[holding.type]} · {holding.purity}%
        </div>
      </div>
      <div className="col-span-1 text-right">
        <div className="financial-number tabular-nums text-ink-900">
          {holding.weightBaht}
        </div>
        <div className="text-xs text-ink-400">
          {formatNumber(holding.weightBaht * GRAMS_PER_BAHT, { decimals: 2 })}g
        </div>
      </div>
      <div className="col-span-2 text-right financial-number tabular-nums text-ink-900">
        {formatTHB(holding.totalCost)}
        <div className="text-xs text-ink-400">
          {formatTHB(pricePerBaht, { decimals: 0 })}/บาท
        </div>
      </div>
      <div className="col-span-2 text-right">
        {isSold && realizedPnl != null && holding.sold ? (
          <>
            <div className="financial-number tabular-nums text-ink-900">
              {formatTHB(holding.sold.soldPrice)}
            </div>
            <div
              className={`text-xs financial-number ${
                realizedPnl >= 0 ? 'text-income-ink' : 'text-expense-ink'
              }`}
            >
              {realizedPnl >= 0 ? '+' : ''}
              {formatTHB(realizedPnl)}
            </div>
          </>
        ) : marketValue != null ? (
          <>
            <div className="financial-number tabular-nums text-ink-900">
              {formatTHB(marketValue)}
            </div>
            {unrealizedPnl != null && (
              <div
                className={`text-xs financial-number ${
                  unrealizedPnl >= 0 ? 'text-income-ink' : 'text-expense-ink'
                }`}
              >
                {unrealizedPnl >= 0 ? '+' : ''}
                {formatTHB(unrealizedPnl)}
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        )}
      </div>
      <div className="col-span-3 flex items-center justify-end gap-1.5">
        {!isSold && onSell && (
          <button
            type="button"
            onClick={() => onSell(holding)}
            className="px-2 py-1 text-xs font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded hover:bg-warning-100 transition"
          >
            💰 ขาย
          </button>
        )}
        {isSold && onUnsell && (
          <button
            type="button"
            onClick={() => onUnsell(holding)}
            className="px-2 py-1 text-xs text-ink-500 border border-ink-200 rounded hover:bg-hover transition"
          >
            ↩️ ยกเลิกขาย
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(holding)}
          aria-label={`แก้ไข ${holding.brand}`}
          className="p-1 inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-ink-400 hover:text-primary-ink transition"
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => onDelete(holding)}
          aria-label={`ลบ ${holding.brand}`}
          className="p-1 inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-ink-400 hover:text-expense-ink transition"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const GoldPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const deleteGoldHolding = useFinanceStore((s) => s.deleteGoldHolding);
  const unsellGoldHolding = useFinanceStore((s) => s.unsellGoldHolding);
  const applyFetchedGoldPrice = useFinanceStore(
    (s) => s.applyFetchedGoldPrice,
  );
  const pushToast = useToastStore((s) => s.push);
  const [fetchingSpot, setFetchingSpot] = useState(false);

  const handleFetchSpot = async (
    options: { silent?: boolean } = {},
  ): Promise<void> => {
    const { silent = false } = options;
    if (fetchingSpot) return;
    setFetchingSpot(true);
    try {
      const result = await fetchGoldSpotPrice();
      applyFetchedGoldPrice(result.price965, result.round);
      if (!silent) {
        pushToast({
          message: `ดึงราคาทอง 96.5% สำเร็จ: ${formatTHB(result.price965, { decimals: 0 })}/บาท`,
          tone: 'success',
        });
      }
    } catch (err) {
      if (!silent) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        pushToast({
          message: `ดึงราคาทองไม่สำเร็จ — ${reason}`,
          tone: 'error',
        });
      }
    } finally {
      setFetchingSpot(false);
    }
  };

  // Auto-fetch on mount if last update was over 4h ago. updatedAt is set by
  // both manual edits and successful auto-fetches, so manually overriding
  // the spot also resets the staleness clock — we don't trample fresh input.
  const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
  const didAutoFetchRef = useRef(false);
  useEffect(() => {
    if (didAutoFetchRef.current) return;
    didAutoFetchRef.current = true;
    const updatedAt = data.preferences?.goldSpotPrice?.updatedAt;
    const stale =
      !updatedAt ||
      Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS;
    if (stale) {
      // Defer to the next tick so the setFetchingSpot inside doesn't fire
      // during the effect's render phase (react-hooks/set-state-in-effect).
      setTimeout(() => void handleFetchSpot({ silent: true }), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useMemo(() => ({ data }), [data]);
  const summary = useMemo(() => selectGoldSummary(snapshot), [snapshot]);
  const assistant = useMemo(
    () => selectGoldAssistantSignals(snapshot),
    [snapshot],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<GoldHolding | null>(null);
  const [sellingHolding, setSellingHolding] = useState<GoldHolding | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<GoldHolding | null>(null);
  const [showSold, setShowSold] = useState(false);

  const spotPrice = data.preferences?.goldSpotPrice;
  const hasMarketValue = summary.marketValue > 0;

  const handleDelete = (revertSideEffects: boolean): void => {
    const target = pendingDelete;
    if (!target) return;
    deleteGoldHolding(target.id, { revertSideEffects });
    setPendingDelete(null);
    pushToast({
      message: revertSideEffects
        ? `ลบ '${target.brand}' + revert side-effect แล้ว`
        : `ลบ '${target.brand}' แล้ว (เก็บ side-effect)`,
      tone: 'info',
    });
  };

  const handleUnsell = (h: GoldHolding): void => {
    unsellGoldHolding(h.id);
    pushToast({
      message: `'${h.brand}' กลับเป็น active แล้ว`,
      tone: 'info',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">🪙 ทองคำ</h1>
          <p className="text-sm text-ink-500 mt-1">
            asset ledger ทุกการซื้อ-ขายทองคำ — auto-link เข้า ออม/ลงทุน หรือ Kept
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center min-h-11 md:min-h-0 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
        >
          + บันทึกการซื้อ
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="น้ำหนักที่ถือ"
          value={`${formatNumber(summary.totalWeightBaht, { decimals: 4 })} บาท`}
          sub={`= ${formatNumber(summary.totalWeightGrams, { decimals: 2 })}g`}
        />
        <Kpi
          label="ลงทุนรวม"
          value={formatTHB(summary.totalInvested)}
          sub={
            summary.avgCostPerBaht > 0
              ? `เฉลี่ย ${formatTHB(summary.avgCostPerBaht, { decimals: 0 })}/บาท`
              : '—'
          }
        />
        <Kpi
          label="มูลค่าตลาด"
          value={hasMarketValue ? formatTHB(summary.marketValue) : '—'}
          sub={
            hasMarketValue
              ? `unrealized ${summary.unrealizedPnl >= 0 ? '+' : ''}${formatTHB(summary.unrealizedPnl)}`
              : 'ใส่ราคา spot ด้านล่าง'
          }
          tone={
            hasMarketValue
              ? summary.unrealizedPnl >= 0
                ? 'income'
                : 'expense'
              : 'default'
          }
        />
        <Kpi
          label="กำไรที่ขายแล้ว"
          value={formatTHB(summary.realizedPnl)}
          sub={`ขายไป ${summary.soldCount} ครั้ง`}
          tone={summary.realizedPnl >= 0 ? 'income' : 'expense'}
        />
      </div>

      {/* Spot price editor */}
      <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-4 space-y-2">
        <header className="flex items-center justify-between px-3 gap-2">
          <h2 className="text-sm font-semibold text-ink-700">
            ราคาทองปัจจุบัน
          </h2>
          <div className="flex items-center gap-3">
            {spotPrice?.updatedAt && (
              <span className="text-xs text-ink-400">
                อัปเดต {spotPrice.updatedAt.slice(0, 10)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleFetchSpot()}
              disabled={fetchingSpot}
              className="inline-flex items-center min-h-11 md:min-h-0 px-2.5 py-1 text-xs font-medium text-primary-ink bg-primary-50 border border-primary-ink/20 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {fetchingSpot ? '⏳ กำลังดึง...' : '🔄 ดึงจาก สมาคมค้าทองคำ'}
            </button>
          </div>
        </header>
        <div className="divide-y divide-ink-100">
          <SpotEntry purity="96.5" value={spotPrice?.['96.5']} />
          <SpotEntry purity="99.99" value={spotPrice?.['99.99']} />
        </div>
        {spotPrice?.autoFetchedAt && (
          <p className="px-3 pt-1 text-xs text-ink-500">
            🟢 96.5% จาก สมาคมค้าทองคำ
            {spotPrice.autoFetchedRound && ` · ${spotPrice.autoFetchedRound}`}
            {' · '}
            {new Date(spotPrice.autoFetchedAt).toLocaleString('th-TH', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
            })}
          </p>
        )}
        <p className="px-3 pt-1 text-xs text-ink-400">
          ราคาที่ใช้ = ราคาที่ร้านรับซื้อทองแท่ง (resale value). 99.99%
          ต้องกรอกเอง — API ไม่มีข้อมูล
        </p>
      </section>

      {/* Gold assistant */}
      <GoldAssistant assistant={assistant} />

      {/* Active holdings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">
          ยังถืออยู่ ({summary.activeCount})
        </h2>
        {summary.activeHoldings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 bg-card p-8 text-center">
            <p className="text-sm text-ink-500 mb-4">ยังไม่มีทองในพอร์ต</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center min-h-11 md:min-h-0 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
            >
              + บันทึกการซื้อ
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-ink-200 overflow-hidden">
            <div className="hidden lg:grid grid-cols-12 gap-2 px-3 py-2 bg-surface text-xs font-semibold text-ink-500 uppercase tracking-wider">
              <div className="col-span-2">วันที่</div>
              <div className="col-span-2">แบรนด์</div>
              <div className="col-span-1 text-right">บาท</div>
              <div className="col-span-2 text-right">ต้นทุน</div>
              <div className="col-span-2 text-right">มูลค่าตลาด</div>
              <div className="col-span-3" />
            </div>
            {summary.activeHoldings.map((h) => (
              <HoldingRow
                key={h.id}
                holding={h}
                marketValue={selectGoldHoldingMarketValue(snapshot, h)}
                onSell={setSellingHolding}
                onEdit={setEditing}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Sold holdings — collapsed by default */}
      {summary.soldHoldings.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowSold((v) => !v)}
            className="text-sm text-ink-600 hover:text-ink-900"
          >
            {showSold ? '▾' : '▸'} ขายไปแล้ว ({summary.soldCount})
          </button>
          {showSold && (
            <div className="bg-card rounded-lg border border-ink-200 overflow-hidden">
              <div className="hidden lg:grid grid-cols-12 gap-2 px-3 py-2 bg-surface text-xs font-semibold text-ink-500 uppercase tracking-wider">
                <div className="col-span-2">วันที่ซื้อ / ขาย</div>
                <div className="col-span-2">แบรนด์</div>
                <div className="col-span-1 text-right">บาท</div>
                <div className="col-span-2 text-right">ต้นทุน</div>
                <div className="col-span-2 text-right">ราคาขาย / P&L</div>
                <div className="col-span-3" />
              </div>
              {summary.soldHoldings.map((h) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  marketValue={null}
                  onEdit={setEditing}
                  onDelete={setPendingDelete}
                  onUnsell={handleUnsell}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="บันทึกการซื้อทอง"
        size="md"
      >
        <div className="px-6 py-5">
          <GoldForm
            onSaved={() => {
              setCreateOpen(false);
              pushToast({ message: 'บันทึกการซื้อแล้ว ✓', tone: 'success' });
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="แก้ไขข้อมูลทอง"
        size="md"
      >
        {editing && (
          <div className="px-6 py-5">
            <GoldForm
              initialValues={editing}
              onSaved={() => {
                setEditing(null);
                pushToast({ message: 'บันทึกแล้ว ✓', tone: 'success' });
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </Modal>

      {/* Sell modal */}
      <Modal
        open={sellingHolding != null}
        onClose={() => setSellingHolding(null)}
        title="บันทึกการขาย"
        size="md"
      >
        {sellingHolding && (
          <div className="px-6 py-5">
            <SellGoldForm
              holding={sellingHolding}
              onSaved={() => {
                setSellingHolding(null);
                pushToast({ message: 'บันทึกการขายแล้ว ✓', tone: 'success' });
              }}
              onCancel={() => setSellingHolding(null)}
            />
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="ลบรายการทอง"
        size="sm"
      >
        {pendingDelete && (
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className="text-sm text-ink-700">
                <span className="font-semibold">{pendingDelete.brand}</span>{' '}
                · {pendingDelete.weightBaht} บาท · ซื้อเมื่อ{' '}
                {pendingDelete.purchaseDate}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                ต้นทุน {formatTHB(pendingDelete.totalCost)}
                {pendingDelete.paymentMethod === 'cash' && (
                  <> · จ่ายเงินสด → สร้าง SavingsItem ไว้</>
                )}
                {pendingDelete.paymentMethod === 'kept' && (
                  <> · หัก Kept {formatTHB(pendingDelete.totalCost)} ไว้</>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleDelete(false)}
                className="px-4 py-2 text-sm font-medium text-ink-700 bg-card border border-ink-300 rounded-md hover:bg-hover text-left transition"
              >
                <span className="block">ลบทองอย่างเดียว</span>
                <span className="block text-xs text-ink-500 mt-0.5">
                  เก็บ side-effect ในเดือนนั้นไว้ (savings / kept ยังเดิม)
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-expense-dark text-left transition"
              >
                <span className="block">ลบทอง + revert side-effect</span>
                <span className="block text-xs text-expense-on-fill-100 mt-0.5">
                  {pendingDelete.paymentMethod === 'cash'
                    ? 'ลบ SavingsItem ของเดือนซื้อด้วย'
                    : 'คืน Kept ของเดือนซื้อด้วย'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm font-medium text-ink-600 hover:bg-hover rounded-md transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Gold assistant — rule-based signal cards from selectGoldAssistantSignals.
// Wording is intentionally framed as observations ("น่าสนใจ?", "พิจารณา?"),
// never directives, and the section header carries an explicit disclaimer.
// ---------------------------------------------------------------------------

interface GoldAssistantProps {
  assistant: ReturnType<typeof selectGoldAssistantSignals>;
}

const SIGNAL_TONE_CLASS: Record<AssistantSignalTone, string> = {
  buy: 'border-income-200 bg-income-50',
  sell: 'border-warning-200 bg-warning-50',
  neutral: 'border-ink-200 bg-surface',
  info: 'border-primary-200 bg-primary-50',
  warmup: 'border-ink-200 bg-card',
};

const SIGNAL_TONE_TEXT: Record<AssistantSignalTone, string> = {
  buy: 'text-income-700',
  sell: 'text-warning-700',
  neutral: 'text-ink-700',
  info: 'text-primary-700',
  warmup: 'text-ink-500',
};

const GoldAssistant = ({ assistant }: GoldAssistantProps): ReactNode => {
  const { signals, recentSnapshotCount, ma30Price, spotPrice } = assistant;

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-4 space-y-3">
      <header className="flex items-baseline justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-ink-700">
            🤖 ผู้ช่วยทอง
          </h2>
          <span className="text-xs text-ink-400">
            สัญญาณจากข้อมูลของคุณ · ไม่ใช่คำแนะนำการลงทุน
          </span>
        </div>
        {ma30Price != null && spotPrice != null && (
          <span className="text-xs text-ink-400">
            MA 30 วัน:{' '}
            <span className="financial-number tabular-nums text-ink-600">
              {formatTHB(ma30Price, { decimals: 0 })}
            </span>{' '}
            · {recentSnapshotCount} จุด
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {signals.map((sig) => (
          <div
            key={sig.id}
            className={`rounded-lg border px-3 py-2.5 ${SIGNAL_TONE_CLASS[sig.tone]}`}
          >
            <div
              className={`text-sm font-medium ${SIGNAL_TONE_TEXT[sig.tone]}`}
            >
              <span className="mr-1.5">{sig.emoji}</span>
              {sig.title}
            </div>
            <div className="text-xs text-ink-600 mt-1 leading-relaxed">
              {sig.detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Small KPI card
// ---------------------------------------------------------------------------

type KpiTone = 'default' | 'income' | 'expense';

const KPI_TONE: Record<KpiTone, string> = {
  default: 'text-ink-900',
  income: 'text-income-ink',
  expense: 'text-expense-ink',
};

const Kpi = ({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
}): ReactNode => (
  <div className="bg-card border border-ink-200 rounded-2xl shadow-sm p-4">
    <div className="text-xs text-ink-500 uppercase tracking-wider">
      {label}
    </div>
    <div
      className={`mt-1 text-xl font-bold financial-number tabular-nums ${KPI_TONE[tone]}`}
    >
      {value}
    </div>
    {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
  </div>
);

export default GoldPage;
