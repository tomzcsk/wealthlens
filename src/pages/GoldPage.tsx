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

import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';

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
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 rounded-md hover:bg-slate-50">
        <span className="text-sm text-slate-600">{PURITY_LABELS[purity]}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm financial-number tabular-nums text-slate-900">
            {value != null ? `${formatTHB(value)} / บาท` : '—'}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(value != null ? formatNumber(value) : '');
              setEditing(true);
            }}
            className="text-xs text-primary hover:text-primary-dark"
          >
            แก้ไข
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="text-sm text-slate-600 shrink-0">
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
        className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-sm financial-number text-right focus:outline-none focus:ring-2 focus:ring-primary"
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
        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900"
      >
        ยกเลิก
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Holding row — used in both active and sold tables
// ---------------------------------------------------------------------------

interface HoldingRowProps {
  holding: GoldHolding;
  marketValue: number | null;
  onSell?: (h: GoldHolding) => void;
  onEdit: (h: GoldHolding) => void;
  onDelete: (h: GoldHolding) => void;
  onUnsell?: (h: GoldHolding) => void;
}

const HoldingRow = ({
  holding,
  marketValue,
  onSell,
  onEdit,
  onDelete,
  onUnsell,
}: HoldingRowProps): ReactNode => {
  const isSold = holding.sold != null;
  const pricePerBaht = holding.totalCost / holding.weightBaht;
  const unrealizedPnl =
    !isSold && marketValue != null ? marketValue - holding.totalCost : null;
  const realizedPnl = isSold && holding.sold
    ? holding.sold.soldPrice - holding.totalCost
    : null;

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 border-b border-slate-100 last:border-b-0 text-sm hover:bg-slate-50 transition">
      <div className="col-span-2 text-slate-700">
        <div>{holding.purchaseDate}</div>
        {isSold && holding.sold && (
          <div className="text-xs text-slate-400 mt-0.5">
            ขาย {holding.sold.soldDate}
          </div>
        )}
      </div>
      <div className="col-span-2 min-w-0">
        <div className="text-slate-900 truncate" title={holding.brand}>
          {holding.brand}
        </div>
        <div className="text-xs text-slate-500">
          {TYPE_LABELS[holding.type]} · {holding.purity}%
        </div>
      </div>
      <div className="col-span-1 text-right">
        <div className="financial-number tabular-nums text-slate-900">
          {holding.weightBaht}
        </div>
        <div className="text-xs text-slate-400">
          {formatNumber(holding.weightBaht * GRAMS_PER_BAHT, { decimals: 2 })}g
        </div>
      </div>
      <div className="col-span-2 text-right financial-number tabular-nums text-slate-900">
        {formatTHB(holding.totalCost)}
        <div className="text-xs text-slate-400">
          {formatTHB(pricePerBaht, { decimals: 0 })}/บาท
        </div>
      </div>
      <div className="col-span-2 text-right">
        {isSold && realizedPnl != null && holding.sold ? (
          <>
            <div className="financial-number tabular-nums text-slate-900">
              {formatTHB(holding.sold.soldPrice)}
            </div>
            <div
              className={`text-xs financial-number ${
                realizedPnl >= 0 ? 'text-income' : 'text-expense'
              }`}
            >
              {realizedPnl >= 0 ? '+' : ''}
              {formatTHB(realizedPnl)}
            </div>
          </>
        ) : marketValue != null ? (
          <>
            <div className="financial-number tabular-nums text-slate-900">
              {formatTHB(marketValue)}
            </div>
            {unrealizedPnl != null && (
              <div
                className={`text-xs financial-number ${
                  unrealizedPnl >= 0 ? 'text-income' : 'text-expense'
                }`}
              >
                {unrealizedPnl >= 0 ? '+' : ''}
                {formatTHB(unrealizedPnl)}
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
      <div className="col-span-3 flex items-center justify-end gap-1.5">
        {!isSold && onSell && (
          <button
            type="button"
            onClick={() => onSell(holding)}
            className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition"
          >
            💰 ขาย
          </button>
        )}
        {isSold && onUnsell && (
          <button
            type="button"
            onClick={() => onUnsell(holding)}
            className="px-2 py-1 text-xs text-slate-500 border border-slate-200 rounded hover:bg-slate-50 transition"
          >
            ↩️ ยกเลิกขาย
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(holding)}
          aria-label={`แก้ไข ${holding.brand}`}
          className="p-1 text-slate-400 hover:text-primary transition"
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => onDelete(holding)}
          aria-label={`ลบ ${holding.brand}`}
          className="p-1 text-slate-400 hover:text-expense transition"
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

  const handleFetchSpot = async (): Promise<void> => {
    if (fetchingSpot) return;
    setFetchingSpot(true);
    try {
      const result = await fetchGoldSpotPrice();
      applyFetchedGoldPrice(result.price965, result.round);
      pushToast({
        message: `ดึงราคาทอง 96.5% สำเร็จ: ${formatTHB(result.price965, { decimals: 0 })}/บาท`,
        tone: 'success',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      pushToast({
        message: `ดึงราคาทองไม่สำเร็จ — ${reason}`,
        tone: 'error',
      });
    } finally {
      setFetchingSpot(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-slate-900">🪙 ทองคำ</h1>
          <p className="text-sm text-slate-500 mt-1">
            asset ledger ทุกการซื้อ-ขายทองคำ — auto-link เข้า ออม/ลงทุน หรือ Kept
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
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
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
        <header className="flex items-center justify-between px-3 gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            ราคาทองปัจจุบัน
          </h2>
          <div className="flex items-center gap-3">
            {spotPrice?.updatedAt && (
              <span className="text-xs text-slate-400">
                อัปเดต {spotPrice.updatedAt.slice(0, 10)}
              </span>
            )}
            <button
              type="button"
              onClick={handleFetchSpot}
              disabled={fetchingSpot}
              className="px-2.5 py-1 text-xs font-medium text-primary bg-primary-light border border-primary/20 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {fetchingSpot ? '⏳ กำลังดึง...' : '🔄 ดึงจาก สมาคมค้าทองคำ'}
            </button>
          </div>
        </header>
        <div className="divide-y divide-slate-100">
          <SpotEntry purity="96.5" value={spotPrice?.['96.5']} />
          <SpotEntry purity="99.99" value={spotPrice?.['99.99']} />
        </div>
        {spotPrice?.autoFetchedAt && (
          <p className="px-3 pt-1 text-xs text-slate-500">
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
        <p className="px-3 pt-1 text-xs text-slate-400">
          ราคาที่ใช้ = ราคาที่ร้านรับซื้อทองแท่ง (resale value). 99.99%
          ต้องกรอกเอง — API ไม่มีข้อมูล
        </p>
      </section>

      {/* Gold assistant */}
      <GoldAssistant assistant={assistant} />

      {/* Active holdings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          ยังถืออยู่ ({summary.activeCount})
        </h2>
        {summary.activeHoldings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500 mb-4">ยังไม่มีทองในพอร์ต</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
            >
              + บันทึกการซื้อ
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            {showSold ? '▾' : '▸'} ขายไปแล้ว ({summary.soldCount})
          </button>
          {showSold && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{pendingDelete.brand}</span>{' '}
                · {pendingDelete.weightBaht} บาท · ซื้อเมื่อ{' '}
                {pendingDelete.purchaseDate}
              </p>
              <p className="mt-1 text-xs text-slate-500">
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
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 text-left transition"
              >
                <span className="block">ลบทองอย่างเดียว</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  เก็บ side-effect ในเดือนนั้นไว้ (savings / kept ยังเดิม)
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-red-700 text-left transition"
              >
                <span className="block">ลบทอง + revert side-effect</span>
                <span className="block text-xs text-red-100 mt-0.5">
                  {pendingDelete.paymentMethod === 'cash'
                    ? 'ลบ SavingsItem ของเดือนซื้อด้วย'
                    : 'คืน Kept ของเดือนซื้อด้วย'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md transition"
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
  buy: 'border-emerald-200 bg-emerald-50',
  sell: 'border-amber-200 bg-amber-50',
  neutral: 'border-slate-200 bg-slate-50',
  info: 'border-blue-200 bg-blue-50',
  warmup: 'border-slate-200 bg-white',
};

const SIGNAL_TONE_TEXT: Record<AssistantSignalTone, string> = {
  buy: 'text-emerald-700',
  sell: 'text-amber-700',
  neutral: 'text-slate-700',
  info: 'text-blue-700',
  warmup: 'text-slate-500',
};

const GoldAssistant = ({ assistant }: GoldAssistantProps): ReactNode => {
  const { signals, recentSnapshotCount, ma30Price, spotPrice } = assistant;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <header className="flex items-baseline justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            🤖 ผู้ช่วยทอง
          </h2>
          <span className="text-xs text-slate-400">
            สัญญาณจากข้อมูลของคุณ · ไม่ใช่คำแนะนำการลงทุน
          </span>
        </div>
        {ma30Price != null && spotPrice != null && (
          <span className="text-xs text-slate-400">
            MA 30 วัน:{' '}
            <span className="financial-number tabular-nums text-slate-600">
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
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
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
  default: 'text-slate-900',
  income: 'text-income',
  expense: 'text-expense',
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
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
    <div className="text-xs text-slate-500 uppercase tracking-wider">
      {label}
    </div>
    <div
      className={`mt-1 text-xl font-bold financial-number tabular-nums ${KPI_TONE[tone]}`}
    >
      {value}
    </div>
    {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
  </div>
);

export default GoldPage;
