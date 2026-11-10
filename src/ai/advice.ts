/**
 * Advice engine (port of ai/advice.py). Turns sensor readings into recommendations
 * using the rules in rules.json, a copy of ai/rules.json (keep both identical).
 */
import rulesFile from "./rules.json";

export const FIELDS = [
  "air_temperature_c",
  "air_humidity_pct",
  "soil_moisture_pct",
  "light_lux",
  "uv_index",
] as const;
export type Field = (typeof FIELDS)[number];
export type Stage = "kimri" | "khalal" | "rutab" | "tamr";
export type Severity = "info" | "warning" | "critical";

/** One point in time for one device: whichever fields were measured. */
export type ReadingRow = Partial<Record<Field, number>> & { recorded_at: string };

interface Condition {
  field: Field;
  op: "<" | "<=" | ">" | ">=" | "==";
  value: number;
  change_within_minutes?: number;
}
export interface Rule {
  id: string;
  severity: Severity;
  stages?: Stage[];
  when: Condition[];
  title: string;
  message: string;
  reason?: string;
  steps?: string[];
  done_label?: string;
}
export interface RuleSet {
  version: string;
  validated: boolean;
  reference: string;
  disclaimer: string;
  rules: Rule[];
}
export interface Advice {
  ruleId: string;
  title: string;
  message: string;
  severity: Severity;
  reason: string;
  steps: string[];
  doneLabel: string;
}

export const RULES = rulesFile as RuleSet;
export const RULES_VERSION = `rules:${RULES.version}`;

/** App label (as shown on screen) -> rule field. */
export const LABEL_FIELD: Record<string, Field> = {
  "حرارة الجو": "air_temperature_c",
  "رطوبة الجو": "air_humidity_pct",
  "رطوبة التربة": "soil_moisture_pct",
  "شدة الإضاءة": "light_lux",
  "الأشعة فوق البنفسجية": "uv_index",
};
export const STAGE_FROM_AR: Record<string, Stage> = {
  كمري: "kimri",
  خلال: "khalal",
  رطب: "rutab",
  تمر: "tamr",
};

const OPS = {
  "<": (a: number, b: number) => a < b,
  "<=": (a: number, b: number) => a <= b,
  ">": (a: number, b: number) => a > b,
  ">=": (a: number, b: number) => a >= b,
  "==": (a: number, b: number) => a === b,
};
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function matches(c: Condition, cur: ReadingRow, prev: ReadingRow | null): boolean {
  let value = cur[c.field];
  if (value === undefined || value === null) return false;
  if (c.change_within_minutes !== undefined) {
    const before = prev?.[c.field];
    if (!prev || before === undefined || before === null) return false;
    const minutes = (Date.parse(cur.recorded_at) - Date.parse(prev.recorded_at)) / 60000;
    if (!(minutes > 0 && minutes <= c.change_within_minutes)) return false;
    value = value - before;
  }
  return OPS[c.op](value, c.value);
}

/** Same as Python's '{x:g}' for the values we show. */
function fmt(v: number | undefined): string {
  if (v === undefined || v === null) return "";
  return String(Number.isInteger(v) ? v : Number(v.toPrecision(6)));
}

export function evaluate(
  current: ReadingRow,
  previous: ReadingRow | null = null,
  stage: Stage | null = null,
  rules: RuleSet = RULES,
): Advice[] {
  const values: Record<string, string> = {};
  for (const f of FIELDS) {
    values[f] = fmt(current[f]);
    values[`prev_${f}`] = fmt(previous?.[f]);
  }
  const out: Advice[] = [];
  for (const rule of rules.rules) {
    if (rule.stages?.length && (!stage || !rule.stages.includes(stage))) continue;
    if (!rule.when.every((c) => matches(c, current, previous))) continue;
    out.push({
      ruleId: rule.id,
      title: rule.title,
      message: rule.message.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? ""),
      severity: rule.severity,
      reason: rule.reason ?? "",
      steps: rule.steps ?? [],
      doneLabel: rule.done_label ?? "تم",
    });
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Group single-value readings (the app's SensorReading shape) into rows per time point. */
export function toRows(
  sensors: { label: string; value: number; recordedAt: string }[],
): ReadingRow[] {
  const byTime = new Map<string, ReadingRow>();
  for (const s of sensors) {
    const field = LABEL_FIELD[s.label];
    if (!field || !Number.isFinite(s.value)) continue;
    const row = byTime.get(s.recordedAt) ?? { recorded_at: s.recordedAt };
    row[field] = s.value;
    byTime.set(s.recordedAt, row);
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
}

/** Advice for the latest reading, compared with the one before it. */
export function adviseLatest(
  sensors: { label: string; value: number; recordedAt: string }[],
  stageAr?: string | null,
): { advice: Advice[]; current: ReadingRow | null; previous: ReadingRow | null } {
  const rows = toRows(sensors);
  const current = rows.at(-1) ?? null;
  const previous = rows.length > 1 ? (rows[rows.length - 2] ?? null) : null;
  if (!current) return { advice: [], current, previous };
  const stage = stageAr ? (STAGE_FROM_AR[stageAr] ?? null) : null;
  return { advice: evaluate(current, previous, stage), current, previous };
}
