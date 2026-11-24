"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Rocket, Upload, Receipt, Check, Link2 } from "lucide-react";
import { Card, FadeIn, SectionTitle, inputCls, btnPrimary, btnGhost, StatusChip } from "./primitives";
import type { MilestoneStatus } from "@/lib/data";
import { useRouter } from "next/navigation";
import { createCampaign, submitEvidence, recordSpending, errorMessage, type CampaignCategory } from "@/lib/data";
import OfferingBuilder, { CATEGORIES, defaultOfferingForm, toOffering, validateOffering, type OfferingForm } from "./OfferingBuilder";

type MRow = { title: string; amount: string; deadline: string };

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>;
}

function Err({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{msg}</p> : null;
}

const DEMO_FOUNDER = "FrEsHbXq4m7Vt8u2y5cJ9kD1nP3rS6wA0bL2eH4gT7z";
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

function useFlash() {
  const [on, setOn] = useState(false);
  return [on, () => { setOn(true); setTimeout(() => setOn(false), 2200); }] as const;
}

export default function FounderClient({
  campaignId,
  campaignName,
  milestones,
}: {
  campaignId: string;
  campaignName: string;
  milestones: { index: number; title: string; status: MilestoneStatus }[];
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("500000");
  const [category, setCategory] = useState<CampaignCategory>("business");
  const [offer, setOffer] = useState<OfferingForm>(defaultOfferingForm);
  const [ms, setMs] = useState<MRow[]>([
    { title: "App live", amount: "150000", deadline: "" },
    { title: "1,000 paying customers", amount: "150000", deadline: "" },
    { title: "$20k MRR", amount: "100000", deadline: "" },
  ]);
  const [created, flashCreated] = useFlash();
  const [evidenceSent, flashEvidence] = useFlash();
  const [logged, flashLogged] = useFlash();

  const router = useRouter();
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [evIdx, setEvIdx] = useState(String(milestones.find((m) => m.status === "Pending")?.index ?? milestones[0]?.index ?? 1));
  const [evUri, setEvUri] = useState("");
  const [evErr, setEvErr] = useState<string | null>(null);
  const [spCat, setSpCat] = useState("Engineering");
  const [spAmt, setSpAmt] = useState("");
  const [spDesc, setSpDesc] = useState("");
  const [spErr, setSpErr] = useState<string | null>(null);

  const onCreate = async () => {
    setCreateErr(null);
    const offerErrors = validateOffering(offer);
    if (offerErrors.length) return setCreateErr(offerErrors[0]);
    const offering = toOffering(offer);
    try {
      const c = await createCampaign({
        category,
        offering,
        founder: DEMO_FOUNDER,
        name: name || "Untitled startup",
        tagline: `${name || "Untitled startup"} — milestone-based raise on Harvestia.`,
        problem: "Described in the founder data room.",
        solution: "Described in the founder data room.",
        useOfFunds: ms.map((m) => m.title).filter(Boolean),
        goalUsdc: goalN,
        equityBps: offering.equity?.equityBps ?? 0,
        raiseDeadline: inDays(45),
        milestones: ms.map((m, i) => ({
          title: m.title || `Milestone ${i + 1}`,
          description: m.title || `Milestone ${i + 1}`,
          releaseUsdc: Number(m.amount) || 0,
          deadline: m.deadline ? new Date(m.deadline).toISOString() : inDays(90 * (i + 1)),
        })),
      });
      setCreatedId(c.id);
      flashCreated();
      router.refresh();
    } catch (e) {
      setCreateErr(errorMessage(e));
    }
  };
  const onEvidence = async () => {
    setEvErr(null);
    if (!evUri) return setEvErr("Evidence URI is required");
    try {
      await submitEvidence(campaignId, Number(evIdx), evUri);
      flashEvidence();
      router.refresh();
    } catch (e) {
      setEvErr(errorMessage(e));
    }
  };
  const onSpend = async () => {
    setSpErr(null);
    const amt = Number(spAmt);
    if (!amt || !spDesc) return setSpErr("Amount and description are required");
    try {
      await recordSpending(campaignId, { description: `[${spCat}] ${spDesc}`, amountUsdc: amt });
      setSpAmt("");
      setSpDesc("");
      flashLogged();
      router.refresh();
    } catch (e) {
      setSpErr(errorMessage(e));
    }
  };

  const goalN = Number(goal) || 0;
  const upfront = goalN * 0.2;
  const allocated = ms.reduce((a, m) => a + (Number(m.amount) || 0), 0) + upfront;
  const balanced = goalN > 0 && Math.abs(allocated - goalN) < 1;

  const update = (i: number, k: keyof MRow, v: string) =>
    setMs((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <FadeIn>
        <Card className="p-6">
          <SectionTitle kicker="New campaign">Create a milestone raise</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Company name</Label>
              <input className={inputCls} placeholder="e.g. Ferrolab" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Funding goal (USDC)</Label>
              <input className={inputCls} inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as CampaignCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <OfferingBuilder value={offer} onChange={setOffer} />

          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Milestones</div>
            <div className="text-xs text-muted">
              Upfront 20% · <span className="text-ink">${upfront.toLocaleString("en-US")}</span>
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            <AnimatePresence initial={false}>
              {ms.map((m, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 border border-ink bg-paper p-2.5 sm:grid-cols-[32px_1fr_140px_150px_auto]">
                    <span className="grid h-8 w-8 place-items-center bg-ink/[0.05] text-xs font-semibold text-muted">M{i + 1}</span>
                    <input className={inputCls} placeholder="Milestone title" value={m.title} onChange={(e) => update(i, "title", e.target.value)} />
                    <input className={`${inputCls} hidden sm:block`} placeholder="Release $" value={m.amount} onChange={(e) => update(i, "amount", e.target.value)} />
                    <input type="date" className={`${inputCls} hidden sm:block [color-scheme:dark]`} value={m.deadline} onChange={(e) => update(i, "deadline", e.target.value)} />
                    <button
                      onClick={() => setMs((r) => r.filter((_, j) => j !== i))}
                      className="grid h-9 w-9 place-items-center text-muted transition hover:bg-[#B3261E]/10 hover:text-[#B3261E]"
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setMs((r) => [...r, { title: "", amount: "", deadline: "" }])}
            className={`${btnGhost} mt-3 w-full border-dashed`}
          >
            <Plus className="h-4 w-4" /> Add milestone
          </button>

          <div className={`mt-5 flex items-center justify-between  px-4 py-3 text-xs ${balanced ? "bg-signal/15 text-signal-ink" : "bg-navy/10 text-navy"}`}>
            <span>Allocated: ${allocated.toLocaleString("en-US")} of ${goalN.toLocaleString("en-US")}</span>
            <span>{balanced ? "Balanced ✓" : "Must equal goal"}</span>
          </div>
          <button onClick={onCreate} className={`${btnPrimary} mt-4 w-full py-3`}>
            {created ? <><Check className="h-4 w-4" /> Draft created on-chain</> : <><Rocket className="h-4 w-4" /> Create campaign</>}
          </button>
          <Err msg={createErr} />
          {createdId && <p role="status" className="mt-2 text-center text-xs text-signal-ink">Draft created · id {createdId} (awaiting reviewer approval)</p>}
          <p className="mt-3 text-center text-[11px] text-muted">
            5% success fee on raise · min 25 investors · your profile is public, investors stay private
          </p>
        </Card>
      </FadeIn>

      <div className="space-y-6">
        <FadeIn delay={0.08}>
          <Card className="p-6">
            <SectionTitle kicker={campaignName}>Submit milestone evidence</SectionTitle>
            <div className="mb-4 flex flex-wrap gap-2">
              {milestones.map((m) => (
                <div key={m.index} className="flex items-center gap-2 border border-ink bg-paper px-2.5 py-1.5 text-xs text-ink">
                  M{m.index} <StatusChip status={m.status} />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <Label>Milestone</Label>
                <select className={`${inputCls} [color-scheme:dark]`} value={evIdx} onChange={(e) => setEvIdx(e.target.value)}>
                  {milestones.map((m) => (
                    <option key={m.index} value={m.index}>M{m.index} — {m.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Evidence URI</Label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className={`${inputCls} pl-9`} placeholder="ipfs://… or https://…" value={evUri} onChange={(e) => setEvUri(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Summary for investors</Label>
                <textarea rows={3} className={inputCls} placeholder="What was delivered and how it can be verified…" />
              </div>
              <Err msg={evErr} />
              <button onClick={onEvidence} className={`${btnPrimary} w-full`}>
                {evidenceSent ? <><Check className="h-4 w-4" /> Submitted — 7-day vote opened</> : <><Upload className="h-4 w-4" /> Submit & open vote</>}
              </button>
            </div>
          </Card>
        </FadeIn>

        <FadeIn delay={0.14}>
          <Card className="p-6">
            <SectionTitle kicker="Public ledger">Log spending</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Category</Label>
                <select className={`${inputCls} [color-scheme:dark]`} value={spCat} onChange={(e) => setSpCat(e.target.value)}>
                  {["Engineering", "Fleet", "Farmers", "Marketing", "Legal", "Ops"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Amount (USDC)</Label>
                <input className={inputCls} placeholder="0.00" inputMode="decimal" value={spAmt} onChange={(e) => setSpAmt(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <input className={inputCls} placeholder="e.g. Route engine v2 contract" value={spDesc} onChange={(e) => setSpDesc(e.target.value)} />
              </div>
            </div>
            <Err msg={spErr} />
            <button onClick={onSpend} className={`${btnGhost} mt-4 w-full`}>
              {logged ? <><Check className="h-4 w-4 text-signal-ink" /> Logged to public ledger</> : <><Receipt className="h-4 w-4" /> Log expense</>}
            </button>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
