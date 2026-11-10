import { loadDemo, saveDemo, type Analysis, type Capture } from "@/lib/demo-store";

// Presentation-only fixtures. This service never claims devices or calls production APIs.
export const PRESENTATION_PREVIEW = true;
export function preparePreview() {
  const d = loadDemo();
  if (!PRESENTATION_PREVIEW || !d.palm || d.mode === "cloud") return d;
  const palm = d.palm;
  const now = Date.now(),
    timestamp = new Date(now).toISOString();
  const device = d.device || {
    id: "preview-device",
    palmId: palm.id,
    linkedAt: timestamp,
    lastSeen: timestamp,
  };
  const prefix = "preview-" + palm.id + "-" + palm.sampleId + "-" + palm.variety;
  const hasPreview = d.analyses.some(
    (a) =>
      a.palmId === palm.id &&
      a.sampleId === palm.sampleId &&
      a.variety === palm.variety &&
      a.modelVersion === "preview-v1",
  );
  const images: Capture[] = [],
    analyses: Analysis[] = [];
  if (!hasPreview)
    [60, 75, 68, 80].forEach((ripePercent, index) => {
      const capturedAt = new Date(now - (3 - index) * 86400000 - 120000).toISOString();
      const imageId = prefix + "-image-" + index;
      images.push({
        id: imageId,
        palmId: palm.id,
        sampleId: palm.sampleId,
        variety: palm.variety,
        capturedAt,
        url: "/images/date-bunch.svg",
        source: "device",
      });
      analyses.push({
        id: prefix + "-analysis-" + index,
        imageId,
        palmId: palm.id,
        sampleId: palm.sampleId,
        variety: palm.variety,
        capturedAt,
        analyzedAt: capturedAt,
        status: "completed",
        stage: index ? "رطب" : "خلال",
        ripePercent,
        confidence: 0.94,
        modelVersion: "preview-v1",
        measurement: "ripe-fruit-share-v1",
      });
    });
  // An earlier reading lets the advice engine compare (32.8° an hour ago -> 35.2° now).
  const hourAgo = new Date(now - 60 * 60000).toISOString();
  const sensors = [
    { label: "حرارة الجو", value: 35.2, unit: "°C", recordedAt: timestamp },
    { label: "رطوبة الجو", value: 42, unit: "%", recordedAt: timestamp },
    { label: "رطوبة التربة", value: 36, unit: "%", recordedAt: timestamp },
    { label: "شدة الإضاءة", value: 24600, unit: "lux", recordedAt: timestamp },
    { label: "الأشعة فوق البنفسجية", value: 4.2, unit: "UV index", recordedAt: timestamp },
    { label: "حرارة الجو", value: 32.8, unit: "°C", recordedAt: hourAgo },
  ].map((s, index) => ({
    ...s,
    id: prefix + "-sensor-" + index,
    deviceId: device.id,
    palmId: palm.id,
  }));
  return saveDemo({
    device: { ...device, lastSeen: timestamp },
    images: [...d.images, ...images],
    analyses: [...d.analyses, ...analyses],
    sensors: [...d.sensors.filter((s) => !s.id.startsWith(prefix + "-sensor-")), ...sensors],
  });
}
export function startPreview() {
  const d = loadDemo();
  saveDemo({
    active: true,
    mode: "demo",
    palm: d.palm || { id: "preview-palm", name: "نخلتي", variety: "خلاص", sampleId: "العذق الأول" },
  });
  return preparePreview();
}
