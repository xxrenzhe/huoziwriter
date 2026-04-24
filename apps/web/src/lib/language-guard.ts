import { getUserAccessScope } from "./access-scope";
import { getDatabase } from "./db";
import {
  collectLanguageGuardHits,
  type LanguageGuardMatchMode,
  type LanguageGuardRule,
  type LanguageGuardRuleKind,
} from "./language-guard-core";
import { assertLanguageGuardRuleQuota } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
export { collectLanguageGuardHits };
export type { LanguageGuardMatchMode, LanguageGuardRule, LanguageGuardRuleKind } from "./language-guard-core";

const LANGUAGE_GUARD_TOKENS_TABLE = "language_guard_tokens";

const SYSTEM_LANGUAGE_GUARD_RULES: LanguageGuardRule[] = [
  { id: "system-token-1", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "赋能", rewriteHint: "改成具体动作、结果或角色关系。", isEnabled: true, createdAt: null },
  { id: "system-token-2", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "底层逻辑", rewriteHint: "改成真实因果链，不要用空泛抽象词。", isEnabled: true, createdAt: null },
  { id: "system-token-3", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "不可否认", rewriteHint: "删掉绝对判断，换成可验证事实。", isEnabled: true, createdAt: null },
  { id: "system-token-4", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "值得注意的是", rewriteHint: "直接写结论，不要用播音腔起手。", isEnabled: true, createdAt: null },
  { id: "system-token-5", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "某种意义上", rewriteHint: "删掉缓冲垫，直接说明成立条件。", isEnabled: true, createdAt: null },
  { id: "system-token-6", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "换句话说", rewriteHint: "只有在真的换一个层次解释时才保留，否则直接删掉。", isEnabled: true, createdAt: null },
  { id: "system-token-7", scope: "system", source: "system", ruleKind: "token", matchMode: "contains", patternText: "总而言之", rewriteHint: "直接收束观点，不要先喊总结口号。", isEnabled: true, createdAt: null },
  { id: "system-pattern-1", scope: "system", source: "system", ruleKind: "pattern", matchMode: "template", patternText: "不是...而是…", rewriteHint: "只有在前后两部分都足够具体时才保留，否则改成直接判断。", isEnabled: true, createdAt: null },
  { id: "system-pattern-2", scope: "system", source: "system", ruleKind: "pattern", matchMode: "template", patternText: "首先...其次...最后…", rewriteHint: "优先改成自然递进，不要用讲稿式编号。", isEnabled: true, createdAt: null },
];

type LanguageGuardRuleRow = {
  id: number;
  user_id: number;
  rule_kind: LanguageGuardRuleKind;
  match_mode: LanguageGuardMatchMode;
  pattern_text: string;
  rewrite_hint: string | null;
  is_enabled: number | boolean;
  created_at: string;
};

function normalizeRule(input: {
  ruleKind: unknown;
  matchMode?: unknown;
  patternText: unknown;
  rewriteHint?: unknown;
}) {
  const ruleKind = String(input.ruleKind || "").trim() === "pattern" ? "pattern" : "token";
  const defaultMatchMode = ruleKind === "pattern" ? "template" : "contains";
  const matchMode = String(input.matchMode || "").trim() === "template" ? "template" : defaultMatchMode;
  const patternText = String(input.patternText || "").trim();
  const rewriteHint = String(input.rewriteHint || "").trim() || null;
  if (!patternText) {
    throw new Error("规则内容不能为空");
  }
  if (ruleKind === "pattern" && !patternText.includes("…")) {
    throw new Error("句式规则请用 ... 表示可变片段，例如“不是...而是...”");
  }
  return {
    ruleKind,
    matchMode,
    patternText,
    rewriteHint,
  } satisfies {
    ruleKind: LanguageGuardRuleKind;
    matchMode: LanguageGuardMatchMode;
    patternText: string;
    rewriteHint: string | null;
  };
}

async function getUserStoredLanguageGuardRules(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const [storedRules, tokenRows] = await Promise.all([
    db.query<LanguageGuardRuleRow>(
      `SELECT id, user_id, rule_kind, match_mode, pattern_text, rewrite_hint, is_enabled, created_at
       FROM language_guard_rules
       WHERE user_id IN (${placeholders})
       ORDER BY id DESC`,
      scope.userIds,
    ),
    db.query<{ id: number; user_id: number; word: string; created_at: string }>(
      `SELECT id, user_id, word, created_at
       FROM ${LANGUAGE_GUARD_TOKENS_TABLE}
       WHERE user_id IN (${placeholders})
       ORDER BY id DESC`,
      scope.userIds,
    ),
  ]);

  const deduped = new Map<string, LanguageGuardRule>();
  for (const word of tokenRows) {
    const key = `token_rule:${word.word.trim()}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      id: `token-rule-${word.id}`,
      scope: "user",
      source: "token_rule",
      ruleKind: "token",
      matchMode: "contains",
      patternText: word.word.trim(),
      rewriteHint: "改成更具体的动作、事实或关系。",
      isEnabled: true,
      createdAt: word.created_at,
    });
  }

  for (const rule of storedRules) {
    const key = `rule:${rule.rule_kind}:${rule.pattern_text.trim()}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      id: `rule-${rule.id}`,
      scope: "user",
      source: "rule",
      ruleKind: rule.rule_kind,
      matchMode: rule.match_mode,
      patternText: rule.pattern_text.trim(),
      rewriteHint: rule.rewrite_hint,
      isEnabled: Boolean(rule.is_enabled),
      createdAt: rule.created_at,
    });
  }

  return Array.from(deduped.values());
}

