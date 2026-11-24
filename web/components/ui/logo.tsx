// Harvestia "vault stencil" H: an H cut into five pieces like a vault door,
// with the crossbar (the locked funds) in signal orange.
type Props = { size?: number; tone?: "ink" | "paper"; className?: string; title?: string };

export function LogoMark({ size = 28, tone = "ink", className = "", title = "Harvestia" }: Props) {
  const fill = tone === "ink" ? "var(--ink, #111111)" : "var(--paper, #F2EFE8)";
  return (
    <svg width={size} height={size} viewBox="20 16 80 88" className={className} role="img" aria-label={title}>
      <rect x="26" y="22" width="18" height="34" fill={fill} />
      <rect x="26" y="64" width="18" height="34" fill={fill} />
      <rect x="76" y="22" width="18" height="34" fill={fill} />
      <rect x="76" y="64" width="18" height="34" fill={fill} />
      <rect x="48" y="52" width="24" height="16" fill="var(--signal, #FF4D00)" />
    </svg>
  );
}

export function Logo({ size = 26, tone = "ink", className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} />
      <span className="w-wide display text-lg font-black uppercase tracking-tight">Harvestia</span>
    </span>
  );
}
