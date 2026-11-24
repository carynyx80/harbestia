import { Suspense, type ReactNode } from "react";
import AppShell from "@/components/app/AppShell";
import SourcePill from "@/components/app/SourcePill";

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-12 w-72 bg-ink/10" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 border border-ink/20 bg-ink/[0.04]" />
        ))}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell pill={<Suspense fallback={null}><SourcePill /></Suspense>}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}
