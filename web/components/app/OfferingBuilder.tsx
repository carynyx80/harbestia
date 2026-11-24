"use client";

import { inputCls } from "./primitives";
import { describeOffering, type CampaignCategory, type Offering, type OfferingKind } from "@/lib/data";

export const CATEGORIES: { value: CampaignCategory; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "consumer", label: "Consumer brand" },
  { value: "saas", label: "SaaS" },
  { value: "crypto", label: "Crypto project" },
  { value: "hardware", label: "Hardware" },
  { value: "creator", label: "Creator" },
  { value: "other", label: "Other" },
];

export type OfferingForm = {
  kind: OfferingKind;
  equityPct: string;
  basis: "revenue" | "profit";
  sharePct: string;
  graceDays: string;
  symbol: string;
  supply: string;
  allocPct: string;
  launch: string;
  cliff: string;
  vesting: string;
};

export const defaultOfferingForm: OfferingForm = {
  kind: "equity",
  equityPct: "10",
  basis: "revenue",
  sharePct: "8",
  graceDays: "90",
  symbol: "",
  supply: "100000000",
  allocPct: "15",
  launch: "",
  cliff: "0",
  vesting: "12",
};

const hasEq = (k: OfferingKind) => k !== "token";
const hasTok = (k: OfferingKind) => k !== "equity";

/** Returns field errors (empty = valid). */
export function validateOffering(f: OfferingForm): string[] {
  const e: string[] = [];
  const n = (s: string) => Number(s);
  if (hasEq(f.kind)) {
    if (!(n(f.equityPct) > 0 && n(f.equityPct) <= 49)) e.push("Equity % must be between 0 and 49.");
    if (!(n(f.sharePct) > 0 && n(f.sharePct) <= 100)) e.push("Monthly payout % must be between 0 and 100.");
    if (!(n(f.graceDays) >= 0 && n(f.graceDays) <= 365)) e.push("Grace period must be 0–365 days.");
  }
  if (hasTok(f.kind)) {
    if (!/^[A-Z0-9]{2,10}$/.test(f.symbol)) e.push("Token symbol: 2–10 letters/digits.");
    if (!(n(f.supply) > 0)) e.push("Total supply must be positive.");
    if (!(n(f.allocPct) > 0 && n(f.allocPct) <= 100)) e.push("Investor allocation % must be between 0 and 100.");
    if (!f.launch) e.push("Target launch date is required.");
    if (!(n(f.cliff) >= 0) || !(n(f.vesting) >= 1)) e.push("Cliff ≥ 0 and vesting ≥ 1 month.");
  }
  return e;
}

export function toOffering(f: OfferingForm): Offering {
  const bps = (s: string) => Math.round((Number(s) || 0) * 100);
  const o: Offering = { kind: f.kind };
  if (hasEq(f.kind))
    o.equity = {
      equityBps: bps(f.equityPct),
      payout: { basis: f.basis, shareBps: bps(f.sharePct), frequency: "monthly", startsAfterDays: Number(f.graceDays) || 0 },
    };
  if (hasTok(f.kind))
    o.token = {
      symbol: f.symbol || "TKN",
      totalSupply: Number(f.supply) || 0,
      investorAllocationBps: bps(f.allocPct),
      targetLaunchDate: f.launch ? new Date(f.launch).toISOString() : new Date(0).toISOString(),
      vesting: { cliffMonths: Number(f.cliff) || 0, months: Number(f.vesting) || 12 },
    };
  return o;
}

function L({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</label>;
}

export default function OfferingBuilder({ value, onChange }: { value: OfferingForm; onChange: (f: OfferingForm) => void }) {
  const set = (k: keyof OfferingForm, v: string) => onChange({ ...value, [k]: v });
  const errors = validateOffering(value);
  const preview = describeOffering(toOffering(value));
  const kinds: { k: OfferingKind; label: string }[] = [
    { k: "equity", label: "Equity + monthly payouts" },
    { k: "token", label: "Token" },
    { k: "both", label: "Both" },
  ];
  return (
    <div className="mt-6 border-t-2 border-ink pt-4">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-ink">Offering</div>
      <div className="w-cond mt-1 text-lg font-black uppercase text-ink">What do investors get?</div>
      <div role="radiogroup" aria-label="What do investors get?" className="mt-3 grid grid-cols-3 border-2 border-ink">
        {kinds.map(({ k, label }, i) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value.kind === k}
            onClick={() => set("kind", k)}
            className={`px-2 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              i > 0 ? "border-l-2 border-ink" : ""
            } ${value.kind === k ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-2"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {hasEq(value.kind) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <L>Equity sold (%)</L>
            <input className={inputCls} inputMode="decimal" value={value.equityPct} onChange={(e) => set("equityPct", e.target.value)} />
          </div>
          <div>
            <L>Payout basis</L>
            <select className={inputCls} value={value.basis} onChange={(e) => set("basis", e.target.value)}>
              <option value="revenue">Revenue</option>
              <option value="profit">Profit</option>
            </select>
          </div>
          <div>
            <L>% paid monthly</L>
            <input className={inputCls} inputMode="decimal" value={value.sharePct} onChange={(e) => set("sharePct", e.target.value)} />
          </div>
          <div>
            <L>Grace (days)</L>
            <input className={inputCls} inputMode="numeric" value={value.graceDays} onChange={(e) => set("graceDays", e.target.value)} />
          </div>
        </div>
      )}

      {hasTok(value.kind) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <L>Token symbol</L>
            <input className={inputCls} placeholder="e.g. GRID" value={value.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
          </div>
          <div>
            <L>Total supply</L>
            <input className={inputCls} inputMode="numeric" value={value.supply} onChange={(e) => set("supply", e.target.value)} />
          </div>
          <div>
            <L>Investor allocation (%)</L>
            <input className={inputCls} inputMode="decimal" value={value.allocPct} onChange={(e) => set("allocPct", e.target.value)} />
          </div>
          <div>
            <L>Target launch date</L>
            <input type="date" className={inputCls} value={value.launch} onChange={(e) => set("launch", e.target.value)} />
          </div>
          <div>
            <L>Cliff (months)</L>
            <input className={inputCls} inputMode="numeric" value={value.cliff} onChange={(e) => set("cliff", e.target.value)} />
          </div>
          <div>
            <L>Vesting (months)</L>
            <input className={inputCls} inputMode="numeric" value={value.vesting} onChange={(e) => set("vesting", e.target.value)} />
          </div>
        </div>
      )}

      <div className="mt-4 border-2 border-ink bg-paper-2 p-3" aria-live="polite">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Term-sheet preview</div>
        {preview.map((p) => (
          <p key={p} className="mt-1 text-sm text-ink">{p}</p>
        ))}
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-0.5 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
