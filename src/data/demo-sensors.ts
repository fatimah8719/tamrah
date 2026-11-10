// Demo sensor data. Replace `fetchReadings` with the real device integration later.
export type ReadingStatus = "ok" | "uncalibrated" | "missing";

export interface Reading {
  key: "temperature" | "humidity" | "soil" | "light" | "uv";
  label: string;
  value: number | null;
  unit: string;
  status: ReadingStatus;
  note?: string;
}

export interface SensorSnapshot {
  connection: "connected" | "disconnected";
  simulated: boolean;
  updatedAt: number; // epoch ms
  readings: Reading[];
}

/** Readings older than this are treated as stale and never shown as current. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isStale(snapshot: SensorSnapshot, now = Date.now()) {
  return now - snapshot.updatedAt > STALE_AFTER_MS;
}

export async function fetchReadings(): Promise<SensorSnapshot> {
  await new Promise((r) => setTimeout(r, 700));
  return {
    connection: "connected",
    simulated: true,
    updatedAt: Date.now() - 2 * 60 * 1000,
    readings: [
      { key: "temperature", label: "حرارة الجو", value: 35.2, unit: "°C", status: "ok" },
      { key: "humidity", label: "رطوبة الجو", value: 42, unit: "%", status: "ok" },
      { key: "soil", label: "رطوبة التربة", value: 36, unit: "%", status: "ok" },
      { key: "light", label: "شدة الإضاءة", value: 24600, unit: "lux", status: "ok" },
      { key: "uv", label: "الأشعة فوق البنفسجية", value: 4.2, unit: "UV index", status: "ok" },
    ],
  };
}

export function formatReading(r: Reading) {
  if (r.value === null) return "—";
  return `${r.value.toLocaleString("en-US")}${r.unit === "%" ? "%" : " " + r.unit}`;
}

const KEY_BY_LABEL: Record<string, Reading["key"]> = {
  "حرارة الجو": "temperature",
  "رطوبة الجو": "humidity",
  "رطوبة التربة": "soil",
  "شدة الإضاءة": "light",
  "الأشعة فوق البنفسجية": "uv",
};

/** Latest value of each sensor for the palm, from the stored readings (preview or Firebase). */
export function snapshotFromSensors(
  sensors: { label: string; value: number; unit: string; recordedAt: string; palmId: string }[],
  palmId: string,
): SensorSnapshot | null {
  const latest = new Map<string, (typeof sensors)[number]>();
  for (const s of sensors) {
    if (s.palmId !== palmId || !KEY_BY_LABEL[s.label]) continue;
    const cur = latest.get(s.label);
    if (!cur || Date.parse(s.recordedAt) > Date.parse(cur.recordedAt)) latest.set(s.label, s);
  }
  if (!latest.size) return null;
  const order = Object.keys(KEY_BY_LABEL);
  const rows = [...latest.values()].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return {
    connection: "connected",
    simulated: false,
    updatedAt: Math.max(...rows.map((r) => Date.parse(r.recordedAt))),
    readings: rows.map((r) => ({
      key: KEY_BY_LABEL[r.label]!,
      label: r.label,
      value: r.value,
      unit: r.unit,
      status: "ok" as const,
    })),
  };
}
