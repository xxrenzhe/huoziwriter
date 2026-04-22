import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type StrategyArchetypeKey = "opinion" | "case" | "howto" | "hotTake" | "phenomenon";
export type ArchetypeRhythmTolerance = "low" | "med" | "high";
export type ArchetypeRhythmStrength = "low" | "med" | "high";

export type ArchetypeRhythmHints = {
  narrativeStance: string;
  energyCurve: string;
  discoveryMode: string;
  offTopicTolerance: ArchetypeRhythmTolerance;
  closureMode: string;
  judgmentStrength: ArchetypeRhythmStrength;
};

export type ArchetypeRhythmConsistencyReport = {
  status: "aligned" | "needs_attention" | "insufficient";
  score: number | null;
  matchedSignals: string[];
  issues: string[];
  detail: string;
};

type ArchetypeRhythmTemplateRow = {
  archetype_key: string;
  version: string;
  name: string;
  description: string | null;
  hints_json: string | Record<string, unknown>;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
};

export type ArchetypeRhythmTemplate = {
  archetypeKey: StrategyArchetypeKey;
  version: string;
  name: string;
  description: string | null;
  hints: ArchetypeRhythmHints;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArchetypeRhythmTemplateInput = {
  archetypeKey: StrategyArchetypeKey;
  version: string;
  name: string;
  description?: string | null;
  hints: ArchetypeRhythmHints;
  activate?: boolean;
  createdBy?: number | null;
};

const DEFAULT_ARCHETYPE_RHYTHM_HINTS: Record<StrategyArchetypeKey, ArchetypeRhythmHints> = {
  opinion: {
    narrativeStance: "笃定、略高半级",
    energyCurve: "开篇即点判断，随后层层升番，把分歧和代价越写越清楚。",
    discoveryMode: "直接给结论，再补能支撑结论的事实和变量。",
    offTopicTolerance: "low",
    closureMode: "回到判断本身，收成一句清楚立场。",
    judgmentStrength: "high",
  },
  case: {
    narrativeStance: "旁观近距离",
    energyCurve: "三段起伏推进：引入场景、出现转折、停在回响。",
    discoveryMode: "边走边发现，让案例自己把结构变化说出来。",
    offTopicTolerance: "med",
    closureMode: "停在一个动作或一个细节上，而不是抽象升华。",
    judgmentStrength: "med",
  },
  howto: {
    narrativeStance: "同行者",
    energyCurve: "整体稳态推进，先解释原理，再落到动作与边界。",
    discoveryMode: "先抽象后具体，把方法拆成可以执行的动作。",
    offTopicTolerance: "low",
    closureMode: "收成行动清单、落地点或一条可执行提醒。",
    judgmentStrength: "med",
  },
  hotTake: {
    narrativeStance: "冷眼旁观",
    energyCurve: "短起笔、长拆解，先戳破表象，再拉开角色差异。",
    discoveryMode: "从众声喧哗里摘出真正值得判断的那一点。",
    offTopicTolerance: "med",
    closureMode: "允许留白或反问，但必须让代价判断落地。",
    judgmentStrength: "high",
  },
  phenomenon: {
    narrativeStance: "分析师",
    energyCurve: "缓慢上升、持续深剖，从现象一路压到机制。",
    discoveryMode: "从现象到机制，再回到更大的判断。",
    offTopicTolerance: "high",
    closureMode: "收成一个更大的判断，而不是停在表层热度。",
    judgmentStrength: "med",
  },
};

const DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION = "v1";
const ARCHETYPE_RHYTHM_TEMPLATE_CACHE_TTL = 5 * 60 * 1000;
const archetypeRhythmTemplateCache = new Map<string, ArchetypeRhythmTemplate & { at: number }>();

function normalizeTolerance(value: unknown): ArchetypeRhythmTolerance | null {
  if (value === "low" || value === "med" || value === "high") {
    return value;
  }
  return null;
}

function normalizeStrength(value: unknown): ArchetypeRhythmStrength | null {
  if (value === "low" || value === "med" || value === "high") {
    return value;
  }
  return null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonRecord(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function buildArchetypeRhythmTemplateName(archetype: StrategyArchetypeKey) {
  return `${archetype} default rhythm`;
}

function buildArchetypeRhythmTemplateDescription(archetype: StrategyArchetypeKey) {
  return `Seeded default rhythm template for ${archetype}`;
}

function normalizeTemplateVersion(value: unknown) {
  return getString(value).replace(/\s+/g, "-").slice(0, 48);
}

function normalizeTemplateName(value: unknown) {
  return getString(value).slice(0, 80);
}

function normalizeHints(value: unknown, fallback: ArchetypeRhythmHints) {
  const record = getRecord(value);
  return {
    narrativeStance: getString(record?.narrativeStance) || fallback.narrativeStance,
    energyCurve: getString(record?.energyCurve) || fallback.energyCurve,
    discoveryMode: getString(record?.discoveryMode) || fallback.discoveryMode,
    offTopicTolerance: normalizeTolerance(record?.offTopicTolerance) ?? fallback.offTopicTolerance,
    closureMode: getString(record?.closureMode) || fallback.closureMode,
    judgmentStrength: normalizeStrength(record?.judgmentStrength) ?? fallback.judgmentStrength,
  } satisfies ArchetypeRhythmHints;
}

export function normalizeStrategyArchetypeKey(value: unknown): StrategyArchetypeKey | null {
  return value === "opinion"
    || value === "case"
    || value === "howto"
    || value === "hotTake"
    || value === "phenomenon"
    ? value
    : null;
}

function mapTemplateRow(row: ArchetypeRhythmTemplateRow): ArchetypeRhythmTemplate | null {
  const archetypeKey = normalizeStrategyArchetypeKey(row.archetype_key);
  if (!archetypeKey) {
    return null;
  }
  return {
    archetypeKey,
    version: row.version,
    name: row.name,
    description: row.description,
    hints: normalizeHints(parseJsonRecord(row.hints_json), DEFAULT_ARCHETYPE_RHYTHM_HINTS[archetypeKey]),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureArchetypeRhythmTemplateSeeds() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const archetype of Object.keys(DEFAULT_ARCHETYPE_RHYTHM_HINTS) as StrategyArchetypeKey[]) {
    const exists = await db.queryOne<{ version: string }>(
      `SELECT version
       FROM archetype_rhythm_templates
       WHERE archetype_key = ? AND version = ?`,
      [archetype, DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO archetype_rhythm_templates (
          archetype_key, version, name, description, hints_json, is_active, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          archetype,
          DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION,
          buildArchetypeRhythmTemplateName(archetype),
          buildArchetypeRhythmTemplateDescription(archetype),
          JSON.stringify(DEFAULT_ARCHETYPE_RHYTHM_HINTS[archetype]),
          true,
          null,
          now,
          now,
        ],
      );
    }
    const active = await db.queryOne<{ version: string }>(
      `SELECT version
       FROM archetype_rhythm_templates
       WHERE archetype_key = ? AND is_active = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [archetype, true],
    );
    if (!active) {
      await db.exec(
        `UPDATE archetype_rhythm_templates
         SET is_active = ?, updated_at = ?
         WHERE archetype_key = ? AND version = ?`,
        [true, now, archetype, DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION],
      );
    }
  }
}

export function clearArchetypeRhythmTemplateCache() {
  archetypeRhythmTemplateCache.clear();
}

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(value: string) {
  return stripMarkdown(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

const ARCHETYPE_SIGNAL_PATTERNS: Record<
  StrategyArchetypeKey,
  {
    opening: RegExp[];
    guidance: RegExp[];
    closing: RegExp[];
  }
> = {
  opinion: {
    opening: [/(问题是|真正|不是.+而是|别急着|先别急|关键是|本质上|我更倾向于|我想说)/],
    guidance: [/(判断|立场|结论|冲突|变量|层层|收束|代价)/],
    closing: [/(所以|因此|说到底|归根结底|我的判断|真正该|这就是|本质上)/],
  },
  case: {
    opening: [/(那天|当时|后来|我记得|他说|她说|原话|对话|工位|地铁|会议室|微信|凌晨|晚上)/],
    guidance: [/(场景|经历|动作|原话|亲历|转折|细节|回响)/],
    closing: [/(那一刻|后来|当时|一句话|那个瞬间|停在|动作|原话)/],
  },
  howto: {
    opening: [/(怎么做|方法|步骤|先别|可以先|先把|动作|流程|指南|清单)/],
    guidance: [/(原理|动作|步骤|方法|边界|执行|拆成|落地)/],
    closing: [/(可以先|先把|记住|别忘了|动作|清单|提醒|边界)/],
  },
  hotTake: {
    opening: [/(刷屏|热搜|这两天|刚刚|突然|事件|别急着|先别急|热闹|误读)/],
    guidance: [/(刷屏|误读|角色|差异|拆解|代价|喧哗|切口)/],
    closing: [/(真正该警惕|别急着|问题不在|代价|谁会|谁在|接下来|\?|？)/],
  },
  phenomenon: {
    opening: [/(现象|背后|趋势|信号|结构|机制|为什么|分化|不是个例)/],
    guidance: [/(现象|机制|结构|趋势|变量|分化|深剖|更大的判断)/],
    closing: [/(趋势|结构|机制|这不是个例|长期变量|更大的变化|真正变化|判断)/],
  },
};

export function getDefaultArchetypeRhythmHints(archetype: StrategyArchetypeKey | null | undefined) {
  return DEFAULT_ARCHETYPE_RHYTHM_HINTS[archetype || "phenomenon"] ?? DEFAULT_ARCHETYPE_RHYTHM_HINTS.phenomenon;
}

export function getMergedArchetypeRhythmHints(input: {
  archetype?: StrategyArchetypeKey | null;
  override?: Record<string, unknown> | null;
}) {
  const base = getDefaultArchetypeRhythmHints(input.archetype);
  const override = getRecord(input.override);
  return {
    narrativeStance: getString(override?.narrativeStance) || base.narrativeStance,
    energyCurve: getString(override?.energyCurve) || base.energyCurve,
    discoveryMode: getString(override?.discoveryMode) || base.discoveryMode,
    offTopicTolerance: normalizeTolerance(override?.offTopicTolerance) ?? base.offTopicTolerance,
    closureMode: getString(override?.closureMode) || base.closureMode,
    judgmentStrength: normalizeStrength(override?.judgmentStrength) ?? base.judgmentStrength,
  } satisfies ArchetypeRhythmHints;
}

export async function getActiveArchetypeRhythmTemplate(archetype: StrategyArchetypeKey | null | undefined) {
  const normalizedArchetype = archetype ?? "phenomenon";
  const cached = archetypeRhythmTemplateCache.get(normalizedArchetype);
  if (cached && Date.now() - cached.at < ARCHETYPE_RHYTHM_TEMPLATE_CACHE_TTL) {
    return {
      archetypeKey: cached.archetypeKey,
      version: cached.version,
      name: cached.name,
      description: cached.description,
      hints: cached.hints,
      isActive: cached.isActive,
      createdAt: cached.createdAt,
      updatedAt: cached.updatedAt,
    } satisfies ArchetypeRhythmTemplate;
  }

  await ensureArchetypeRhythmTemplateSeeds();
  const db = getDatabase();
  const row = await db.queryOne<ArchetypeRhythmTemplateRow>(
    `SELECT archetype_key, version, name, description, hints_json, is_active, created_at, updated_at
     FROM archetype_rhythm_templates
     WHERE archetype_key = ? AND is_active = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [normalizedArchetype, true],
  );
  const template = row
    ? mapTemplateRow(row)
    : {
        archetypeKey: normalizedArchetype,
        version: DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION,
        name: buildArchetypeRhythmTemplateName(normalizedArchetype),
        description: buildArchetypeRhythmTemplateDescription(normalizedArchetype),
        hints: getDefaultArchetypeRhythmHints(normalizedArchetype),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies ArchetypeRhythmTemplate;
  if (!template) {
    return {
      archetypeKey: normalizedArchetype,
      version: DEFAULT_ARCHETYPE_RHYTHM_TEMPLATE_VERSION,
      name: buildArchetypeRhythmTemplateName(normalizedArchetype),
      description: buildArchetypeRhythmTemplateDescription(normalizedArchetype),
      hints: getDefaultArchetypeRhythmHints(normalizedArchetype),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies ArchetypeRhythmTemplate;
  }
  archetypeRhythmTemplateCache.set(normalizedArchetype, {
    ...template,
    at: Date.now(),
  });
  return template;
}

export async function getMergedActiveArchetypeRhythmHints(input: {
  archetype?: StrategyArchetypeKey | null;
  override?: Record<string, unknown> | null;
}) {
  const activeTemplate = await getActiveArchetypeRhythmTemplate(input.archetype ?? null);
  return getMergedArchetypeRhythmHints({
    archetype: activeTemplate.archetypeKey,
    override: {
      ...activeTemplate.hints,
      ...(getRecord(input.override) ?? {}),
    },
  });
}

export async function listArchetypeRhythmTemplates() {
  await ensureArchetypeRhythmTemplateSeeds();
  const db = getDatabase();
  const rows = await db.query<ArchetypeRhythmTemplateRow>(
    `SELECT archetype_key, version, name, description, hints_json, is_active, created_at, updated_at
     FROM archetype_rhythm_templates
     ORDER BY archetype_key ASC, is_active DESC, updated_at DESC, id DESC`,
  );
  return rows
    .map((row) => mapTemplateRow(row))
    .filter((item): item is ArchetypeRhythmTemplate => item != null);
}

export async function createArchetypeRhythmTemplate(input: ArchetypeRhythmTemplateInput) {
  await ensureArchetypeRhythmTemplateSeeds();
  const db = getDatabase();
  const archetypeKey = normalizeStrategyArchetypeKey(input.archetypeKey);
  if (!archetypeKey) {
    throw new Error("节奏模板原型无效");
  }
  const version = normalizeTemplateVersion(input.version);
  if (!version) {
    throw new Error("节奏模板版本不能为空");
  }
  const name = normalizeTemplateName(input.name);
  if (!name) {
    throw new Error("节奏模板名称不能为空");
  }
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ version: string }>(
    `SELECT version
     FROM archetype_rhythm_templates
     WHERE archetype_key = ? AND version = ?`,
    [archetypeKey, version],
  );
  if (existing) {
    throw new Error("同原型下已存在相同版本号的节奏模板");
  }
  if (input.activate) {
    await db.exec(
      `UPDATE archetype_rhythm_templates
       SET is_active = ?, updated_at = ?
       WHERE archetype_key = ? AND is_active = ?`,
      [false, now, archetypeKey, true],
    );
  }
  await db.exec(
    `INSERT INTO archetype_rhythm_templates (
      archetype_key, version, name, description, hints_json, is_active, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      archetypeKey,
      version,
      name,
      getString(input.description) || null,
      JSON.stringify(input.hints),
      input.activate ? true : false,
      input.createdBy ?? null,
      now,
      now,
    ],
  );
  clearArchetypeRhythmTemplateCache();
  const created = await db.queryOne<ArchetypeRhythmTemplateRow>(
    `SELECT archetype_key, version, name, description, hints_json, is_active, created_at, updated_at
     FROM archetype_rhythm_templates
     WHERE archetype_key = ? AND version = ?`,
    [archetypeKey, version],
  );
  const mapped = created ? mapTemplateRow(created) : null;
  if (!mapped) {
    throw new Error("节奏模板创建成功但回读失败");
  }
  return mapped;
}

export async function activateArchetypeRhythmTemplate(input: {
  archetypeKey: StrategyArchetypeKey;
  version: string;
}) {
  await ensureArchetypeRhythmTemplateSeeds();
  const db = getDatabase();
  const archetypeKey = normalizeStrategyArchetypeKey(input.archetypeKey);
  if (!archetypeKey) {
    throw new Error("节奏模板原型无效");
  }
  const version = normalizeTemplateVersion(input.version);
  if (!version) {
    throw new Error("节奏模板版本不能为空");
  }
  const target = await db.queryOne<{ version: string }>(
    `SELECT version
     FROM archetype_rhythm_templates
     WHERE archetype_key = ? AND version = ?`,
    [archetypeKey, version],
  );
  if (!target) {
    throw new Error("目标节奏模板不存在");
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE archetype_rhythm_templates
     SET is_active = ?, updated_at = ?
     WHERE archetype_key = ? AND is_active = ?`,
    [false, now, archetypeKey, true],
  );
  await db.exec(
    `UPDATE archetype_rhythm_templates
     SET is_active = ?, updated_at = ?
     WHERE archetype_key = ? AND version = ?`,
    [true, now, archetypeKey, version],
  );
  clearArchetypeRhythmTemplateCache();
  return getActiveArchetypeRhythmTemplate(archetypeKey);
}

export function buildArchetypeRhythmHintText(hints: ArchetypeRhythmHints) {
  return [
    `叙事姿态：${hints.narrativeStance}`,
    `能量曲线：${hints.energyCurve}`,
    `发现模式：${hints.discoveryMode}`,
    `跑题容忍度：${hints.offTopicTolerance}`,
    `收束方式：${hints.closureMode}`,
    `判断强度：${hints.judgmentStrength}`,
  ].join("；");
}

export function evaluateArchetypeRhythmConsistency(input: {
  archetype?: StrategyArchetypeKey | null;
  expectedPrototypeCode?: string | null;
  actualPrototypeCode?: string | null;
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  if (!input.archetype) {
    return {
      status: "insufficient",
      score: null,
      matchedSignals: [],
      issues: ["策略原型尚未确定"],
      detail: "策略原型还没锁定，暂时无法评估原型节奏一致性。",
    } satisfies ArchetypeRhythmConsistencyReport;
  }

  const paragraphs = splitParagraphs(String(input.markdownContent || ""));
  const openingText = paragraphs.slice(0, 2).join("\n");
  const closingText = paragraphs.slice(-2).join("\n");
  const payload = getRecord(input.deepWritingPayload);
  const guidanceText = [
    getString(payload?.openingMove),
    getString(payload?.sectionRhythm),
    getString(payload?.evidenceMode),
  ].filter(Boolean).join(" ");

  if (!openingText && !closingText && !guidanceText && !getString(input.actualPrototypeCode)) {
    return {
      status: "insufficient",
      score: null,
      matchedSignals: [],
      issues: ["执行卡和正文都还不足以判断节奏偏离"],
      detail: "执行卡里还缺足够的原型节奏信息，暂时无法评估是否偏离。",
    } satisfies ArchetypeRhythmConsistencyReport;
  }

  const patterns = ARCHETYPE_SIGNAL_PATTERNS[input.archetype];
  const matchedSignals: string[] = [];
  const issues: string[] = [];
  let score = 0;
  const totalWeight = 1;

  if (input.expectedPrototypeCode && input.actualPrototypeCode && input.expectedPrototypeCode === input.actualPrototypeCode) {
    matchedSignals.push("执行卡原型与策略原型映射一致");
    score += 0.45;
  } else if (!input.actualPrototypeCode) {
    issues.push("执行卡还没明确正文原型");
  } else if (input.expectedPrototypeCode) {
    issues.push(`执行卡原型是「${input.actualPrototypeCode}」，未对齐策略映射「${input.expectedPrototypeCode}」`);
  }

  if (openingText && includesPattern(openingText, patterns.opening)) {
    matchedSignals.push("正文起手方式与当前原型相符");
    score += 0.2;
  } else if (guidanceText && includesPattern(guidanceText, patterns.opening)) {
    matchedSignals.push("执行卡起手动作与当前原型相符");
    score += 0.2;
  } else {
    issues.push("起手动作没有明显落到当前原型的默认切口");
  }

  if (guidanceText && includesPattern(guidanceText, patterns.guidance)) {
    matchedSignals.push("执行卡章节节奏与证据组织方向基本一致");
    score += 0.15;
  } else {
    issues.push("执行卡里的章节节奏或证据组织还不够像当前原型");
  }

  if (closingText && includesPattern(closingText, patterns.closing)) {
    matchedSignals.push("正文收束方式与当前原型相符");
    score += 0.2;
  } else {
    issues.push("正文结尾还没明显收成当前原型要求的停法");
  }

  const normalizedScore = Number((score / totalWeight).toFixed(2));
  const status = normalizedScore >= 0.7 ? "aligned" : "needs_attention";

  return {
    status,
    score: normalizedScore,
    matchedSignals,
    issues,
    detail:
      status === "aligned"
        ? `原型节奏一致性 ${Math.round(normalizedScore * 100)}%，执行卡与正文的起手、节奏和收束基本对齐。`
        : `原型节奏一致性 ${Math.round(normalizedScore * 100)}%，当前主要偏差：${issues.slice(0, 2).join("；")}。`,
  } satisfies ArchetypeRhythmConsistencyReport;
}
