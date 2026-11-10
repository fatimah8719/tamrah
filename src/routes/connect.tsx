import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Info, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader, DemoBadge } from "@/components/tamra/Brand";
import { PalmForm } from "@/components/tamra/PalmForm";
import { loadDemo, saveDemo, type PalmSetup } from "@/lib/demo-store";
import { modelConfig } from "@/services/analysis";
import { dbKey, resumeCloud } from "@/services/cloud";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "تمرة — اربط جهازك" },
      { name: "description", content: "اربط جهاز تمرة بحسابك وجهّز بيانات نخلتك." },
      { property: "og:title", content: "تمرة — اربط جهازك" },
      { property: "og:description", content: "اربط الجهاز بحسابك عبر رمز الإقران." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connect,
});

export function Connect() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState(false);
  const [paired, setPaired] = useState(false);
  const [palm, setPalm] = useState<PalmSetup>({
    id: "",
    name: "نخلتي",
    variety: "خلاص",
    sampleId: "العذق الأول",
  });
  useEffect(() => {
    void resumeCloud().then((ok) => {
      const d = loadDemo();
      if (!ok || !d.active) {
        void navigate({ to: "/" });
        return;
      }
      if (d.palm) {
        setPalm(d.palm);
        setPaired(!!d.device);
      }
    });
  }, [navigate]);
  function pair(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("اكتب رمز الجهاز.");
    setError(null);
    setPaired(true);
  }
  function start() {
    if (!palm.name.trim() || !palm.sampleId.trim()) return;
    const saved = {
      ...palm,
      id: palm.id || crypto.randomUUID(),
      name: palm.name.trim(),
      sampleId: palm.sampleId.trim(),
    };
    const d = loadDemo(),
      now = new Date().toISOString();
    // The pairing code becomes the device id. Real ownership checks need a trusted service.
    const deviceId = code.trim() ? dbKey(code.trim().toUpperCase()) : "demo-device";
    saveDemo({
      palm: saved,
      device: d.device
        ? { ...d.device, palmId: saved.id }
        : { id: deviceId, palmId: saved.id, linkedAt: now, lastSeen: now },
    });
    void navigate({ to: "/home" });
  }
  return (
    <div className="min-h-screen">
      <AppHeader>
        <DemoBadge />
      </AppHeader>
      <main className="mx-auto max-w-md px-5 py-8">
        {!paired ? (
          <>
            <h1 className="text-2xl font-bold">اربط جهازك</h1>
            <p className="mt-1 text-muted-foreground">
              الربط يوصل الجهاز بحسابك، ولا يضبط شبكة الواي فاي في الجهاز.
            </p>
            <Button
              variant="outline"
              className="mt-6 h-14 w-full gap-2 bg-card text-base"
              onClick={() => setScanMsg(true)}
            >
              <QrCode className="h-5 w-5" /> مسح رمز الجهاز
            </Button>
            {scanMsg && (
              <p
                role="status"
                className="mt-3 rounded-2xl bg-amber p-4 text-sm text-amber-foreground"
              >
                اكتبي رمز الجهاز الموجود أسفل رمز QR للمتابعة.
              </p>
            )}
            <form onSubmit={pair} className="mt-6 space-y-3" noValidate>
              <Label htmlFor="code">أو اكتب رمز الإقران</Label>
              <Input
                id="code"
                dir="ltr"
                autoCapitalize="characters"
                placeholder="TAMRA01"
                className="h-12 bg-card text-center text-lg tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-sm font-semibold text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="h-12 w-full text-base">
                ربط الجهاز
              </Button>
            </form>
            <Button onClick={() => setPaired(true)} className="mt-3 h-12 w-full text-base">
              استخدام الجهاز
            </Button>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" /> يمكنك إضافة الجهاز إلى نخلتك ثم بدء المتابعة.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => setPaired(false)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowRight className="h-4 w-4" /> رجوع
            </button>
            <h1 className="text-2xl font-bold">أضيفي نخلتك</h1>
            <p className="mb-6 mt-1 text-muted-foreground">عرّفنا على نخلتك.</p>
            <PalmForm value={palm} onChange={setPalm} />
            <div className="mt-5 space-y-2">
              <Label htmlFor="sample">اسم العينة أو العذق</Label>
              <Input
                id="sample"
                className="h-12 bg-card text-base"
                value={palm.sampleId}
                onChange={(e) => setPalm({ ...palm, sampleId: e.target.value })}
              />
            </div>
            {!modelConfig.supportedVarieties.includes(palm.variety) && (
              <p className="mt-3 rounded-2xl bg-amber p-4 text-sm text-amber-foreground">
                تحليل النضج غير متاح لهذا الصنف حاليًا. يمكنك حفظ النخلة وعرض الحساسات.
              </p>
            )}
            {!palm.name.trim() && (
              <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
                اكتب اسم النخلة.
              </p>
            )}
            <Button
              onClick={start}
              disabled={!palm.name.trim() || !palm.sampleId.trim()}
              className="mt-8 h-14 w-full rounded-2xl text-lg font-bold"
            >
              ابدأ المتابعة
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
