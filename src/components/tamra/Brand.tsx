import { useEffect, useState, type ReactNode } from "react";
import { loadDemo } from "@/lib/demo-store";

/** "معاينة" badge for the local preview; hidden once signed in with Firebase. */
export function DemoBadge({ label = "معاينة" }: { label?: string }) {
  const [cloud, setCloud] = useState(false);
  useEffect(() => setCloud(loadDemo().mode === "cloud"), []);
  if (cloud) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber px-3 py-1 text-xs font-semibold text-amber-foreground">
      {label}
    </span>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
        <span className="text-2xl font-extrabold text-primary">تمرة</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
