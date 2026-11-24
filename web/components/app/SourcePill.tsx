import { connection } from "next/server";
import { getSource } from "@/lib/data";

export default async function SourcePill() {
  await connection();
  const { source, privacyMode } = await getSource();
  const live = source === "live";
  return (
    <span
      title={live ? "Connected to the Harvestia API" : "API unreachable, showing demo data"}
      className={`stamp ${live ? "bg-ink text-paper border-ink" : "text-ink"}`}
    >
      <span className={`h-1.5 w-1.5 ${live ? "bg-signal" : "bg-ink"}`} />
      {live ? `Live data${privacyMode ? ` · ${privacyMode} privacy` : ""}` : "Demo data"}
    </span>
  );
}
