import { logEvent, setUserId, setUserProperties, type Analytics } from "firebase/analytics";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { analyticsPromise, db } from "./firebase";
import { getPlatform, isStandalone } from "./platform";
import type { User } from "./api";

type Severity = "info" | "warn" | "error" | "fatal";
type EventParam = string | number | boolean | null | undefined;
type EventParams = Record<string, EventParam>;

const analyticsEnabled = import.meta.env.VITE_ANALYTICS_ENABLED !== "false";
const remoteLogEnabled = import.meta.env.VITE_REMOTE_LOG_ENABLED === "true";
const explicitDebug = import.meta.env.VITE_ANALYTICS_DEBUG === "true";
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const debugMode = explicitDebug || isLocalhost;

const DROP_KEY = /(email|token|secret|password|display_?name|username|avatar|url|note|comment|bio|text|body|message)/i;
const ALLOW_KEY = /^(error_message_short|error_name|component_stack)$/i;
const MAX_VALUE = 100;
const MAX_STACK = 1800;
const MAX_REMOTE_LOGS_PER_SESSION = 20;
const SESSION_KEY = "cp.observability.session";

let currentUserId: string | null = null;
let currentAuthState: "anonymous" | "authenticated" | "guest" = "guest";
let analyticsCache: Analytics | null | undefined;
let remoteLogCount = 0;
const remoteLogSignatures = new Set<string>();

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "session-unavailable";
  }
}

function currentRoute(): string {
  if (typeof window === "undefined") return "unknown";
  return window.location.pathname || "/";
}

function currentPage(route = currentRoute()): string {
  if (route === "/") return "map";
  if (route.startsWith("/c/")) return "checkpoint_deep_link";
  if (route.startsWith("/j/")) return "journey_deep_link";
  if (route.startsWith("/u/")) return "user_profile_deep_link";
  return route.replace(/^\/+/, "").replace(/\/+$/, "").replace(/-/g, "_") || "map";
}

function baseParams(route = currentRoute()): EventParams {
  return {
    route,
    page: currentPage(route),
    auth_state: currentAuthState,
    is_pwa: isStandalone(),
    platform: getPlatform(),
    app_version: import.meta.env.VITE_APP_VERSION ?? "dev",
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    debug_mode: debugMode || undefined,
  };
}

function cleanValue(value: EventParam): EventParam {
  if (value == null) return undefined;
  if (typeof value === "string") return value.slice(0, MAX_VALUE);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return value;
}

function sanitize(params: EventParams = {}): EventParams {
  const out: EventParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (DROP_KEY.test(key) && !ALLOW_KEY.test(key)) continue;
    const cleaned = cleanValue(value);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

async function getAnalyticsSafe(): Promise<Analytics | null> {
  if (!analyticsEnabled) return null;
  if (analyticsCache !== undefined) return analyticsCache;
  analyticsCache = await analyticsPromise;
  return analyticsCache;
}

export function isAnalyticsDebugMode(): boolean {
  return debugMode;
}

export function trackEvent(name: string, params: EventParams = {}): void {
  const eventParams = sanitize({ ...baseParams(), ...params });
  void getAnalyticsSafe().then((analytics) => {
    if (!analytics) return;
    logEvent(analytics, name, eventParams);
  });
}

export function trackScreen(screenName: string, route: string, params: EventParams = {}): void {
  trackEvent("screen_view", {
    firebase_screen: screenName,
    screen_name: screenName,
    route,
    ...params,
  });
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "unknown error",
      stack: error.stack,
    };
  }
  return {
    name: typeof error,
    message: String(error),
    stack: undefined,
  };
}

export function trackError(
  error: unknown,
  context: EventParams = {},
  severity: Severity = "error",
): void {
  const normalized = normalizeError(error);
  const params = sanitize({
    ...baseParams(),
    ...context,
    severity,
    error_name: normalized.name,
    error_message_short: normalized.message.slice(0, 180),
  });

  void getAnalyticsSafe().then((analytics) => {
    if (!analytics) return;
    logEvent(analytics, "app_exception", {
      ...params,
      fatal: severity === "fatal",
      description: `${normalized.name}: ${normalized.message}`.slice(0, 100),
    });
  });

  if (!remoteLogEnabled || (severity !== "error" && severity !== "fatal" && !debugMode)) return;
  const signature = `${params.action ?? "unknown"}:${normalized.name}:${normalized.message}`;
  if (remoteLogCount >= MAX_REMOTE_LOGS_PER_SESSION || remoteLogSignatures.has(signature)) return;
  remoteLogCount += 1;
  remoteLogSignatures.add(signature);
  void addDoc(collection(db, "web_debug_events"), {
    event_name: "app_exception",
    ...params,
    user_id: currentUserId,
    session_id: getSessionId(),
    stack_short: normalized.stack?.slice(0, MAX_STACK) ?? null,
    created_at: serverTimestamp(),
  }).catch(() => {});
}

export function setObservabilityUser(user: User | null): void {
  currentUserId = user?.id ?? null;
  currentAuthState = user ? (user.is_anonymous ? "anonymous" : "authenticated") : "guest";

  void getAnalyticsSafe().then((analytics) => {
    if (!analytics) return;
    setUserId(analytics, currentUserId);
    setUserProperties(analytics, {
      auth_state: currentAuthState,
      is_anonymous: String(!!user?.is_anonymous),
      level: user?.level != null ? String(user.level) : "0",
      has_avatar: String(!!user?.avatar_url),
      is_pwa: String(isStandalone()),
    });
  });
}

export async function withTrace<T>(
  action: string,
  fn: () => Promise<T>,
  params: EventParams = {},
): Promise<T> {
  const started = performance.now();
  trackEvent(`${action}_start`, params);
  try {
    const result = await fn();
    trackEvent(`${action}_success`, { ...params, duration_ms: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    trackError(error, { ...params, action, duration_ms: Math.round(performance.now() - started) });
    trackEvent(`${action}_failed`, params);
    throw error;
  }
}
