import { DEFAULT_MODEL_ROUTES } from "./domain";

type ModelRouteLike = {
  primaryModel: string;
  fallbackModel: string | null;
  shadowModel?: string | null;
  shadowTrafficPercent?: number | null;
  description?: string | null;
};

type DbModelRouteLike = {
  primary_model: string;
  fallback_model: string | null;
  shadow_model?: string | null;
  shadow_traffic_percent?: number | null;
  description?: string | null;
};

type EnvRouteOverride = Partial<ModelRouteLike>;

let cachedRaw: string | null = null;
let cachedOverrides: Map<string, EnvRouteOverride> | null = null;

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeNullableString(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePercent(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseEnvOverrides(raw: string) {
  if (!raw.trim()) {
    return new Map<string, EnvRouteOverride>();
  }

  const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  const overrides = new Map<string, EnvRouteOverride>();
  for (const [sceneCode, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const primaryModel = normalizeString(value.primaryModel ?? value.primary_model);
    const fallbackModel = normalizeNullableString(value.fallbackModel ?? value.fallback_model);
    const shadowModel = normalizeNullableString(value.shadowModel ?? value.shadow_model);
    const shadowTrafficPercent = normalizePercent(value.shadowTrafficPercent ?? value.shadow_traffic_percent);
    const description = normalizeNullableString(value.description);
    overrides.set(sceneCode, {
      ...(primaryModel !== undefined ? { primaryModel } : {}),
      ...(fallbackModel !== undefined ? { fallbackModel } : {}),
      ...(shadowModel !== undefined ? { shadowModel } : {}),
      ...(shadowTrafficPercent !== undefined ? { shadowTrafficPercent } : {}),
      ...(description !== undefined ? { description } : {}),
    });
  }
  return overrides;
}

export function getModelRouteEnvOverrides() {
  const raw = String(process.env.AI_MODEL_ROUTES_JSON || "");
  if (cachedOverrides && cachedRaw === raw) {
    return cachedOverrides;
  }
  cachedRaw = raw;
  cachedOverrides = parseEnvOverrides(raw);
  return cachedOverrides;
}

export function hasModelRouteEnvOverride(sceneCode: string) {
  return getModelRouteEnvOverrides().has(sceneCode);
}

export function applyModelRouteEnvOverride<T extends ModelRouteLike>(sceneCode: string, route: T): T {
  const override = getModelRouteEnvOverrides().get(sceneCode);
  if (!override) {
    return route;
  }
  return {
    ...route,
    ...override,
  };
}

export function applyDbModelRouteEnvOverride<T extends DbModelRouteLike>(sceneCode: string, route: T): T {
  const override = getModelRouteEnvOverrides().get(sceneCode);
  if (!override) {
    return route;
  }
  return {
    ...route,
    ...(override.primaryModel !== undefined ? { primary_model: override.primaryModel } : {}),
    ...(override.fallbackModel !== undefined ? { fallback_model: override.fallbackModel } : {}),
    ...(override.shadowModel !== undefined ? { shadow_model: override.shadowModel } : {}),
    ...(override.shadowTrafficPercent !== undefined ? { shadow_traffic_percent: override.shadowTrafficPercent } : {}),
    ...(override.description !== undefined ? { description: override.description } : {}),
  };
}

export function getConfiguredDefaultModelRoutes() {
  return DEFAULT_MODEL_ROUTES.map((route) => applyModelRouteEnvOverride(route.sceneCode, route));
}
