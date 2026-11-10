import { beforeEach, describe, expect, it } from "vitest";
import { adviseLatest } from "@/ai/advice";
import { snapshotFromSensors } from "@/data/demo-sensors";
import { loadDemo, saveDemo } from "@/lib/demo-store";
import { applyDeviceLatest, diffToCloud } from "@/services/cloud";
import { SOIL_RAW_LABEL, toSensorReadings, uvIndex } from "@/services/device-readings";

// Values from the team's device in Firebase (/readings/latest).
const latest = {
  humidity_percent: 47.5,
  light_lux: 48.33333,
  soil_raw: 2559,
  temperature_c: 21,
  updated_at: 1794329156486,
  uv_millivolts: 142,
  uv_raw: 0,
};

beforeEach(() => localStorage.clear());

describe("team device readings (/readings/latest)", () => {
  it("maps device fields to the app's readings", () => {
    const r = toSensorReadings(latest, "TAMRA01", "p1", "live");
    const by = Object.fromEntries(r.map((x) => [x.label, x]));
    expect(by["حرارة الجو"]).toMatchObject({ value: 21, unit: "°C" });
    expect(by["رطوبة الجو"]).toMatchObject({ value: 47.5, unit: "%" });
    expect(by["شدة الإضاءة"]).toMatchObject({ value: 48, unit: "lux" });
    expect(by["الأشعة فوق البنفسجية"]).toMatchObject({ value: 1.4, unit: "UV index" });
    expect(by[SOIL_RAW_LABEL]).toMatchObject({ value: 2559, unit: "raw" });
    expect(r[0]!.recordedAt).toBe("2026-11-10T16:45:56.486Z");
    expect(uvIndex(142)).toBe(1.4);
  });

  it("keeps the uncalibrated soil value out of the advice", () => {
    const r = toSensorReadings({ ...latest, soil_raw: 3900 }, "TAMRA01", "p1", "live");
    const { current } = adviseLatest(r);
    expect(current?.soil_moisture_pct).toBeUndefined();
    const snap = snapshotFromSensors(r, "p1")!;
    expect(snap.readings.find((x) => x.key === "soil")).toMatchObject({
      status: "uncalibrated",
      value: 3900,
    });
  });

  it("shows live values and stores history at most every 5 minutes", () => {
    saveDemo({
      active: true,
      mode: "cloud",
      uid: "u1",
      palm: { id: "p1", name: "نخلتي", variety: "خلاص", sampleId: "b1" },
      device: { id: "TAMRA01", palmId: "p1", linkedAt: "x", lastSeen: null },
    });
    expect(applyDeviceLatest(latest)).toBe(true);
    let d = loadDemo();
    expect(d.device?.lastSeen).toBe("2026-11-10T16:45:56.486Z");
    expect(d.sensors.filter((s) => s.id.startsWith("live-"))).toHaveLength(5);
    expect(d.sensors.filter((s) => s.id.startsWith("dev-"))).toHaveLength(5);

    applyDeviceLatest({ ...latest, temperature_c: 22, updated_at: latest.updated_at + 60_000 });
    d = loadDemo();
    expect(d.sensors.filter((s) => s.id.startsWith("dev-"))).toHaveLength(5); // < 5 min: not stored
    expect(d.sensors.find((s) => s.id === "live-temp")?.value).toBe(22);

    applyDeviceLatest({ ...latest, temperature_c: 24, updated_at: latest.updated_at + 6 * 60_000 });
    expect(loadDemo().sensors.filter((s) => s.id.startsWith("dev-"))).toHaveLength(10);
  });

  it("never writes live values to Firebase, only history", () => {
    const base = loadDemo();
    const next = {
      ...base,
      sensors: toSensorReadings(latest, "D", "p1", "live").concat(
        toSensorReadings(latest, "D", "p1", "dev-1"),
      ),
    };
    const keys = Object.keys(diffToCloud(base, next));
    expect(keys.every((k) => k.startsWith("sensorReadings/dev-1-"))).toBe(true);
    expect(keys).toHaveLength(5);
  });

  it("ignores device data in preview mode or without a paired device", () => {
    saveDemo({ active: true, mode: "demo" });
    expect(applyDeviceLatest(latest)).toBe(false);
  });
});
