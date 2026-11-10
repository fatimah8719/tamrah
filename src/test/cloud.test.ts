import { describe, expect, it } from "vitest";
import { dbKey, diffToCloud, fromCloud } from "@/services/cloud";
import type { DemoState } from "@/lib/demo-store";

const empty: DemoState = {
  active: true,
  mode: "cloud",
  uid: "u1",
  palm: null,
  device: null,
  images: [],
  analyses: [],
  sensors: [],
  interventions: [],
};

describe("Firebase mapping", () => {
  it("writes only what changed, with images as thumbnails", () => {
    const next: DemoState = {
      ...empty,
      palm: { id: "p1", name: "نخلتي", variety: "خلاص", sampleId: "العذق الأول" },
      images: [
        {
          id: "i1",
          palmId: "p1",
          sampleId: "العذق الأول",
          variety: "خلاص",
          capturedAt: "2026-11-09T09:00:00Z",
          url: "data:image/jpeg;base64,AAA",
          source: "manual",
        },
      ],
      actions: [{ id: "a.1", at: 5 }],
    };
    const patch = diffToCloud(empty, next);
    expect(Object.keys(patch).sort()).toEqual(["actions/a_1", "images/i1", "palms/p1"]);
    expect(patch["images/i1"]).toMatchObject({ thumbnail: "data:image/jpeg;base64,AAA" });
    expect(patch["images/i1"]).not.toHaveProperty("url");
    expect(diffToCloud(next, next)).toEqual({});
  });

  it("reads the same layout back into app state", () => {
    const s = fromCloud({
      palms: { p1: { name: "نخلتي", variety: "خلاص", sampleId: "b1" } },
      device: { id: "TAMRA01", palmId: "p1", linkedAt: "x", lastSeen: "y" },
      images: { i1: { palmId: "p1", capturedAt: "t", thumbnail: "data:x" } },
      sensorReadings: {
        r1: { deviceId: "TAMRA01", palmId: "p1", label: "حرارة الجو", value: 35.2, unit: "°C", recordedAt: "t" },
      },
    });
    expect(s.palm).toEqual({ id: "p1", name: "نخلتي", variety: "خلاص", sampleId: "b1" });
    expect(s.device?.id).toBe("TAMRA01");
    expect(s.images?.[0]?.url).toBe("data:x");
    expect(s.sensors?.[0]?.value).toBe(35.2);
  });

  it("makes safe database keys", () => {
    expect(dbKey("a.b$c#d[e]f/g")).toBe("a_b_c_d_e_f_g");
  });
});
