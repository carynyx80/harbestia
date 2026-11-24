import Link from "next/link";
import type { ReactNode } from "react";

export function Button({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "ghost"; className?: string }) {
  const base = "group inline-flex items-center justify-center gap-2 border-2 border-ink px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-150";
  const v = variant === "primary"
    ? "bg-signal text-ink hover:bg-ink hover:text-paper"
    : "bg-transparent text-ink hover:bg-ink hover:text-paper";
  return <Link href={href} className={`${base} ${v} ${className}`}>{children}</Link>;
}