export async function getLanguageGuardRules(userId: number) {
  const userRules = await getUserStoredLanguageGuardRules(userId);
  return [...SYSTEM_LANGUAGE_GUARD_RULES, ...userRules];
}

export async function createLanguageGuardRule(input: {
  userId: number;
  ruleKind: unknown;
  matchMode?: unknown;
  patternText: unknown;
  rewriteHint?: unknown;
}) {
  await ensureExtendedProductSchema();
  const normalized = normalizeRule(input);
  const db = getDatabase();
  const existing = await getUserStoredLanguageGuardRules(input.userId);
  const duplicated = existing.find(
    (rule) =>
      rule.scope === "user" &&
      rule.ruleKind === normalized.ruleKind &&
      rule.patternText.trim() === normalized.patternText,
  );
  if (duplicated) {
    return duplicated;
  }

  const now = new Date().toISOString();
  await assertLanguageGuardRuleQuota(input.userId);
  if (normalized.ruleKind === "token" && normalized.matchMode === "contains") {
    await db.exec(`INSERT INTO ${LANGUAGE_GUARD_TOKENS_TABLE} (user_id, word, created_at) VALUES (?, ?, ?)`, [input.userId, normalized.patternText, now]);
    const created = await getUserStoredLanguageGuardRules(input.userId);
    return created.find((rule) => rule.source === "token_rule" && rule.patternText === normalized.patternText) ?? created[0];
  }

  const result = await db.exec(
    `INSERT INTO language_guard_rules (
      user_id, rule_kind, match_mode, pattern_text, rewrite_hint, is_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.userId, normalized.ruleKind, normalized.matchMode, normalized.patternText, normalized.rewriteHint, true, now, now],
  );
  return {
    id: `rule-${Number(result.lastInsertRowid ?? 0)}`,
    scope: "user",
    source: "rule",
    ruleKind: normalized.ruleKind,
    matchMode: normalized.matchMode,
    patternText: normalized.patternText,
    rewriteHint: normalized.rewriteHint,
    isEnabled: true,
    createdAt: now,
  } satisfies LanguageGuardRule;
}

export async function updateLanguageGuardRule(input: {
  userId: number;
  id: string;
  ruleKind: unknown;
  matchMode?: unknown;
  patternText: unknown;
  rewriteHint?: unknown;
}) {
  await ensureExtendedProductSchema();
  const normalized = normalizeRule(input);
  const db = getDatabase();
  const existingRules = await getUserStoredLanguageGuardRules(input.userId);
  const duplicated = existingRules.find(
    (rule) =>
      rule.scope === "user"
      && rule.id !== input.id
      && rule.ruleKind === normalized.ruleKind
      && rule.patternText.trim() === normalized.patternText,
  );
  if (duplicated) {
    throw new Error("已存在相同规则，无需重复保存");
  }
  const now = new Date().toISOString();
  const normalizedId = String(input.id || "").trim();
  if (normalizedId.startsWith("token-rule-")) {
    await db.exec(`DELETE FROM ${LANGUAGE_GUARD_TOKENS_TABLE} WHERE id = ? AND user_id = ?`, [Number(normalizedId.replace("token-rule-", "")), input.userId]);
    const result = await db.exec(
      `INSERT INTO language_guard_rules (
        user_id, rule_kind, match_mode, pattern_text, rewrite_hint, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.userId, normalized.ruleKind, normalized.matchMode, normalized.patternText, normalized.rewriteHint, true, now, now],
    );
    return {
      id: `rule-${Number(result.lastInsertRowid ?? 0)}`,
      scope: "user",
      source: "rule",
      ruleKind: normalized.ruleKind,
      matchMode: normalized.matchMode,
      patternText: normalized.patternText,
      rewriteHint: normalized.rewriteHint,
      isEnabled: true,
      createdAt: now,
    } satisfies LanguageGuardRule;
  }
  if (normalizedId.startsWith("rule-")) {
    const rawId = Number(normalizedId.replace("rule-", ""));
    await db.exec(
      `UPDATE language_guard_rules
       SET rule_kind = ?, match_mode = ?, pattern_text = ?, rewrite_hint = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [normalized.ruleKind, normalized.matchMode, normalized.patternText, normalized.rewriteHint, now, rawId, input.userId],
    );
    const updated = await getUserStoredLanguageGuardRules(input.userId);
    const matched = updated.find((rule) => rule.id === normalizedId);
    if (matched) {
      return matched;
    }
  }
  throw new Error("不支持编辑系统默认规则");
}

export async function deleteLanguageGuardRule(userId: number, id: string) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const normalizedId = String(id || "").trim();
  if (normalizedId.startsWith("token-rule-")) {
    await db.exec(`DELETE FROM ${LANGUAGE_GUARD_TOKENS_TABLE} WHERE id = ? AND user_id = ?`, [Number(normalizedId.replace("token-rule-", "")), userId]);
    return;
  }
  if (normalizedId.startsWith("rule-")) {
    await db.exec("DELETE FROM language_guard_rules WHERE id = ? AND user_id = ?", [Number(normalizedId.replace("rule-", "")), userId]);
    return;
  }
  throw new Error("不支持删除系统默认规则");
}

export function getLanguageGuardTokenBlacklist(rules: LanguageGuardRule[]) {
  return Array.from(
    new Set(
      rules
        .filter((rule) => rule.isEnabled && rule.ruleKind === "token")
        .map((rule) => rule.patternText.trim())
        .filter(Boolean),
    ),
  );
}
