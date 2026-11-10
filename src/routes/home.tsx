import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Settings, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader, DemoBadge } from "@/components/tamra/Brand";
import { PalmIllustration } from "@/components/tamra/PalmIllustration";
import { PalmForm } from "@/components/tamra/PalmForm";
import {
  formatReading,
  isStale,
  snapshotFromSensors,
  type Reading,
  type SensorSnapshot,
} from "@/data/demo-sensors";
import { getObservation, getRecommendation } from "@/services/demo-recommendations";
import {
  connected,
  loadDemo,
  saveDemo,
  SYNC_EVENT,
  type DemoState,
  type PalmSetup,
} from "@/lib/demo-store";
import { exitApp, recordAdvice, resumeCloud } from "@/services/cloud";

import { preparePreview } from "@/services/presentation-preview";
export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "تمرة — كيف حال نخلتي؟" },
      { name: "description", content: "قراءات نخلتك الآن، وش لاحظ تمرة، ووش تسوي الحين." },
      { property: "og:title", content: "تمرة — كيف حال نخلتي؟" },
      { property: "og:description", content: "قراءات وتوصيات بسيطة لمزارعي النخيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; data: SensorSnapshot };

export function Home() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [readingsOpen, setReadingsOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = useCallback(() => {
    const d = loadDemo();
    const data = d.palm ? snapshotFromSensors(d.sensors, d.palm.id) : null;
    setLoad(data ? { state: "ready", data } : { state: "error" });
  }, []);

  useEffect(() => {
    let alive = true;
    const onSync = () => {
      const d = loadDemo();
      if (!d.palm) return void navigate({ to: "/connect" });
      setDemo(d);
      refresh();
    };
    void resumeCloud().then((ok) => {
      if (!alive) return;
      if (!ok) return void navigate({ to: "/" });
      const d = preparePreview();
      if (!d.active) return void navigate({ to: "/" });
      if (!d.palm) return void navigate({ to: "/connect" });
      setDemo(d);
      refresh();
      window.addEventListener(SYNC_EVENT, onSync);
    });
    return () => {
      alive = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, [navigate, refresh]);

  const latestStage = demo?.palm
    ? demo.analyses
        .filter(
          (a) =>
            a.status === "completed" &&
            a.palmId === demo.palm!.id &&
            a.sampleId === demo.palm!.sampleId &&
            a.variety === demo.palm!.variety,
        )
        .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt))[0]?.stage
    : undefined;
  const rec = demo?.palm ? getRecommendation(demo, latestStage) : null;
  useEffect(() => {
    if (rec?.advice && rec.readingAt) void recordAdvice(rec.advice, rec.readingAt);
  }, [rec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!demo?.palm || !rec) return null;
  const obs = getObservation(demo);
  const palm = demo.palm;
  const stage =
    demo.analyses
      .filter(
        (a) =>
          a.status === "completed" &&
          a.palmId === palm.id &&
          a.sampleId === palm.sampleId &&
          a.variety === palm.variety,
      )
      .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt))[0]?.stage ||
    "لم يبدأ التحليل";
  const done = (demo.actions || []).find((a) => a.id === rec.id);
  const snap = load.state === "ready" ? load.data : null;
  const live = snap && connected(demo.device) && !isStale(snap);

  const recId = rec.id;
  function confirmDone() {
    const next = saveDemo({
      actions: [
        ...(demo!.actions || []).filter((a) => a.id !== recId),
        { id: recId, at: Date.now() },
      ],
    });
    setDemo(next);
    setStepsOpen(false);
    toast.success("تم تسجيل الفحص", {
      description: "انحفظت الخطوة في سجل المتابعة.",
    });
  }

  return (
    <div className="min-h-screen pb-12">
      <AppHeader>
        <DemoBadge />
        <Button
          variant="secondary"
          size="icon"
          aria-label="الإعدادات"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main className="mx-auto max-w-5xl px-5 pt-6">
        <h1 className="text-2xl font-bold md:text-3xl">كيف حال {palm.name}؟</h1>
        <p className="text-muted-foreground">
          {palm.variety} · مرحلة {stage}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <section className="flex items-center gap-4 rounded-3xl bg-secondary p-5 md:flex-col md:justify-center md:text-center">
            <PalmIllustration className="h-28 w-28 shrink-0 md:h-44 md:w-44" />
            <div>
              <p className="text-xl font-bold">{palm.name}</p>
              <p className="text-muted-foreground">
                {palm.variety} · {stage}
              </p>
              <ConnectionPill load={load} live={!!live} />
            </div>
          </section>

          <section className="rounded-3xl bg-amber p-6 text-amber-foreground">
            <p className="text-sm font-semibold">وش لاحظ تمرة؟</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">{obs.title}</h2>
            <p dir="rtl" className="mt-3 text-2xl font-extrabold text-foreground">
              {obs.detail}
            </p>
            <p className="mt-4 text-sm">{obs.note}</p>
          </section>

          <section className="flex flex-col rounded-3xl bg-primary p-6 text-primary-foreground">
            <p className="text-sm opacity-80">وش أسوي الحين؟</p>
            <h2 className="mt-2 text-2xl font-bold">{rec.title}</h2>
            <p className="mt-2 text-sm opacity-90">{rec.summary}</p>
            {done && (
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" /> فحصتها{" "}
                {new Date(done.at).toLocaleTimeString("ar-SA", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
            <Button
              variant="secondary"
              className="mt-auto h-12 w-full text-base font-bold md:mt-6"
              onClick={() => setStepsOpen(true)}
            >
              شوف الخطوات
            </Button>
            <p className="mt-3 text-xs opacity-75">توصية توضيحية، وليست علاجًا زراعيًا معتمدًا.</p>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold">القراءات الآن</h2>
          {load.state === "loading" ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : !live ? (
            <Offline onRetry={refresh} />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {snap!.readings.map((r) => (
                <div
                  key={r.key}
                  className={
                    r.key === "temperature" || r.key === "humidity" ? "" : "hidden md:block"
                  }
                >
                  <ReadingCard r={r} />
                </div>
              ))}
            </div>
          )}
          <Button
            variant="secondary"
            className="mt-3 h-12 w-full text-base md:hidden"
            onClick={() => setReadingsOpen(true)}
            disabled={!live}
          >
            عرض باقي القراءات
          </Button>
          {live && (
            <p className="mt-3 text-xs text-muted-foreground">
              آخر تحديث:{" "}
              {new Date(snap!.updatedAt).toLocaleTimeString("ar-SA", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </section>
        <Button
          onClick={() => navigate({ to: "/tracking" })}
          className="mt-6 h-12 w-full text-base"
        >
          متابعة نضج التمر وسجل التحليلات
        </Button>
      </main>

      <Sheet open={readingsOpen} onOpenChange={setReadingsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-background"
        >
          <SheetHeader className="text-right">
            <SheetTitle>كل القراءات</SheetTitle>
            <SheetDescription>قراءات الجهاز ووقت آخر تحديث.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-3 px-4 pb-6">
            {snap?.readings.map((r) => (
              <ReadingCard key={r.key} r={r} wide />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={stepsOpen} onOpenChange={setStepsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-background"
        >
          <SheetHeader className="text-right">
            <SheetTitle className="text-2xl">{rec.title}</SheetTitle>
            <SheetDescription>مثال توضيحي، وليس علاجًا زراعيًا معتمدًا.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <div className="rounded-2xl bg-card p-4">
              <h3 className="font-bold">ليش هذا الاقتراح؟</h3>
              <p className="mt-1 text-muted-foreground">{rec.reason}</p>
            </div>
            <div className="rounded-2xl bg-card p-4">
              <h3 className="mb-3 font-bold">وش تسوي؟</h3>
              <ol className="space-y-3">
                {rec.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <Button className="h-12 w-full text-base font-bold" onClick={confirmDone}>
              {rec.doneLabel}
            </Button>
            <Button
              variant="secondary"
              className="h-12 w-full text-base"
              onClick={() => setStepsOpen(false)}
            >
              الرجوع لنخلتي
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        palm={palm}
        onSave={(p) => {
          setDemo(saveDemo({ palm: p }));
          setSettingsOpen(false);
          toast.success("انحفظت التغييرات");
        }}
        onRepair={() => {
          navigate({ to: "/connect" });
        }}
        onExit={() => {
          void exitApp().then(() => navigate({ to: "/" }));
        }}
      />
    </div>
  );
}

function ConnectionPill({ load, live }: { load: Load; live: boolean }) {
  const text =
    load.state === "loading" ? "جاري الاتصال…" : live ? "الجهاز متصل" : "الجهاز غير متصل";
  return (
    <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold">
      <span
        className={
          live ? "h-2 w-2 rounded-full bg-primary" : "h-2 w-2 rounded-full bg-muted-foreground"
        }
      />
      {text}
    </span>
  );
}

function ReadingCard({ r, wide }: { r: Reading; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-card p-4 ${wide ? "flex items-center justify-between" : ""}`}>
      <div>
        <p className="text-sm text-muted-foreground">{r.label}</p>
        {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
      </div>
      <p dir="ltr" className={`text-2xl font-extrabold ${wide ? "" : "mt-2 text-right"}`}>
        {formatReading(r)}
      </p>
    </div>
  );
}

function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center">
      <WifiOff className="h-6 w-6 text-muted-foreground" />
      <p>ما فيه قراءات حالية. الجهاز غير متصل أو القراءات قديمة.</p>
      <Button variant="secondary" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" /> حاول مرة ثانية
      </Button>
    </div>
  );
}

function SettingsSheet({
  open,
  onOpenChange,
  palm,
  onSave,
  onRepair,
  onExit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  palm: PalmSetup;
  onSave: (p: PalmSetup) => void;
  onRepair: () => void;
  onExit: () => void;
}) {
  const [draft, setDraft] = useState(palm);
  useEffect(() => {
    if (open) setDraft(palm);
  }, [open, palm]);
  const valid = draft.name.trim().length > 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-background"
      >
        <SheetHeader className="text-right">
          <SheetTitle>الإعدادات</SheetTitle>
          <SheetDescription>إعدادات النخلة والجهاز.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <PalmForm value={draft} onChange={setDraft} />
          {!valid && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              اكتب اسم النخلة.
            </p>
          )}
          <Button
            className="h-12 w-full text-base"
            disabled={!valid}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
          >
            حفظ
          </Button>
          <Button variant="secondary" className="h-12 w-full text-base" onClick={onRepair}>
            إعادة ربط الجهاز
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full text-base text-destructive"
            onClick={onExit}
          >
            تسجيل الخروج
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
