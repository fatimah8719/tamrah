import type {
  Analysis,
  Capture,
  Device,
  Intervention,
  PalmSetup,
  SensorReading,
} from "@/lib/demo-store";
export interface IntegrationAdapter {
  signIn(email: string, password: string): Promise<{ uid: string }>;
  currentUser(): Promise<{ uid: string } | null>;
  load(uid: string): Promise<{
    palm: PalmSetup | null;
    devices: Device[];
    images: Capture[];
    analyses: Analysis[];
    sensors: SensorReading[];
    interventions: Intervention[];
  }>;
  savePalm(uid: string, palm: PalmSetup): Promise<void>;
  claimDevice(uid: string, palmId: string, code: string): Promise<Device>;
  upload(uid: string, capture: Omit<Capture, "url">, file: File): Promise<Capture>;
  requestAnalysis(uid: string, imageId: string): Promise<Analysis>;
  subscribe(uid: string, onChange: () => void): () => void;
}
export const integration: IntegrationAdapter | null = null;
/**
 * Varieties the trained ripeness model (public/models/ripeness.json) has seen in training.
 * Its training photos: Barhi, Khalas, Meneifi, Naboot Saif, Sullaj.
 */
export const modelConfig = { supportedVarieties: ["خلاص", "برحي"] as string[] };
export const demoModelConfig = {
  supportedVarieties: ["خلاص", "سكري", "صقعي", "برحي", "عجوة", "رزيز"],
};
export const analysisLabels = {
  not_started: "لم يبدأ التحليل",
  processing: "جارٍ التحليل",
  completed: "اكتمل التحليل",
  failed: "تعذّر التحليل",
  unsuitable: "صورة غير مناسبة",
};
export function validateResult(result: Analysis) {
  if (
    !result.palmId ||
    !result.sampleId ||
    !result.imageId ||
    !result.variety ||
    !result.modelVersion ||
    !result.measurement ||
    !Number.isFinite(Date.parse(result.capturedAt)) ||
    !Number.isFinite(Date.parse(result.analyzedAt))
  )
    throw new Error("بيانات التحليل غير مكتملة");
  if (
    result.ripePercent !== undefined &&
    (!Number.isFinite(result.ripePercent) || result.ripePercent < 0 || result.ripePercent > 100)
  )
    throw new Error("نسبة غير صالحة");
  if (
    result.confidence !== undefined &&
    (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1)
  )
    throw new Error("ثقة غير صالحة");
  if (result.status === "completed" && !result.stage && result.ripePercent === undefined)
    throw new Error("النتيجة مفقودة");
  return result;
}
