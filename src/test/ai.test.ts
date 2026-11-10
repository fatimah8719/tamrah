import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adviseLatest, evaluate, RULES } from "@/ai/advice";
import {
  featuresFromHsv,
  predictFromFeatures,
  rgbToHsv,
  thumbnailSize,
  UnsuitableImage,
  type RipenessModel,
} from "@/ai/ripeness";

const root = path.resolve(__dirname, "../..");
const model = JSON.parse(
  readFileSync(path.join(root, "public/models/ripeness.json"), "utf8"),
) as RipenessModel;
const fixtures = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/ripeness-parity.json"), "utf8"),
) as {
  samples: {
    name: string;
    rgb: string;
    features: number[];
    probabilities: Record<string, number>;
    stage: string;
    ripePercent: number;
  }[];
};

describe("ripeness model in the browser matches the Python model", () => {
  for (const s of fixtures.samples) {
    it(s.name, () => {
      const rgb = Uint8Array.from(Buffer.from(s.rgb, "base64"));
      const feats = featuresFromHsv(rgbToHsv(rgb, 3));
      expect(feats).toHaveLength(298);
      feats.forEach((v, i) => expect(v).toBeCloseTo(s.features[i]!, 5));
      const r = predictFromFeatures(model, feats);
      expect(r.stage).toBe(s.stage);
      expect(r.ripePercent).toBeCloseTo(s.ripePercent, 0);
      for (const [stage, p] of Object.entries(s.probabilities))
        expect(r.probabilities[stage as keyof typeof r.probabilities]).toBeCloseTo(p, 4);
    });
  }

  it("rejects an image with no coloured fruit", () => {
    const grey = new Uint8Array(32 * 32 * 3).fill(200);
    expect(() => featuresFromHsv(rgbToHsv(grey, 3))).toThrow(UnsuitableImage);
  });

  it("computes Pillow thumbnail sizes", () => {
    expect(thumbnailSize(224, 224)).toEqual([224, 224]);
    expect(thumbnailSize(1024, 768)).toEqual([256, 192]);
    expect(thumbnailSize(3000, 4000)).toEqual([192, 256]);
  });
});

describe("advice engine (same rules as ai/rules.json)", () => {
  it("gives the dashboard example: heat rise -> ventilate bunch covers", () => {
    const out = evaluate(
      { recorded_at: "2026-11-09T09:00:00Z", air_temperature_c: 35.2, soil_moisture_pct: 36 },
      { recorded_at: "2026-11-09T08:00:00Z", air_temperature_c: 32.8 },
    );
    expect(out.map((a) => a.ruleId)).toEqual(["heat_rise_bunch_ventilation"]);
    expect(out[0]!.message).toContain("32.8° إلى 35.2°");
    expect(out[0]!.steps.length).toBeGreaterThan(0);
  });

  it("ignores a rise when the previous reading is too old", () => {
    expect(
      evaluate(
        { recorded_at: "2026-11-09T09:00:00Z", air_temperature_c: 36 },
        { recorded_at: "2026-11-09T05:00:00Z", air_temperature_c: 30 },
      ),
    ).toEqual([]);
  });

  it("applies stage-specific rules from the KFU study", () => {
    const sensors = [
      { label: "رطوبة الجو", value: 75, recordedAt: "2026-11-09T09:00:00Z" },
      { label: "رطوبة التربة", value: 15, recordedAt: "2026-11-09T09:00:00Z" },
    ];
    expect(adviseLatest(sensors, null).advice.map((a) => a.ruleId)).toEqual(["dry_soil"]);
    expect(adviseLatest(sensors, "رطب").advice.map((a) => a.ruleId).sort()).toEqual([
      "dry_soil",
      "kfu_high_rh_rutab",
    ]);
  });

  it("every rule has steps for the steps sheet", () => {
    for (const r of RULES.rules) expect(r.steps?.length).toBeGreaterThan(0);
  });
});
