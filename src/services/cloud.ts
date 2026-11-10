/**
 * Firebase mode: sign-in with Firebase Auth and two-way sync between the app state
 * (lib/demo-store, used by every screen) and Realtime Database at users/{uid}.
 *
 * Layout (same as ai/firebase_sync.py and firebase/database.rules.json):
 *   users/{uid}/palms/{palmId}           name, variety, sampleId
 *   users/{uid}/device                   id, palmId, linkedAt, lastSeen
 *   users/{uid}/sensorReadings/{id}      deviceId, palmId, label, value, unit, recordedAt
 *   users/{uid}/images/{id}              palmId, sampleId, variety, capturedAt, source, thumbnail
 *   users/{uid}/analyses/{id}            the app's Analysis fields
 *   users/{uid}/interventions/{id}       palmId, sampleId, at, label
 *   users/{uid}/actions/{id}             at
 *   users/{uid}/recommendations/{id}     advice shown on the home screen
 *   readings/latest                      written by the team's sensor device (read only here)
 */
import type { Advice } from "@/ai/advice";
import { RULES, RULES_VERSION } from "@/ai/advice";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import {
  HISTORY_EVERY_MS,
  recordedAt,
  toSensorReadings,
  type DeviceLatest,
} from "@/services/device-readings";
import {
  clearDemo,
  loadDemo,
  onSaveDemo,
  saveDemo,
  SYNC_EVENT,
  type Analysis,
  type Capture,
  type DemoState,
  type Device,
  type Intervention,
  type SensorReading,
} from "@/lib/demo-store";

type Tree = Record<string, Record<string, unknown> | undefined>;

/** Realtime Database keys may not contain . $ # [ ] / */
export const dbKey = (s: string) => s.replace(/[.$#[\]/]/g, "_");

function clean<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
}

function list<T>(node: Record<string, unknown> | undefined, map: (id: string, v: any) => T): T[] {
  return Object.entries(node ?? {}).map(([id, v]) => map(id, v));
}

/** Database snapshot of users/{uid} -> app state fields. */
export function fromCloud(tree: Tree | null): Partial<DemoState> {
  const t = tree ?? {};
  const palms = list(t["palms"], (id, v) => ({
    id,
    name: String(v.name ?? id),
    variety: String(v.variety ?? ""),
    sampleId: String(v.sampleId ?? ""),
  }));
  const dev = t["device"] as Partial<Device> | undefined;
  return {
    palm: palms[0] ?? null,
    device: dev?.id
      ? {
          id: dev.id,
          palmId: dev.palmId ?? palms[0]?.id ?? "",
          linkedAt: dev.linkedAt ?? "",
          lastSeen: dev.lastSeen ?? null,
        }
      : null,
    sensors: list<SensorReading>(t["sensorReadings"], (id, v) => ({ id, ...v })),
    images: list<Capture>(t["images"], (id, v) => {
      const { thumbnail, storagePath, ...rest } = v;
      return { id, ...rest, url: thumbnail ?? storagePath ?? "" };
    }),
    analyses: list<Analysis>(t["analyses"], (id, v) => ({ id, ...v })),
    interventions: list<Intervention>(t["interventions"], (id, v) => ({ id, ...v })),
    actions: list(t["actions"], (id, v) => ({ id, at: Number(v.at) })),
  };
}

/** Multi-path update with everything that changed between two app states. */
export function diffToCloud(prev: DemoState, next: DemoState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (next.palm && changed(prev.palm, next.palm)) {
    const { id, ...palm } = next.palm;
    out[`palms/${dbKey(id)}`] = clean(palm);
  }
  if (next.device && changed(prev.device, next.device)) out["device"] = clean(next.device);
  const each = <T extends { id: string }>(
    path: string,
    a: T[] | undefined,
    b: T[] | undefined,
    map: (x: T) => object,
  ) => {
    const before = new Map((a ?? []).map((x) => [x.id, JSON.stringify(x)]));
    for (const x of b ?? []) {
      if (before.get(x.id) === JSON.stringify(x)) continue;
      out[`${path}/${dbKey(x.id)}`] = clean(map(x));
    }
  };
  // "live-*" readings mirror the device's /readings/latest on screen only; history copies are stored.
  const stored = (l: SensorReading[] | undefined) => (l ?? []).filter((x) => !x.id.startsWith("live-"));
  each("sensorReadings", stored(prev.sensors), stored(next.sensors), ({ id, ...s }) => s);
  each("analyses", prev.analyses, next.analyses, ({ id, ...a }) => a);
  each("interventions", prev.interventions, next.interventions, ({ id, ...i }) => i);
  each("actions", prev.actions, next.actions, ({ at }) => ({ at }));
  each("images", prev.images, next.images, ({ id, url, ...img }) =>
    url.startsWith("data:") ? { ...img, thumbnail: url } : { ...img, storagePath: url },
  );
  return out;
}

/**
 * New values from the team's device (/readings/latest) for the signed-in user's palm.
 * The screen always shows the latest values; a history copy is saved every HISTORY_EVERY_MS
 * so the advice engine can compare readings over time.
 */
export function applyDeviceLatest(latest: DeviceLatest | null): boolean {
  const d = loadDemo();
  if (d.mode !== "cloud" || !d.palm || !d.device || !latest) return false;
  const at = recordedAt(latest);
  if (!at) return false;
  const device = d.device;
  const live = toSensorReadings(latest, device.id, d.palm.id, "live");
  const lastStored = Math.max(
    0,
    ...d.sensors
      .filter((s) => s.deviceId === device.id && !s.id.startsWith("live-"))
      .map((s) => Date.parse(s.recordedAt)),
  );
  const store = Date.parse(at) - lastStored >= HISTORY_EVERY_MS;
  const history = store ? toSensorReadings(latest, device.id, d.palm.id, `dev-${Date.parse(at)}`) : [];
  saveDemo(
    {
      sensors: [...d.sensors.filter((s) => !s.id.startsWith("live-")), ...live, ...history],
      device: { ...device, lastSeen: at },
    },
    { silent: !store },
  );
  return true;
}

let stopSync: (() => void) | null = null;
let syncingUid: string | null = null;

async function startSync(uid: string) {
  if (syncingUid === uid) return;
  stopSync?.();
  syncingUid = uid;
  const db = await firebaseDb();
  const { ref, onValue, update } = await import("firebase/database");
  const userRef = ref(db, `users/${uid}`);
  const offSave = onSaveDemo((prev, next) => {
    if (next.mode !== "cloud" || next.uid !== uid) return;
    const patch = diffToCloud(prev, next);
    if (Object.keys(patch).length)
      update(userRef, patch).catch((e) => console.error("Firebase write failed", e));
  });
  const offValue = onValue(
    userRef,
    (snap) => {
      const cur = loadDemo();
      if (cur.mode !== "cloud" || cur.uid !== uid) return;
      const cloud = fromCloud(snap.val() as Tree | null);
      const live = cur.sensors.filter((x) => x.id.startsWith("live-"));
      const seen = [cloud.device?.lastSeen, cur.device?.lastSeen].filter(Boolean) as string[];
      saveDemo(
        {
          ...cloud,
          sensors: [...(cloud.sensors ?? []).filter((x) => !x.id.startsWith("live-")), ...live],
          device: cloud.device
            ? { ...cloud.device, lastSeen: seen.sort().at(-1) ?? null }
            : null,
        },
        { silent: true },
      );
      window.dispatchEvent(new Event(SYNC_EVENT));
    },
    (e) => console.error("Firebase read failed", e),
  );
  // The team's sensor device publishes its latest values here.
  const offDevice = onValue(
    ref(db, "readings/latest"),
    (snap) => {
      if (applyDeviceLatest(snap.val() as DeviceLatest | null))
        window.dispatchEvent(new Event(SYNC_EVENT));
    },
    (e) => console.error("Device readings unavailable", e),
  );
  stopSync = () => {
    offSave();
    offValue();
    offDevice();
    syncingUid = null;
  };
}

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "البريد أو كلمة المرور غير صحيحة.",
  "auth/user-not-found": "ما فيه حساب بهذا البريد. اضغطي «إنشاء حساب».",
  "auth/email-already-in-use": "فيه حساب بهذا البريد. سجّلي دخول بدل إنشاء حساب.",
  "auth/weak-password": "كلمة المرور لازم تكون 6 أحرف أو أكثر.",
  "auth/invalid-email": "اكتب بريدًا إلكترونيًا صحيحًا.",
  "auth/operation-not-allowed": "تسجيل الدخول بالبريد غير مفعّل في Firebase (Authentication ← Email/Password).",
  "auth/configuration-not-found": "Authentication غير مفعّل في مشروع Firebase.",
  "auth/network-request-failed": "تعذّر الاتصال بالإنترنت.",
  "auth/too-many-requests": "محاولات كثيرة. انتظري قليلًا ثم حاولي.",
};
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  return AUTH_ERRORS[code] ?? "تعذّر تسجيل الدخول. حاولي مرة ثانية.";
}

