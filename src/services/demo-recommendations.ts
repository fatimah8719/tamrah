// Home-screen cards, computed by the advice engine (src/ai/advice.ts) from the palm's readings.
import { adviseLatest, LABEL_FIELD, type Advice, type ReadingRow } from "@/ai/advice";
import type { DemoState } from "@/lib/demo-store";

export interface Observation {
  title: string;
  detail: string;
  note: string;
}

export interface Recommendation {
  id: string;
  title: string;
  summary: string;
  reason: string;
  steps: string[];
  doneLabel: string;
  /** The advice behind this card, when a rule fired. */
  advice?: Advice;
  readingAt?: string;
}

const UNIT: Record<string, string> = {
  air_temperature_c: "°",
  air_humidity_pct: "%",
  soil_moisture_pct: "%",
  light_lux: " lux",
  uv_index: "",
};
const LABEL = Object.fromEntries(Object.entries(LABEL_FIELD).map(([label, f]) => [f, label]));

function palmSensors(state: DemoState) {
  return state.sensors.filter((s) => !state.palm || s.palmId === state.palm.id);
}

function duration(minutes: number) {
  if (minutes <= 90) return minutes >= 45 ? "خلال ساعة" : `خلال ${Math.round(minutes)} دقيقة`;
  const h = Math.round(minutes / 60);
  return h === 2 ? "خلال ساعتين" : h <= 10 ? `خلال ${h} ساعات` : `خلال ${h} ساعة`;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1))));

/** The most notable change between the last two readings ("وش لاحظ تمرة؟"). */
export function getObservation(state: DemoState): Observation {
  const { current, previous } = adviseLatest(palmSensors(state));
  if (!current)
    return {
      title: "لا توجد قراءات بعد",
      detail: "—",
      note: "أول ما يرسل الجهاز قراءة، تظهر هنا أهم ملاحظة.",
    };
  const note = "تابعي تغيّر القراءات خلال اليوم للاطمئنان على بيئة النخلة.";
  let best: { field: string; a: number; b: number; score: number } | null = null;
  if (previous)
    for (const [field, b] of Object.entries(current)) {
      const a = previous[field as keyof ReadingRow];
      if (field === "recorded_at" || typeof a !== "number" || typeof b !== "number" || a === b)
        continue;
      const score = Math.abs(b - a) / Math.max(Math.abs(a), 1);
      if (!best || score > best.score) best = { field, a, b, score };
    }
  if (best && previous) {
    const minutes = (Date.parse(current.recorded_at) - Date.parse(previous.recorded_at)) / 60000;
    const verb = best.b > best.a ? "ارتفعت" : "انخفضت";
    const u = UNIT[best.field] ?? "";
    return {
      title: `${LABEL[best.field]} ${verb} ${duration(minutes)}`,
      detail: `من ${num(best.a)}${u} إلى ${num(best.b)}${u}`,
      note,
    };
  }
  const t = current.air_temperature_c;
  return {
    title: "آخر قراءة",
    detail: t !== undefined ? `حرارة الجو ${num(t)}°` : "القراءات وصلت",
    note,
  };
}

/** The most important advice for the latest reading ("وش أسوي الحين؟"). */
export function getRecommendation(state: DemoState, stageAr?: string | null): Recommendation {
  const { advice, current } = adviseLatest(palmSensors(state), stageAr);
  const top = advice[0];
  if (!top || !current)
    return {
      id: "all-good",
      title: current ? "القراءات ضمن الحدود" : "بانتظار القراءات",
      summary: current
        ? "ما فيه شي يحتاج إجراء الحين."
        : "النصائح تظهر هنا بعد وصول قراءات الجهاز.",
      reason: "تمرة يقارن القراءات بحدود مبنية على دراسة جامعة الملك فيصل عن نضج التمر.",
      steps: ["تابعي القراءات خلال اليوم.", "صوّري العذق أسبوعيًا لمتابعة النضج."],
      doneLabel: "تم",
    };
  return {
    id: `${top.ruleId}-${current.recorded_at}`,
    title: top.title,
    summary: top.message,
    reason: top.reason,
    steps: top.steps,
    doneLabel: top.doneLabel,
    advice: top,
    readingAt: current.recorded_at,
  };
}
