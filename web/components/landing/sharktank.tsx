import { Check, Minus } from "lucide-react";
import { SectionHead, Serif } from "@/components/ui/reveal";

const beats = [
  { step: "The pitch", title: "Founders step into the tank", body: "Any crypto project pitches in public: the product, the ask, the milestones, and the faces behind it. No anon teams." },
  { step: "The sharks", title: "Investors stay in the dark", body: "Anyone can be a shark. Who you are, how much you put in and how you vote stay encrypted. No whale-watching, no copy-trading." },
  { step: "The deal", title: "Money moves only when they deliver", body: "Funds sit in a safe on Solana. Each milestone unlocks a slice after a private investor vote. Miss one and the rest comes back to you." },
];

const rows: [string, boolean, boolean, boolean][] = [
  ["Anyone can invest", false, true, true],
  ["Real ownership in the company", true, false, true],
  ["Investor identity & amount private", false, false, true],
  ["Money released only on milestones", false, false, true],
  ["Automatic refund if founders stall", false, false, true],
  ["Founders public and accountable", true, false, true],
];

const categories = ["Apps", "DeFi", "Games", "AI & infra", "Consumer brands", "Hardware", "Creators", "Anything onchain"];

function Mark({ on, hl }: { on: boolean; hl?: boolean }) {
  return on
    ? <span className={`mx-auto grid h-6 w-6 place-items-center border-2 border-ink ${hl ? "bg-ink text-signal" : "text-ink"}`} aria-label="Yes"><Check size={13} strokeWidth={3} /></span>
    : <span className="mx-auto grid h-6 w-6 place-items-center text-muted" aria-label="No"><Minus size={14} /></span>;
}

export function SharkTank() {
  return (
    <section id="shark-tank" className="px-4 py-20 sm:py-28">
      <SectionHead
        num="01"
        eyebrow="Shark Tank, onchain"
        title={<>Shark Tank for crypto. <Serif>Minus the cameras</Serif> on the sharks.</>}
        sub="Founders pitch anything they're building. Investors back them privately. And unlike TV, nobody walks away with the money until the work is done."
      />

      <div className="mx-auto mt-14 grid max-w-6xl border-y-2 border-ink md:grid-cols-3">
        {beats.map((b, i) => (
          <div key={b.step} className={`p-6 sm:p-7 ${i > 0 ? "border-t border-ink md:border-l md:border-t-0" : ""}`}>
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
              <span className="font-semibold">Act {["I", "II", "III"][i]}</span><span className="text-muted">{b.step}</span>
            </div>
            <div className="display mt-6 text-7xl font-black leading-none" aria-hidden><span className="hl">0{i + 1}</span></div>
            <h3 className="mt-4 text-2xl font-extrabold uppercase leading-tight w-cond">{b.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{b.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-6xl">
        <div className="mb-3 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-semibold">Table 1.1 — Comparison of funding venues</span><span className="hidden text-muted sm:inline">Source: Harvestia</span>
        </div>
        <div className="overflow-x-auto border-2 border-ink">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left font-mono text-[11px] uppercase tracking-[0.1em]">
                <th className="px-5 py-3 font-semibold">What you get</th>
                <th className="border-l border-rule px-3 py-3 text-center font-medium">TV pitch shows</th>
                <th className="border-l border-rule px-3 py-3 text-center font-medium">Crypto launchpads</th>
                <th className="border-l-2 border-ink bg-signal px-3 py-3 text-center font-bold text-ink">Harvestia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, tv, lp, us]) => (
                <tr key={label} className="border-t border-rule hover:bg-paper-2">
                  <td className="px-5 py-3.5">{label}</td>
                  <td className="border-l border-rule px-3 py-3.5"><Mark on={tv} /></td>
                  <td className="border-l border-rule px-3 py-3.5"><Mark on={lp} /></td>
                  <td className="border-l-2 border-ink bg-signal/15 px-3 py-3.5"><Mark on={us} hl /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-6xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">Pitch anything people want built</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <span key={c} className="border border-ink px-3 py-1.5 font-mono text-xs uppercase tracking-[0.06em] transition-colors hover:bg-ink hover:text-paper">
              <span className="text-muted">{String(i + 1).padStart(2, "0")}</span> {c}
            </span>
          ))}
        </div>
        <p className="w-cond display mt-12 border-t-2 border-ink pt-6 text-4xl font-black uppercase leading-[0.95] sm:text-6xl">
          Pitch like it&apos;s prime time. <Serif>Invest like a ghost.</Serif>
        </p>
      </div>
    </section>
  );
}
