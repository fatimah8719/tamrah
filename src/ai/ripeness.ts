/**
 * Date-bunch ripeness model in the browser (port of ai/ripeness.py, features "hsv-hist-v2").
 *
 * The weights in /models/ripeness.json are a copy of ai/models/latest.json, trained on 5,106
 * photos of date bunches (89% stage accuracy on palms the model never saw). The colour maths
 * follows Pillow/NumPy (float32 HSV, NumPy histogram edges) so results match the Python model.
 */

export const STAGES = ["kimri", "khalal", "rutab", "tamr"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_AR: Record<Stage, string> = {
  kimri: "كمري",
  khalal: "خلال",
  rutab: "رطب",
  tamr: "تمر",
};
export const PROGRESS_MEASUREMENT = "ripening-progress-v1";
const STAGE_PROGRESS: Record<Stage, number> = { kimri: 0, khalal: 100 / 3, rutab: 200 / 3, tamr: 100 };
export const FEATURES = "hsv-hist-v2";
const MIN_FRUIT_FRACTION = 0.02;
const MAX_SIDE = 256;

export interface RipenessModel {
  version: string;
  features: string;
  classes: Stage[];
  mean: number[];
  std: number[];
  hidden_weights: number[][];
  stage_weights: number[][];
  metrics?: Record<string, number>;
}

export interface RipenessResult {
  stage: Stage;
  stageAr: string;
  ripePercent: number;
  confidence: number;
  probabilities: Record<Stage, number>;
  modelVersion: string;
  measurement: string;
}

export class UnsuitableImage extends Error {}

const f32 = Math.fround;
const T015 = f32(0.15),
  T01 = f32(0.1),
  T025 = f32(0.25),
  T07 = f32(0.7);

/** Pillow's RGB -> HSV (each channel 0..255), returned as float32 0..1 like np.asarray(..)/255. */
export function rgbToHsv(rgb: ArrayLike<number>, channels: 3 | 4 = 3): Float32Array {
  const n = Math.floor(rgb.length / channels);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * channels]!,
      g = rgb[i * channels + 1]!,
      b = rgb[i * channels + 2]!;
    const maxc = Math.max(r, g, b),
      minc = Math.min(r, g, b);
    let uh = 0,
      us = 0;
    if (maxc !== minc) {
      const cr = maxc - minc;
      const s = f32(cr / maxc);
      const rc = f32((maxc - r) / cr),
        gc = f32((maxc - g) / cr),
        bc = f32((maxc - b) / cr);
      // As in Pillow's rgb2hsv_row: float variables, but `2.0 + rc - bc` and
      // `fmod(h / 6.0 + 1.0, 1.0)` are evaluated in double before being stored as float.
      let h: number;
      if (r === maxc) h = f32(bc - gc);
      else if (g === maxc) h = f32(2 + rc - bc);
      else h = f32(4 + gc - rc);
      h = f32((h / 6 + 1) % 1);
      uh = Math.min(255, Math.max(0, Math.trunc(h * 255)));
      us = Math.min(255, Math.max(0, Math.trunc(s * 255)));
    }
    out[i * 3] = f32(uh / 255);
    out[i * 3 + 1] = f32(us / 255);
    out[i * 3 + 2] = f32(maxc / 255);
  }
  return out;
}

function fruitFraction(hsv: Float32Array): number {
  const n = hsv.length / 3;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    const h = f32(hsv[i * 3]! * 360),
      s = hsv[i * 3 + 1]!,
      v = hsv[i * 3 + 2]!;
    if (!(s > T025 && v > f32(0.15))) continue;
    const warm = h < 40 || h >= 330;
    const ripe = warm && v < T07;
    const khalal = (h < 70 || h >= 330) && v >= T07;
    const kimri = h >= 70 && h < 170;
    if (ripe || khalal || kimri) counted++;
  }
  return counted / Math.max(n, 1);
}

/** NumPy histogram bin for a value in [0, 1] with `bins` equal bins (right edge in last bin). */
function bin(x: number, bins: number): number {
  if (x >= 1) return bins - 1;
  let i = Math.floor(x * bins);
  // Align with NumPy's searchsorted on edges k * (1 / bins).
  while (i < bins - 1 && x >= (i + 1) * (1 / bins)) i++;
  while (i > 0 && x < i * (1 / bins)) i--;
  return i;
}

/** NumPy's default (linear) percentile of a sorted array. */
function percentile(sorted: Float64Array, q: number): number {
  const idx = ((sorted.length - 1) * q) / 100;
  const lo = Math.floor(idx),
    hi = Math.min(lo + 1, sorted.length - 1),
    t = idx - lo;
  const a = sorted[lo]!,
    b = sorted[hi]!,
    d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}