/** Sign in (or create the account), load the user's data and keep it in sync. */
export async function signInCloud(email: string, password: string, create = false) {
  const auth = await firebaseAuth();
  const m = await import("firebase/auth");
  const cred = create
    ? await m.createUserWithEmailAndPassword(auth, email, password)
    : await m.signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const { ref, get } = await import("firebase/database");
  const snap = await get(ref(await firebaseDb(), `users/${uid}`));
  clearDemo();
  const state = saveDemo(
    { active: true, mode: "cloud", uid, ...fromCloud(snap.val() as Tree | null) },
    { silent: true },
  );
  await startSync(uid);
  return state;
}

/**
 * Call when a screen opens. In Firebase mode, waits for the saved session and starts syncing;
 * returns false if the session ended (the caller should go back to sign-in).
 */
export async function resumeCloud(): Promise<boolean> {
  const d = loadDemo();
  if (d.mode !== "cloud" || !d.uid) return true;
  const auth = await firebaseAuth();
  await auth.authStateReady();
  if (auth.currentUser?.uid !== d.uid) {
    clearDemo();
    return false;
  }
  await startSync(d.uid);
  return true;
}

/** Leave the app: signs out of Firebase (cloud) or just closes the preview (demo). */
export async function exitApp() {
  const d = loadDemo();
  if (d.mode === "cloud") {
    stopSync?.();
    clearDemo();
    const auth = await firebaseAuth();
    await (await import("firebase/auth")).signOut(auth);
    return;
  }
  saveDemo({ active: false });
}

/** Keep a record of the advice shown for a reading (Firebase mode only). */
export async function recordAdvice(advice: Advice, readingAt: string) {
  const d = loadDemo();
  if (d.mode !== "cloud" || !d.uid || !d.palm) return;
  const { ref, set } = await import("firebase/database");
  const id = dbKey(`${advice.ruleId}-${readingAt}`);
  await set(ref(await firebaseDb(), `users/${d.uid}/recommendations/${id}`), {
    palmId: d.palm.id,
    ruleId: advice.ruleId,
    title: advice.title,
    message: advice.message,
    severity: advice.severity,
    source: RULES_VERSION,
    readingAt,
    createdAt: new Date().toISOString(),
    validated: RULES.validated,
    disclaimer: RULES.disclaimer,
  }).catch((e) => console.error("Firebase write failed", e));
}
