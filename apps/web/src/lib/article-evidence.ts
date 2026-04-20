import type { ArticleEvidenceItem } from "./repositories";

const EVIDENCE_RESEARCH_TAG_LABELS = {
  timeline: "时间脉络",
  competitor: "横向比较",
  userVoice: "用户反馈",
  contradiction: "反证/反例",
  turningPoint: "关键转折",
} as const;

const EVIDENCE_ROLE_LABELS = {
  supportingEvidence: "支持性证据",
  counterEvidence: "反证/反例",
} as const;

export const EVIDENCE_HOOK_TAG_OPTIONS = ["反常识", "具身细节", "身份标签", "情绪造句"] as const;

export type EvidenceResearchTag = keyof typeof EVIDENCE_RESEARCH_TAG_LABELS;
export type EvidenceRole = keyof typeof EVIDENCE_ROLE_LABELS;
export type EvidenceHookTag = (typeof EVIDENCE_HOOK_TAG_OPTIONS)[number];

type EvidenceNodeLike = {
  id: number;
  title: string;
  fragments: Array<{
    id: number;
    title?: string | null;
    distilledContent: string;
    sourceType?: string | null;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string | null;
  }>;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEvidenceResearchTag(value: unknown): EvidenceResearchTag | null {
  const normalized = getString(value);
  if (normalized === "timeline" || normalized === "competitor" || normalized === "userVoice" || normalized === "contradiction" || normalized === "turningPoint") {
    return normalized;
  }
  return null;
}

export function normalizeEvidenceRole(value: unknown): EvidenceRole {
  return getString(value) === "counterEvidence" ? "counterEvidence" : "supportingEvidence";
}

export function normalizeEvidenceHookTag(value: unknown): EvidenceHookTag | null {
  const normalized = getString(value).replace(/^!+/, "");
  if (normalized === "反常识" || normalized === "具身细节" || normalized === "身份标签" || normalized === "情绪造句") {
    return normalized;
  }
  return null;
}

export function formatEvidenceResearchTagLabel(value: unknown) {
  const normalized = normalizeEvidenceResearchTag(value);
  return normalized ? EVIDENCE_RESEARCH_TAG_LABELS[normalized] : "";
}

export function formatEvidenceRoleLabel(value: unknown) {
  return EVIDENCE_ROLE_LABELS[normalizeEvidenceRole(value)];
}

function looksLikeUserVoice(text: string) {
  return /(reddit|forum|community|review|comment|评论|社区|用户|反馈|口碑|体验|帖子|吐槽)/i.test(text);
}

function looksLikeContradiction(text: string) {
  return /(反例|反证|另一面|但也|但是|不过|争议|质疑|有人认为|也有人|相反|然而|instead|however|criticism)/i.test(text);
}

function looksLikeCompetitor(text: string) {
  return /(竞品|对标|替代|比较|差异|玩家|格局|同类|vs\b|versus|benchmark)/i.test(text);
}

function looksLikeTurningPoint(text: string) {
  return /(拐点|转折|节点|关键时刻|milestone|turning point)/i.test(text);
}

function looksLikeTimeline(text: string) {
  return /(19\d{2}|20\d{2}|此前|后来|阶段|历史|演化|timeline|去年|今年|本月)/i.test(text);
}

function looksLikeCounterIntuition(text: string) {
  return /(反常识|没想到|误区|真相|其实|却|反而|并不是|不是.+而是|以为|居然|偏偏|误读|吊诡)/i.test(text);
}

function looksLikeEmbodiedDetail(text: string) {
  return /(周[一二三四五六日天]|早上|晚上|凌晨|\d{1,2}\s*点|工位|办公室|地铁|电梯|家里|咖啡馆|手机|微信|屏幕|弹出|盯着|坐着|走进|看到|发来|手心|后背|喉咙|呼吸|对话|现场)/i.test(text);
}

function looksLikeIdentityTag(text: string) {
  return /(打工人|创业者|老板|管理者|产品经理|运营|程序员|开发|设计师|创作者|公众号|博主|销售|学生|宝妈|家长|职场人|应届生|中年人|个体户|自由职业)/i.test(text);
}

function looksLikeEmotionalSentence(text: string) {
  return /(焦虑|委屈|愤怒|上头|破防|崩溃|窒息|后悔|不甘|刺痛|扎心|emo|心酸|怕|烦|爽|委屈|憋屈|无力|慌)/i.test(text);
}

export function inferEvidenceResearchTag(input: {
  title?: string | null;
  excerpt?: string | null;
  claim?: string | null;
  rationale?: string | null;
  sourceUrl?: string | null;
}) {
  const seed = [input.title, input.excerpt, input.claim, input.rationale, input.sourceUrl].map((item) => getString(item)).filter(Boolean).join(" ");
  if (!seed) {
    return null;
  }
  if (looksLikeContradiction(seed)) {
    return "contradiction";
  }
  if (looksLikeUserVoice(seed)) {
    return "userVoice";
  }
  if (looksLikeTurningPoint(seed)) {
    return "turningPoint";
  }
  if (looksLikeCompetitor(seed)) {
    return "competitor";
  }
  if (looksLikeTimeline(seed)) {
    return "timeline";
  }
  return null;
}

export function inferEvidenceRole(input: {
  evidenceRole?: unknown;
  researchTag?: unknown;
  title?: string | null;
  excerpt?: string | null;
  claim?: string | null;
  rationale?: string | null;
  sourceUrl?: string | null;
}) {
  if (getString(input.evidenceRole) === "counterEvidence") {
    return "counterEvidence" as const;
  }
  const researchTag = normalizeEvidenceResearchTag(input.researchTag) || inferEvidenceResearchTag(input);
  return researchTag === "contradiction" ? "counterEvidence" : "supportingEvidence";
}

export function inferEvidenceHookTags(input: {
  title?: string | null;
  excerpt?: string | null;
  claim?: string | null;
  rationale?: string | null;
  sourceUrl?: string | null;
}) {
  const seed = [input.title, input.excerpt, input.claim, input.rationale, input.sourceUrl].map((item) => getString(item)).filter(Boolean).join(" ");
  if (!seed) {
    return [] as EvidenceHookTag[];
  }
  const tags: EvidenceHookTag[] = [];
  if (looksLikeCounterIntuition(seed)) tags.push("反常识");
  if (looksLikeEmbodiedDetail(seed)) tags.push("具身细节");
  if (looksLikeIdentityTag(seed)) tags.push("身份标签");
  if (looksLikeEmotionalSentence(seed)) tags.push("情绪造句");
  return tags;
}

export function inferEvidenceHookStrength(input: {
  title?: string | null;
  excerpt?: string | null;
  claim?: string | null;
  rationale?: string | null;
  sourceUrl?: string | null;
  hookTags?: EvidenceHookTag[] | null;
}) {
  const tags = Array.isArray(input.hookTags) && input.hookTags.length > 0 ? input.hookTags : inferEvidenceHookTags(input);
  const seed = [input.title, input.excerpt, input.claim, input.rationale, input.sourceUrl].map((item) => getString(item)).filter(Boolean).join(" ");
  let score = 0;
  score += tags.length;
  if (seed.length >= 80) score += 1;
  if (looksLikeCounterIntuition(seed) && looksLikeEmotionalSentence(seed)) score += 1;
  if (looksLikeEmbodiedDetail(seed) && looksLikeIdentityTag(seed)) score += 1;
  return Math.max(0, Math.min(5, score));
}

export function tagEvidenceItemHooks<T extends Partial<ArticleEvidenceItem>>(item: T, taggedBy: "ai" | "author" = "ai") {
  const hookTags = inferEvidenceHookTags({
    title: item.title,
    excerpt: item.excerpt,
    claim: item.claim,
    rationale: item.rationale,
    sourceUrl: item.sourceUrl,
  });
  const hookStrength = inferEvidenceHookStrength({
    title: item.title,
    excerpt: item.excerpt,
    claim: item.claim,
    rationale: item.rationale,
    sourceUrl: item.sourceUrl,
    hookTags,
  });
  return {
    ...item,
    hookTags,
    hookStrength,
    hookTaggedBy: taggedBy,
    hookTaggedAt: new Date().toISOString(),
  };
}

function buildEvidenceKey(input: {
  fragmentId?: number | null;
  sourceUrl?: string | null;
  title?: string | null;
  excerpt?: string | null;
  evidenceRole?: string | null;
}) {
  if (Number(input.fragmentId || 0) > 0) {
    return `fragment:${Number(input.fragmentId)}:${normalizeEvidenceRole(input.evidenceRole)}`;
  }
  if (getString(input.sourceUrl)) {
    return `url:${getString(input.sourceUrl)}:${normalizeEvidenceRole(input.evidenceRole)}`;
  }
  return `text:${getString(input.title)}:${getString(input.excerpt).slice(0, 80)}:${normalizeEvidenceRole(input.evidenceRole)}`;
}

export function getArticleEvidenceStats(items: Array<Partial<ArticleEvidenceItem>> | null | undefined) {
  const normalizedItems = (items ?? []).filter((item) => getString(item.excerpt) || getString(item.title));
  const uniqueSourceTypes = new Set(normalizedItems.map((item) => getString(item.sourceType) || "manual"));
  const hookTagCoverage = Array.from(new Set(
    normalizedItems.flatMap((item) => {
      return Array.isArray(item.hookTags)
        ? item.hookTags.map((tag) => normalizeEvidenceHookTag(tag)).filter(Boolean) as EvidenceHookTag[]
        : [];
    }),
  ));
  const externalEvidenceCount = normalizedItems.filter((item) => getString(item.sourceUrl)).length;
  const screenshotEvidenceCount = normalizedItems.filter(
    (item) => getString(item.screenshotPath) || getString(item.sourceType) === "screenshot" || getString(item.usageMode) === "image",
  ).length;
  const counterEvidenceCount = normalizedItems.filter(
    (item) => normalizeEvidenceRole(item.evidenceRole) === "counterEvidence" || normalizeEvidenceResearchTag(item.researchTag) === "contradiction",
  ).length;
  const researchTagCount = new Set(normalizedItems.map((item) => normalizeEvidenceResearchTag(item.researchTag)).filter(Boolean)).size;
  const externalOrScreenshotCount = externalEvidenceCount + screenshotEvidenceCount;
  const minimumCountReady = normalizedItems.length >= 3;
  const externalReady = externalOrScreenshotCount >= 1;
  const flags = [
    !minimumCountReady ? "证据条数不足 3 条" : null,
    !externalReady ? "缺外部来源或截图证据" : null,
    normalizedItems.length > 0 && uniqueSourceTypes.size <= 1 ? "信源类型过于单一" : null,
    minimumCountReady && counterEvidenceCount === 0 ? "只有支持性证据，缺少反证或反例" : null,
  ].filter(Boolean) as string[];

  return {
    itemCount: normalizedItems.length,
    uniqueSourceTypeCount: uniqueSourceTypes.size,
    hookTagCoverage,
    hookTagCoverageCount: hookTagCoverage.length,
    externalEvidenceCount,
    screenshotEvidenceCount,
    counterEvidenceCount,
    researchTagCount,
    externalOrScreenshotCount,
    ready: minimumCountReady && externalReady,
    status:
      normalizedItems.length === 0
        ? "blocked"
        : minimumCountReady && externalReady
          ? uniqueSourceTypes.size <= 1 || counterEvidenceCount === 0
            ? "warning"
            : "passed"
          : "blocked",
    flags,
    detail:
      normalizedItems.length === 0
        ? "当前还没有确认任何证据条目。"
        : !minimumCountReady
          ? "证据条数还不够，至少需要 3 条可核对证据。"
          : !externalReady
            ? "还缺外部来源或截图证据，当前证据包不能进入发布守门。"
            : uniqueSourceTypes.size <= 1
              ? "证据包已达最低门槛，但信源类型仍偏单一。"
              : counterEvidenceCount === 0
                ? "证据包已达最低门槛，但还缺反证或反例。"
                : `已确认 ${normalizedItems.length} 条证据，覆盖 ${uniqueSourceTypes.size} 类来源。`,
  } as const;
}

export function buildSuggestedEvidenceItems(input: {
  evidenceItems?: ArticleEvidenceItem[] | null;
  nodes: EvidenceNodeLike[];
  factCheckPayload?: Record<string, unknown> | null;
}) {
  if (input.evidenceItems && input.evidenceItems.length > 0) {
    return input.evidenceItems;
  }

  const items: ArticleEvidenceItem[] = [];
  const keys = new Set<string>();

  for (const node of input.nodes) {
    for (const fragment of node.fragments) {
      const title = getString(fragment.title) || `${node.title} 素材`;
      const excerpt = getString(fragment.distilledContent);
      const sourceUrl = getString(fragment.sourceUrl) || null;
      const screenshotPath = getString(fragment.screenshotPath) || null;
      const rationale = `挂载于节点「${node.title}」`;
      const researchTag = inferEvidenceResearchTag({
        title,
        excerpt,
        rationale,
        sourceUrl,
      });
      const evidenceRole = inferEvidenceRole({
        title,
        excerpt,
        rationale,
        sourceUrl,
        researchTag,
      });
      const key = buildEvidenceKey({
        fragmentId: fragment.id,
        sourceUrl,
        title,
        excerpt,
        evidenceRole,
      });
      if (!excerpt || keys.has(key)) {
        continue;
      }
      keys.add(key);
      items.push({
        id: 0,
        articleId: 0,
        userId: 0,
        fragmentId: fragment.id,
        nodeId: node.id,
        claim: null,
        title,
        excerpt,
        sourceType: getString(fragment.sourceType) || "manual",
        sourceUrl,
        screenshotPath,
        usageMode: getString(fragment.usageMode) || "rewrite",
        rationale,
        researchTag,
        hookTags: [],
        hookStrength: null,
        hookTaggedBy: null,
        hookTaggedAt: null,
        evidenceRole,
        sortOrder: items.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  for (const card of getRecordArray(input.factCheckPayload?.evidenceCards)) {
    const claim = getString(card.claim) || null;
    const supportingEvidence = getRecordArray(card.supportingEvidence);
    const counterEvidence = getRecordArray(card.counterEvidence);
    const fallbackEvidenceItems = getRecordArray(card.evidenceItems);
    const evidenceGroups = supportingEvidence.length || counterEvidence.length
      ? [
          { role: "supportingEvidence" as const, items: supportingEvidence },
          { role: "counterEvidence" as const, items: counterEvidence },
        ]
      : [{ role: "supportingEvidence" as const, items: fallbackEvidenceItems }];
    for (const group of evidenceGroups) {
      for (const evidence of group.items) {
        const title = getString(evidence.title) || (claim ? `${claim} 对应证据` : `证据 ${items.length + 1}`);
        const excerpt = getString(evidence.excerpt);
        const sourceUrl = getString(evidence.sourceUrl) || null;
        const screenshotPath = getString(evidence.screenshotPath) || null;
        const rationale = getString(evidence.rationale) || (claim ? `用于支撑判断「${claim}」` : null);
        const researchTag =
          normalizeEvidenceResearchTag(evidence.researchTag)
          || inferEvidenceResearchTag({
            title,
            excerpt,
            claim,
            rationale,
            sourceUrl,
          });
        const evidenceRole = inferEvidenceRole({
          evidenceRole: evidence.evidenceRole || group.role,
          researchTag,
          title,
          excerpt,
          claim,
          rationale,
          sourceUrl,
        });
        const key = buildEvidenceKey({
          fragmentId: Number(evidence.fragmentId || 0) || null,
          sourceUrl,
          title,
          excerpt,
          evidenceRole,
        });
        if (!excerpt || keys.has(key)) {
          continue;
        }
        keys.add(key);
        items.push({
          id: 0,
          articleId: 0,
          userId: 0,
          fragmentId: Number(evidence.fragmentId || 0) || null,
          nodeId: null,
          claim,
          title,
          excerpt,
          sourceType: getString(evidence.sourceType) || "manual",
          sourceUrl,
          screenshotPath,
          usageMode: null,
          rationale,
          researchTag,
          hookTags: [],
          hookStrength: null,
          hookTaggedBy: null,
          hookTaggedAt: null,
          evidenceRole,
          sortOrder: items.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return items.slice(0, 12).map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));
}
