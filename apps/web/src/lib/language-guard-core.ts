export type LanguageGuardRuleKind = "token" | "pattern";
export type LanguageGuardMatchMode = "contains" | "template";

export type LanguageGuardRule = {
  id: string;
  scope: "system" | "user";
  source: "system" | "rule" | "legacy";
  ruleKind: LanguageGuardRuleKind;
  matchMode: LanguageGuardMatchMode;
  patternText: string;
  rewriteHint: string | null;
  isEnabled: boolean;
  createdAt: string | null;
};

export type LanguageGuardHit = {
  ruleId: string;
  ruleKind: LanguageGuardRuleKind;
  matchMode: LanguageGuardMatchMode;
  matchedText: string;
  patternText: string;
  rewriteHint: string | null;
  scope: "system" | "user";
  severity: "high" | "medium";
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templateToRegex(template: string) {
  const parts = template.split("...").map((part) => escapeRegExp(part.trim())).filter(Boolean);
  if (parts.length === 0) return null;
  return new RegExp(parts.join("[\\s\\S]{0,40}?"), "g");
}

export function collectLanguageGuardHits(content: string, rules: LanguageGuardRule[]) {
  const text = String(content || "");
  if (!text.trim()) return [] as LanguageGuardHit[];
  const hits: LanguageGuardHit[] = [];
  const seen = new Set<string>();

  for (const rule of rules.filter((item) => item.isEnabled)) {
    const patternText = rule.patternText.trim();
    if (!patternText) continue;

    if (rule.ruleKind === "token" || rule.matchMode === "contains") {
      if (!text.includes(patternText)) continue;
      const key = `${rule.id}:${patternText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        ruleId: rule.id,
        ruleKind: rule.ruleKind,
        matchMode: rule.matchMode,
        matchedText: patternText,
        patternText,
        rewriteHint: rule.rewriteHint,
        scope: rule.scope,
        severity: rule.scope === "system" ? "medium" : "high",
      });
      continue;
    }

    const regex = templateToRegex(patternText);
    const match = regex ? text.match(regex)?.[0]?.trim() : null;
    if (!match) continue;
    const key = `${rule.id}:${match}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      ruleId: rule.id,
      ruleKind: rule.ruleKind,
      matchMode: rule.matchMode,
      matchedText: match,
      patternText,
      rewriteHint: rule.rewriteHint,
      scope: rule.scope,
      severity: "high",
    });
  }

  return hits;
}
