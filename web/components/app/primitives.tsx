"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { MilestoneStatus } from "@/lib/data";

export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: delay * 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border border-ink bg-paper ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="mb-4 border-t-2 border-ink pt-2">
      {kicker && (
        <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-ink">
          {kicker}
        </div>
      )}
      <h2 className="w-cond text-xl font-black uppercase text-ink">{children}</h2>
    </div>
  );
}

const chipStyles: Record<MilestoneStatus, string> = {
  Released: "bg-ink text-paper border-ink",
  Voting: "bg-signal text-ink border-ink",
  Pending: "text-muted border-current",
  Rejected: "text-[#B3261E] border-current",
  Resubmitted: "text-navy border-current",
  Refunded: "text-ink border-current border-dashed",
};

export function StatusChip({ status }: { status: MilestoneStatus }) {
  return (
    <span className={`stamp ${chipStyles[status]}`}>
      {status === "Voting" && <span className="h-1.5 w-1.5 animate-pulse bg-current" />}
      {status}
    </span>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2.5 w-full overflow-hidden border border-ink bg-paper ${className}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value)}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="h-full bg-signal"
      />
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <FadeIn className="mb-8 flex flex-col gap-4 border-b-2 border-ink pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="w-cond text-4xl font-black uppercase leading-[0.9] text-ink md:text-6xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </FadeIn>
  );
}

export const inputCls =
  "w-full rounded-none border border-ink bg-white px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/30";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-none border-2 border-ink bg-signal px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-none border-2 border-ink bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-paper";
