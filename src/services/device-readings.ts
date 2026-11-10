/**
 * The team's sensor device writes its latest values to Realtime Database at /readings/latest:
 *   { temperature_c, humidity_percent, light_lux, soil_raw, uv_millivolts, uv_raw, updated_at (ms) }
 * This turns that object into the app's SensorReading entries for the signed-in user's palm.
 */
import type { SensorReading } from "@/lib/demo-store";

export interface DeviceLatest {
  temperature_c?: number;
  humidity_percent?: number;
  light_lux?: number;
  soil_raw?: number;
  uv_millivolts?: number;
  uv_raw?: number;
  updated_at?: number;
}

/**
 * Soil sensor calibration (raw ADC value in dry air and in water). Until both are measured the
 * soil value is shown as raw and kept out of the advice rules, so no advice is based on a guess.
 */
export const SOIL_CALIBRATION: { dry: number | null; wet: number | null } = { dry: null, wet: null };

/** Label for an uncalibrated soil value: shown on screen, ignored by the advice engine. */
export const SOIL_RAW_LABEL = "رطوبة التربة (خام)";

/** Readings are stored in history at most this often; the screen always shows the latest. */
export const HISTORY_EVERY_MS = 5 * 60 * 1000;

export function soilPercent(raw: number): number | null {
  const { dry, wet } = SOIL_CALIBRATION;
  if (dry === null || wet === null || dry === wet) return null;
  const pct = ((dry - raw) / (dry - wet)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/** GUVA-S12SD style sensors: UV index ≈ output voltage (mV) / 100. */
export const uvIndex = (mv: number) => Math.round((mv / 100) * 10) / 10;

export function recordedAt(latest: DeviceLatest): string | null {
  const t = latest.updated_at;
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return null;
  return new Date(t < 1e12 ? t * 1000 : t).toISOString(); // accept seconds or milliseconds
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Device values -> app readings (label/unit as on the home screen). */
export function toSensorReadings(
  latest: DeviceLatest,
  deviceId: string,
  palmId: string,
  idPrefix: string,
): SensorReading[] {
  const at = recordedAt(latest);
  if (!at) return [];
  const out: (Omit<SensorReading, "id" | "deviceId" | "palmId" | "recordedAt"> & { key: string })[] = [];
  if (num(latest.temperature_c)) out.push({ key: "temp", label: "حرارة الجو", value: latest.temperature_c, unit: "°C" });
  if (num(latest.humidity_percent))
    out.push({ key: "hum", label: "رطوبة الجو", value: latest.humidity_percent, unit: "%" });
  if (num(latest.soil_raw)) {
    const pct = soilPercent(latest.soil_raw);
    out.push(
      pct === null
        ? { key: "soil", label: SOIL_RAW_LABEL, value: latest.soil_raw, unit: "raw" }
        : { key: "soil", label: "رطوبة التربة", value: pct, unit: "%" },
    );
  }
  if (num(latest.light_lux))
    out.push({ key: "light", label: "شدة الإضاءة", value: Math.round(latest.light_lux), unit: "lux" });
  if (num(latest.uv_millivolts))
    out.push({ key: "uv", label: "الأشعة فوق البنفسجية", value: uvIndex(latest.uv_millivolts), unit: "UV index" });
  return out.map(({ key, ...r }) => ({
    ...r,
    id: `${idPrefix}-${key}`,
    deviceId,
    palmId,
    recordedAt: at,
  }));
}