/** 298 features from HSV pixels (same order as ai/ripeness.py features()). */
export function featuresFromHsv(hsv: Float32Array): number[] {
  if (fruitFraction(hsv) < MIN_FRUIT_FRACTION)
    throw new UnsuitableImage("لا تظهر ثمار كافية في الصورة");
  const n = hsv.length / 3;
  const keep: number[] = [];
  for (let i = 0; i < n; i++) if (hsv[i * 3 + 1]! > T015 && hsv[i * 3 + 2]! > T01) keep.push(i);
  const idx = keep.length > 50 ? keep : Array.from({ length: n }, (_, i) => i);
  const hist = new Array(18 * 4 * 4).fill(0);
  const hs = new Float64Array(idx.length),
    ss = new Float64Array(idx.length),
    vs = new Float64Array(idx.length);
  idx.forEach((p, j) => {
    const h = hsv[p * 3]!,
      s = hsv[p * 3 + 1]!,
      v = hsv[p * 3 + 2]!;
    hist[bin(h, 18) * 16 + bin(s, 4) * 4 + bin(v, 4)]++;
    hs[j] = h;
    ss[j] = s;
    vs[j] = v;
  });
  const ch = [hs, ss, vs];
  const feats = hist.map((c) => Math.sqrt(c / idx.length));
  feats.push(keep.length / n);
  ch.forEach((a) => a.sort());
  for (const q of [10, 50, 90]) for (const a of ch) feats.push(f32(percentile(a, q)));
  return feats;
}

function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function predictFromFeatures(model: RipenessModel, f: number[]): RipenessResult {
  if (model.features !== FEATURES) throw new Error(`model needs features ${model.features}`);
  const x = f.map((v, i) => (v - model.mean[i]!) / model.std[i]!);
  x.push(1);
  const W1 = model.hidden_weights,
    W2 = model.stage_weights;
  const hidden = W1[0]!.map((_, j) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i]! * W1[i]![j]!;
    return Math.max(0, s);
  });
  hidden.push(1);
  const logits = W2[0]!.map((_, k) => {
    let s = 0;
    for (let j = 0; j < hidden.length; j++) s += hidden[j]! * W2[j]![k]!;
    return s;
  });
  const p = softmax(logits);
  const probabilities = Object.fromEntries(model.classes.map((c, i) => [c, p[i]])) as Record<
    Stage,
    number
  >;
  const best = p.indexOf(Math.max(...p));
  const stage = model.classes[best]!;
  const progress = model.classes.reduce((acc, c, i) => acc + p[i]! * STAGE_PROGRESS[c], 0);
  return {
    stage,
    stageAr: STAGE_AR[stage],
    ripePercent: Math.round(progress * 10) / 10,
    confidence: Math.round(p[best]! * 1000) / 1000,
    probabilities,
    modelVersion: model.version,
    measurement: PROGRESS_MEASUREMENT,
  };
}

/** Pillow's Image.thumbnail((256, 256)) target size. */
export function thumbnailSize(w: number, h: number, max = MAX_SIDE): [number, number] {
  if (w <= max && h <= max) return [w, h];
  const aspect = w / h;
  const pick = (n: number, key: (k: number) => number) =>
    Math.max(key(Math.floor(n)) <= key(Math.ceil(n)) ? Math.floor(n) : Math.ceil(n), 1);
  if (max / max >= aspect) return [pick(max * aspect, (k) => Math.abs(aspect - k / max)), max];
  return [max, pick(max / aspect, (k) => (k === 0 ? 0 : Math.abs(aspect - max / k)))];
}

let cached: Promise<RipenessModel> | null = null;
export function loadModel(url = "/models/ripeness.json"): Promise<RipenessModel> {
  cached ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error("تعذّر تحميل نموذج النضج");
    return r.json() as Promise<RipenessModel>;
  });
  cached.catch(() => (cached = null));
  return cached;
}

/** Analyse an image (data URL or same-origin URL) in the browser. */
export async function analyzeImage(src: string, model?: RipenessModel): Promise<RipenessResult> {
  const m = model ?? (await loadModel());
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("تعذّر فتح الصورة"));
    el.src = src;
  });
  const [w, h] = thumbnailSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("المتصفح لا يدعم تحليل الصور");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return predictFromFeatures(m, featuresFromHsv(rgbToHsv(data, 4)));
}

/** Small JPEG copy of an image for storing next to its result (keeps Firebase small). */
export async function thumbnailDataUrl(src: string, max = 320): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const [w, h] = thumbnailSize(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}
