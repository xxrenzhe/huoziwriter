import { generateSceneText } from "./ai-gateway";
import { analyzeAiNoise } from "./ai-noise-scan";
import { evaluateFinalBodyViralContract } from "./article-viral-contract";
import { detectArticleViralMode, type ArticleViralMode } from "./article-viral-modes";
import { evaluateArticleViralScore, WECHAT_VIRAL_SCORE_THRESHOLD } from "./article-viral-score";
import { syncArticleCoverAssetToAssetFiles, syncArticleVisualAssetToAssetFiles } from "./asset-files";
import {
  buildSuggestedEvidenceItems,
  getArticleEvidenceStats,
  inferEvidenceResearchTag,
  inferEvidenceRole,
  tagEvidenceItemHooks,
} from "./article-evidence";
import { getArticleAuthoringStyleContext } from "./article-authoring-style-context";
import { saveArticleDraft } from "./article-draft";
import { planArticleVisualBriefs } from "./article-visual-planner";
import { listArticleVisualBriefs, replaceArticleVisualBriefs, updateArticleVisualBriefStatus } from "./article-visual-repository";
import {
  buildFourPointAudit,
  buildSuggestedStrategyCard,
  getHumanSignalScore,
  hasStrategyLockInputsChanged,
  isStrategyCardComplete,
} from "./article-strategy";
import { getArticleStageArtifact, updateArticleStageArtifactPayload } from "./article-stage-artifacts";
import { getDatabase } from "./db";
import { persistArticleCoverImageAssetSet } from "./image-assets";
import { generateCoverImage } from "./image-generation";
import { collectLanguageGuardHits, getLanguageGuardRules } from "./language-guard";
import { loadPromptWithMeta, type PromptLoadContext } from "./prompt-loader";
import { jpegThumbBuffer } from "./security";
import {
  getArticleById,
  getArticleEvidenceItems,
  getArticleOutcomeBundle,
  getArticleStrategyCard,
  getLatestArticleCoverImage,
  replaceArticleEvidenceItems,
  upsertArticleStrategyCard,
} from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { generateStrategyCardAutoDraft } from "./strategy-card-auto-draft";
import type { StrategyCardAutoDraft } from "./strategy-card-auto-draft";
import { getArticleNodes } from "./article-outline";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseRecord(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    try {
      return getRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return getRecord(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

const PUBLISH_REPAIR_AI_TIMEOUT_MS = 120_000;

type PublishAutoRepairGuardSnapshot = {
  blockers?: string[];
  warnings?: string[];
  checks?: Array<{
    key?: string;
    status?: string;
    severity?: string;
    targetStageCode?: string;
  }>;
};

function hasGuardIssue(input: PublishAutoRepairGuardSnapshot | null | undefined, keys: string[], targetStages: string[] = []) {
  if (!input) {
    return true;
  }
  const keySet = new Set(keys);
  const targetSet = new Set(targetStages);
  return (input.checks ?? []).some((check) => {
    const isIssue = check.status === "blocked" || check.status === "warning" || check.severity === "blocking" || check.severity === "warning";
    if (!isIssue) {
      return false;
    }
    return keySet.has(getString(check.key)) || targetSet.has(getString(check.targetStageCode));
  });
}

function detectStrategySeedTopic(title: string) {
  const seed = String(title || "").toLowerCase();
  if (/(搜索广告|搜索意图|关键词|谷歌广告|google ads|ppc|sem|投放|线索|转化|质量得分|quality score|match type|广告相关性)/i.test(seed)) {
    return "search_marketing";
  }
  return "generic";
}

function resolveRepairViralMode(input: {
  title: string;
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
  researchPayload?: Record<string, unknown> | null;
}) {
  const viralGenomePack = getRecord(input.deepWritingPayload?.viralGenomePack);
  const explicitMode = getString(viralGenomePack?.mode);
  if (explicitMode === "power_shift_breaking" || explicitMode === "default") {
    return explicitMode as ArticleViralMode;
  }
  return detectArticleViralMode({
    title: input.title,
    markdownContent: [
      input.title,
      getString(input.markdownContent),
      getString(input.deepWritingPayload?.centralThesis),
      getString(input.deepWritingPayload?.openingStrategy),
      getString(viralGenomePack?.firstScreenPromise),
      getString(viralGenomePack?.shareTrigger),
    ].filter(Boolean).join("\n"),
    businessQuestions: getStringArray(viralGenomePack?.businessQuestions, 7).length
      ? getStringArray(viralGenomePack?.businessQuestions, 7)
      : getStringArray(input.researchPayload?.businessQuestions, 7),
  });
}

export function buildViralScoreRepairPromptLines(input: {
  title: string;
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
  researchPayload?: Record<string, unknown> | null;
}) {
  const viralGenomePack = getRecord(input.deepWritingPayload?.viralGenomePack);
  const mode = resolveRepairViralMode(input);
  const firstScreenPromise = getString(viralGenomePack?.firstScreenPromise);

  if (mode === "power_shift_breaking") {
    return [
      "硬性改法：",
      "1. 保留原核心判断：这篇是王座更替/资本战/路线之争，不要改成普通新闻综述、百科解释或行业报告。",
      `2. 第一屏前 120-200 字必须同时兑现${firstScreenPromise ? `：${firstScreenPromise}` : "赢家名字、输家名字、硬数字和今天到底变了什么"}。`,
      "3. 必须加入 3-5 个 ## 小标题，让读者滑屏时直接抓住胜负看板、赢者为什么赢、输家哪里失血、成本差和下半场风险。",
      "4. 必须把外部胜负和内部裂痕连起来：不仅写谁赢了，还要写输家为什么开始慌、谁在担忧、哪条路线开始被怀疑。",
      "5. 必须至少保留一段胜负看板证据，写清赢家、输家、硬数字、时间差和来源锚点；不要只剩抽象判断。",
      "6. 必须让读者看到真实压力：哪张账单在压人、谁在质疑、谁在失血、市场怎样投票；不要只有结论，没有压迫感。",
      "7. 减少泛行业背景和说教句，把部分段落改成战报句、账本句、裂痕句和判断句，别把正文修回端着的评论稿。",
      "8. 如果正文已有图片 Markdown 或 <!-- huozi-visual:id --> 标记，必须保留，并把图片放在相关段落后面；信息图优先贴着胜负看板或成本对比，知识漫画优先贴着路线分歧或内部裂痕。",
      "9. 如果研究卡里有商业问题，正文至少写出钱从哪里来/成本卡在哪、为什么是现在、影响谁、最可信证据是什么。",
      "10. 段落保持 2-4 句自然呼吸；不要连续几段都在解释概念。",
      "11. 结尾不要落成“今天就去后台做什么”，而要落成一句适合转发的行业判断、格局改写或下半场推演。",
    ];
  }

  return [
    "硬性改法：",
    "1. 保留原核心判断，不要把文章改成另一个题，也不要把有冲突的稿子修成中性说明文。",
    `2. 第一屏前 200 字必须同时兑现${firstScreenPromise ? `：${firstScreenPromise}` : "具体对象、正在发生的变化和读者代价"}，不要先铺背景或先上方法。`,
    "3. 必须加入 3-5 个 ## 小标题，让读者滑屏时能直接抓住冲突、误判、关键变量和结尾判断。",
    "4. 如果开头已经出现角色、场景或组织冲突，必须把这条主线延续到中段，不要只在开头闪一下。",
    "5. 必须让读者看见一次真实压力：谁在亏、谁在急、谁在解释不动；不要只有判断，没有情绪。",
    "6. 如果文章本身是案例/实操型，至少保留一个 mini case，写清谁说了什么、盯着哪张表、结果卡在了哪里；不要只写“很多团队”“很多人”。",
    "7. 如果文章本身是方法/复盘型，可以保留 1 组可收藏的判断表、检查表或动作清单，但不要把全文修成教程。",
    "8. 必须减少重复的“不是...而是...”句式，把部分判断改成动作句、现场句、边界句和会场对话。",
    "9. 如果正文已有图片 Markdown 或 <!-- huozi-visual:id --> 标记，必须保留，并把图片移动到相关段落后面；不要把所有图片堆在文末。",
    "10. 如果研究卡里有商业问题，正文必须至少把钱/成本卡在哪、为什么是现在、哪些人不适合照搬、最可信证据是什么写进正文。",
    "11. 段落保持 2-4 句自然呼吸；不要写成行业报告、培训课、百科解释或站在上面教读者。",
    "12. 结尾必须留下一个可转发判断、一个可执行动作，或一个边界清晰的提醒，但不要收成空口号。",
  ];
}

export function buildHumanSignalSeed(title: string) {
  const topic = title.replace(/\s+/g, " ").trim() || "这篇文章";
  if (detectStrategySeedTopic(topic) === "search_marketing") {
    return {
      firstHandObservation: "最近看搜索投放复盘时，一个反复出现的场景很刺眼：词表越修越细，账户里的有效线索反而没有同步变扎实。",
      feltMoment: "最让人不舒服的不是花了钱没结果，而是团队明明把出价、匹配、创意都查了一遍，最后还是解释不了为什么“更精准”的词没有更值钱。",
      whyThisHitMe: "这件事打到我，是因为它暴露的不是一个投放技巧问题，而是很多团队还在用词面相关性替代需求阶段判断。",
      realSceneOrDialogue: "一次匿名复盘里，最关键的问题不是“这个词还要不要加价”，而是“搜这个词的人，到底是在了解、比较，还是已经准备行动”。",
      wantToComplain: "我最想吐槽的是，太多复盘把所有问题都归到执行层，反而绕开了最该先问的那件事：这个搜索背后的人到了哪一步。",
      nonDelegableTruth: "关键词只能告诉你用户说了什么，需求阶段才更接近他现在愿不愿意行动。",
    };
  }
  return {
    firstHandObservation: `最近复盘「${topic}」时，最值得写的不是概念本身，而是它在真实业务现场里反复制造的判断错位。`,
    feltMoment: "真正卡人的瞬间，往往不是不知道该做什么，而是旧判断看起来还对，结果却已经开始失灵。",
    whyThisHitMe: "这件事打到我，是因为它把一个表层问题翻成了更深的判断问题。",
    realSceneOrDialogue: "复盘现场里最该停顿的一句通常是：我们一直在修的，到底是不是那个真正影响结果的变量？",
    wantToComplain: "我最想吐槽的是，很多讨论急着给方法，却没有先把误判的代价说清楚。",
    nonDelegableTruth: "一篇文章真正不能外包的部分，是作者把现场、冲突和边界放在同一张桌上重新判断。",
  };
}

function buildPublishWindowFallback(now = new Date()) {
  const start = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now).replace(/\//g, "-");
  const endDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const end = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(endDate).replace(/\//g, "-");
  return `${start} 至 ${end} 晚间 20:00-22:00`;
}

function buildEndingActionFallback(title: string) {
  const topic = title.replace(/\s+/g, " ").trim() || "当前主题";
  if (detectStrategySeedTopic(topic) === "search_marketing") {
    return "结尾停在一个复盘动作上：把最近赚钱和不赚钱的搜索词按需求阶段重新分层，而不是继续只看词面准不准。";
  }
  return `结尾停在一个复盘动作上：把「${topic}」代回真实业务现场，重新确认最影响结果的变量是什么。`;
}

function buildTargetPackageFallback() {
  return "公众号终稿包：核心判断、事实边界、读者现场、标题开头、排版发布";
}

function splitMarkdownTitle(markdown: string) {
  const lines = String(markdown || "").split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) {
    const title = lines[0];
    let cursor = 1;
    while (cursor < lines.length && !lines[cursor]?.trim()) cursor += 1;
    return {
      title,
      body: lines.slice(cursor).join("\n").trimStart(),
    };
  }
  return { title: "", body: String(markdown || "").trimStart() };
}

function stripMarkdownInlineTokens(text: string) {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\([^)]+\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReaderFacingParagraphBlock(block: string) {
  const text = String(block || "").trim();
  return Boolean(text)
    && !/^#/.test(text)
    && !/^<!--/.test(text)
    && !/^!\[/.test(text)
    && !/^```/.test(text)
    && !/^\s*([-*]|\d+\.)\s+/.test(text);
}

function buildBigramSet(text: string) {
  const normalized = stripMarkdownInlineTokens(text).replace(/[^\p{L}\p{N}]+/gu, "");
  const grams = new Set<string>();
  if (normalized.length < 2) {
    return grams;
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

function computeBigramJaccard(left: string, right: string) {
  const leftSet = buildBigramSet(left);
  const rightSet = buildBigramSet(right);
  if (!leftSet.size || !rightSet.size) {
    return 0;
  }
  let intersection = 0;
  for (const gram of leftSet) {
    if (rightSet.has(gram)) {
      intersection += 1;
    }
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}

const INTRO_SCENE_MARKERS = [
  "老板",
  "销售",
  "投放",
  "用户",
  "客户",
  "团队",
  "复盘",
  "预算",
  "线索",
  "账户",
  "搜索词",
  "关键词",
  "报告",
  "会议",
  "后台",
  "数据",
  "转化",
  "成交",
  "产品",
  "运营",
] as const;

function countSharedSceneMarkers(left: string, right: string) {
  return INTRO_SCENE_MARKERS.filter((marker) => left.includes(marker) && right.includes(marker)).length;
}

function scoreOpeningBlock(block: string) {
  const text = stripMarkdownInlineTokens(block);
  let score = 0;
  if (text.length >= 70 && text.length <= 220) score += 2;
  else if (text.length >= 45 && text.length <= 280) score += 1;
  if (/(不是|而是|却|反而|看起来|实际上|问题必须先问清楚|真正该先问)/.test(text)) score += 2;
  if (/[？?]|到底|为什么|怎么/.test(text)) score += 2;
  if (countSharedSceneMarkers(text, text) >= 3) score += 2;
  if (/(查|看|问|复盘|拆|标|停|加价|拉出来|判断)/.test(text)) score += 1;
  if (/(花费|预算|线索|成交|转化|点击|回收|质量得分)/.test(text)) score += 1;
  if (/(因此可以看出|具有重要意义|本文将|综上所述)/.test(text)) score -= 2;
  return score;
}

function areNearDuplicateIntroBlocks(left: string, right: string) {
  const similarity = computeBigramJaccard(left, right);
  const sharedSceneMarkers = countSharedSceneMarkers(left, right);
  return similarity >= 0.28
    || (similarity >= 0.16 && sharedSceneMarkers >= 3)
    || (similarity >= 0.1 && sharedSceneMarkers >= 4)
    || sharedSceneMarkers >= 5;
}

export function collapseNearDuplicateIntroParagraphs(markdown: string) {
  const { title, body } = splitMarkdownTitle(markdown);
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length < 2) {
    return String(markdown || "").trim();
  }
  const firstSectionIndex = blocks.findIndex((block) => /^##\s+/.test(block));
  const introLimit = firstSectionIndex >= 0 ? firstSectionIndex : Math.min(blocks.length, 4);
  const introIndexes = blocks
    .slice(0, introLimit)
    .map((block, index) => (isReaderFacingParagraphBlock(block) ? index : -1))
    .filter((index) => index >= 0);
  if (introIndexes.length < 2) {
    return String(markdown || "").trim();
  }

  const removeIndexes = new Set<number>();
  for (let cursor = 0; cursor < introIndexes.length - 1; cursor += 1) {
    const currentIndex = introIndexes[cursor];
    const nextIndex = introIndexes[cursor + 1];
    const currentBlock = blocks[currentIndex] || "";
    const nextBlock = blocks[nextIndex] || "";
    if (!areNearDuplicateIntroBlocks(currentBlock, nextBlock)) {
      continue;
    }
    const currentScore = scoreOpeningBlock(currentBlock);
    const nextScore = scoreOpeningBlock(nextBlock);
    removeIndexes.add(nextScore > currentScore ? currentIndex : nextIndex);
  }

  if (!removeIndexes.size) {
    return String(markdown || "").trim();
  }

  const nextBody = blocks.filter((_, index) => !removeIndexes.has(index)).join("\n\n").trim();
  return [title, nextBody].filter(Boolean).join("\n\n").trim();
}

export function formatOpeningForPublish(opening: string) {
  const normalized = String(opening || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (/^(开头|策略|起手|要求|请|建议|采用|使用|沿用|已确认|围绕|第一段|首段|默认)/.test(normalized)) return "";
  if (/(不要|不得|必须|需要|应该|候选|模式|策略|第一段|首段|前两句|再补|再给|先抛|先写|回写|正文生成器|匿名复盘现场起手|让读者看见|引出)/.test(normalized)) return "";
  return normalized;
}

export function stripReaderInvisibleAutomationBlocks(markdown: string) {
  const internalPattern = /作者可以|作者以人设视角|人设视角|匿名复盘场景|研究问题|信源覆盖|补官方源|补时间脉络|补横向对比|补用户反馈|补反例|来源材料|不把无关|先围绕「[^」]+」把研究问题|真正需要研究清楚的不是发生了什么/;
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !internalPattern.test(block.replace(/\s+/g, " ")))
    .join("\n\n")
    .trim();
}

function syncMarkdownOpening(markdown: string, opening: string) {
  const normalizedOpening = formatOpeningForPublish(opening);
  if (!normalizedOpening) return markdown;
  const { title, body } = splitMarkdownTitle(markdown);
  const currentLead = body.split(/\n{2,}/)[0]?.replace(/\s+/g, " ").trim() || "";
  if (currentLead.startsWith(normalizedOpening.replace(/\s+/g, " ").slice(0, 36))) {
    return markdown;
  }
  const firstSectionIndex = body.search(/\n##\s+/);
  const rest = firstSectionIndex >= 0
    ? body.slice(firstSectionIndex).trimStart()
    : body.split(/\n{2,}/).slice(1).join("\n\n").trimStart();
  const nextBody = firstSectionIndex >= 0
    ? `${normalizedOpening}\n\n${rest}`
    : `${normalizedOpening}\n\n${body}`;
  const finalBody = firstSectionIndex >= 0 ? nextBody : `${normalizedOpening}\n\n${rest}`.trim();
  return collapseNearDuplicateIntroParagraphs([title, finalBody].filter(Boolean).join("\n\n").trim());
}

function replaceFirstReaderFacingBlock(markdown: string, replacement: string) {
  const nextReplacement = getString(replacement);
  if (!nextReplacement) return markdown;
  const { title, body } = splitMarkdownTitle(markdown);
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const firstIndex = blocks.findIndex((block) => !/^#/.test(block) && !/^<!--/.test(block) && !/^!\[/.test(block));
  if (firstIndex >= 0) {
    blocks[firstIndex] = nextReplacement;
  } else {
    blocks.unshift(nextReplacement);
  }
  return collapseNearDuplicateIntroParagraphs([title, blocks.join("\n\n")].filter(Boolean).join("\n\n").trim());
}

function buildOpeningHookRepair(title: string) {
  if (detectStrategySeedTopic(title) === "search_marketing") {
    return "一个账户最难受的时刻，不是买错了词，而是那个看起来最准的词一边吃预算、一边把线索表拖难看。复盘会里，老板盯回收，销售说这批人不像买家，投放还在解释相关性。问题必须先问清楚：搜这个词的人，到底是在了解、比较，还是已经准备行动？";
  }
  const topic = title.replace(/\s+/g, " ").trim() || "这件事";
  return `最容易误判的，通常不是一眼就错的东西，而是那个看起来很合理、却一直让结果对不上的变量。复盘「${topic}」时，真正该先摆上桌的不是更多背景，而是读者已经付出的代价、旧判断为什么失灵，以及今天能立刻检查的那一步。`;
}

async function runOpeningHookRepair(input: {
  articleId: number;
  userId: number;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return { changed: false, error: "article_missing" };
  }
  const opening = buildOpeningHookRepair(article.title);
  const nextMarkdown = replaceFirstReaderFacingBlock(article.markdown_content || "", opening);
  if (!nextMarkdown || nextMarkdown === (article.markdown_content || "")) {
    return { changed: false, error: null as string | null };
  }
  await saveArticleDraft({
    articleId: article.id,
    userId: input.userId,
    body: {
      title: article.title,
      markdownContent: nextMarkdown,
      status: article.status,
      seriesId: article.series_id,
      wechatTemplateId: article.wechat_template_id,
    },
  });
  return { changed: true, error: null as string | null };
}

export async function syncArticleOpeningFromDeepWritingArtifact(input: {
  articleId: number;
  userId: number;
}) {
  const [article, deepWritingArtifact, outlineArtifact] = await Promise.all([
    getArticleById(input.articleId, input.userId),
    getArticleStageArtifact(input.articleId, input.userId, "deepWriting"),
    getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning"),
  ]);
  if (!article) {
    return { changed: false, markdown: "" };
  }
  const outlineSelection = getRecord(outlineArtifact?.payload?.selection);
  const openingCandidates = [
    getString(deepWritingArtifact?.payload?.openingStrategy),
    getString(outlineSelection?.selectedOpeningHook),
    getString(outlineArtifact?.payload?.openingHook),
  ];
  const opening = openingCandidates.find((item) => formatOpeningForPublish(item)) || "";
  const nextMarkdown = syncMarkdownOpening(article.markdown_content || "", opening);
  if (!opening || nextMarkdown === (article.markdown_content || "")) {
    return { changed: false, markdown: article.markdown_content || "" };
  }
  await saveArticleDraft({
    articleId: article.id,
    userId: input.userId,
    body: {
      title: article.title,
      markdownContent: nextMarkdown,
      status: article.status,
      seriesId: article.series_id,
      wechatTemplateId: article.wechat_template_id,
    },
  });
  return { changed: true, markdown: nextMarkdown };
}

function mergeTextField(current: unknown, preferred: unknown, fallback?: unknown) {
  const currentText = getString(current);
  if (currentText) return currentText;
  const preferredText = getString(preferred);
  if (preferredText) return preferredText;
  const fallbackText = getString(fallback);
  return fallbackText || null;
}

function buildEvidenceSignature(item: {
  fragmentId?: number | null;
  nodeId?: number | null;
  claim?: string | null;
  title?: string | null;
  excerpt?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string | null;
  rationale?: string | null;
  researchTag?: string | null;
  evidenceRole?: string | null;
}) {
  return JSON.stringify({
    fragmentId: Number(item.fragmentId || 0) || 0,
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getString(item.claim),
    title: getString(item.title),
    excerpt: getString(item.excerpt),
    sourceType: getString(item.sourceType),
    sourceUrl: getString(item.sourceUrl),
    screenshotPath: getString(item.screenshotPath),
    usageMode: getString(item.usageMode),
    rationale: getString(item.rationale),
    researchTag: getString(item.researchTag),
    evidenceRole: getString(item.evidenceRole),
  });
}

const RESEARCH_SOURCE_COVERAGE_TYPES = [
  { key: "official", sourceType: "official" },
  { key: "industry", sourceType: "industry" },
  { key: "comparison", sourceType: "comparison" },
  { key: "userVoice", sourceType: "userVoice" },
  { key: "timeline", sourceType: "timeline" },
] as const;

function extractCoverageSourceLine(input: string) {
  const text = getString(input).replace(/\s+/g, " ");
  const match = text.match(/https?:\/\/[^\s；，,。)）]+/i);
  if (!match) {
    return null;
  }
  const sourceUrl = match[0].trim();
  const matchIndex = match.index ?? 0;
  const beforeUrl = text.slice(0, matchIndex).replace(/[：:：\s-]+$/g, "").trim();
  const afterUrl = text.slice(matchIndex + sourceUrl.length).replace(/^[：:：\s-]+/g, "").trim();
  return {
    label: beforeUrl || safeSourceHost(sourceUrl) || "研究来源",
    sourceUrl,
    detail: afterUrl || text,
  };
}

function safeSourceHost(sourceUrl: string | null) {
  if (!sourceUrl) {
    return "";
  }
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function isUsableCoverageSource(input: { sourceUrl: string; researchSeed: string }) {
  const host = safeSourceHost(input.sourceUrl).toLowerCase();
  if (!host) {
    return false;
  }
  if (host.includes("zhihu.com")) {
    return false;
  }
  if (/baidu\.com$/i.test(host) || host.endsWith(".baidu.com")) {
    return false;
  }
  if (host.includes("apple.com") && !/apple|苹果/i.test(input.researchSeed)) {
    return false;
  }
  return true;
}

function buildResearchEvidenceCandidates(researchPayload: Record<string, unknown> | null | undefined) {
  const cards = [
    ...getRecordArray(researchPayload?.timelineCards).map((card) => ({ kind: "timeline", card })),
    ...getRecordArray(researchPayload?.comparisonCards).map((card) => ({ kind: "competitor", card })),
    ...getRecordArray(researchPayload?.intersectionInsights).map((card) => ({ kind: "intersection", card })),
  ];
  const items: Array<{
    fragmentId?: number | null;
    nodeId?: number | null;
    claim?: string | null;
    title: string;
    excerpt: string;
    sourceType?: string | null;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string | null;
    rationale?: string | null;
    researchTag?: string | null;
    evidenceRole?: string | null;
  }> = [];
  const researchSeed = [
    getString(researchPayload?.researchObject),
    getString(researchPayload?.coreQuestion),
    getString(researchPayload?.authorHypothesis),
  ].filter(Boolean).join(" ");

  const sourceCoverage = getRecord(researchPayload?.sourceCoverage);
  for (const coverageType of RESEARCH_SOURCE_COVERAGE_TYPES) {
    for (const line of getStringArray(sourceCoverage?.[coverageType.key], 6)) {
      const parsed = extractCoverageSourceLine(line);
      if (!parsed || !isUsableCoverageSource({ sourceUrl: parsed.sourceUrl, researchSeed })) {
        continue;
      }
      const researchTag = coverageType.key === "userVoice"
        ? "userVoice"
        : coverageType.key === "comparison"
          ? "competitor"
          : coverageType.key === "timeline"
            ? "timeline"
            : inferEvidenceResearchTag({
                title: parsed.label,
                excerpt: parsed.detail,
                rationale: `sourceCoverage:${coverageType.key}`,
                sourceUrl: parsed.sourceUrl,
              }) || "turningPoint";
      const evidenceRole = inferEvidenceRole({
        researchTag,
        title: parsed.label,
        excerpt: parsed.detail,
        rationale: `sourceCoverage:${coverageType.key}`,
        sourceUrl: parsed.sourceUrl,
      });
      items.push({
        title: `${parsed.label}｜${coverageType.key}`.slice(0, 80),
        excerpt: [parsed.detail, `来自研究简报 ${coverageType.key} 覆盖项`].filter(Boolean).join("；").slice(0, 280),
        sourceType: coverageType.sourceType,
        sourceUrl: parsed.sourceUrl,
        screenshotPath: null,
        usageMode: "rewrite",
        rationale: `来自研究简报的${coverageType.key}信源覆盖`,
        researchTag,
        evidenceRole,
      });
    }
  }

  for (const { kind, card } of cards) {
    const cardTitle =
      getString(card.title)
      || getString(card.subject)
      || getString(card.insight)
      || getString(card.phase)
      || "研究线索";
    const cardSummary =
      getString(card.summary)
      || getString(card.position)
      || getString(card.insight)
      || getString(card.whyNow);
    const cardSignals = [
      ...getStringArray(card.signals, 2),
      ...getStringArray(card.differences, 2),
      ...getStringArray(card.support, 2),
      ...getStringArray(card.userVoices, 1),
      ...getStringArray(card.opportunities, 1),
      ...getStringArray(card.risks, 1),
    ].filter(Boolean);
    const sources = getRecordArray(card.sources);
    for (const source of sources) {
      const label = getString(source.label) || cardTitle;
      const sourceUrl = getString(source.sourceUrl) || null;
      const detail = getString(source.detail);
      const sourceType = getString(source.sourceType) || (sourceUrl ? "url" : "manual");
      const researchTag =
        inferEvidenceResearchTag({
          title: cardTitle,
          excerpt: `${cardSummary} ${detail}`.trim(),
          rationale: `${kind}:${label}`,
          sourceUrl,
        })
        || (kind === "timeline" ? "timeline" : kind === "competitor" ? "competitor" : "turningPoint");
      const evidenceRole = inferEvidenceRole({
        researchTag,
        title: cardTitle,
        excerpt: `${cardSummary} ${detail}`.trim(),
        rationale: `${kind}:${label}`,
        sourceUrl,
      });
      const excerpt = [cardSummary, detail, ...cardSignals].filter(Boolean).join("；").slice(0, 280);
      if (!excerpt) {
        continue;
      }
      items.push({
        title: `${cardTitle}｜${label}`.slice(0, 80),
        excerpt,
        sourceType,
        sourceUrl,
        screenshotPath: sourceType === "screenshot" ? detail || sourceUrl : null,
        usageMode: sourceType === "screenshot" ? "image" : "rewrite",
        rationale: `来自研究简报的${kind}线索`,
        researchTag,
        evidenceRole,
      });
    }
  }

  const researchSummary = getString(researchPayload?.researchSummary);
  for (const source of getRecordArray(researchPayload?.sources)) {
    const label = getString(source.label) || "研究来源";
    const detail = getString(source.detail) || researchSummary;
    const sourceUrl = getString(source.sourceUrl) || null;
    const sourceType = getString(source.sourceType) || (sourceUrl ? "url" : "manual");
    const researchTag =
      inferEvidenceResearchTag({
        title: label,
        excerpt: detail,
        rationale: "research:source",
        sourceUrl,
      })
      || "timeline";
    const evidenceRole = inferEvidenceRole({
      researchTag,
      title: label,
      excerpt: detail,
      rationale: "research:source",
      sourceUrl,
    });
    const excerpt = [detail, researchSummary].filter(Boolean).join("；").slice(0, 280);
    if (!excerpt) {
      continue;
    }
    items.push({
      title: label.slice(0, 80),
      excerpt,
      sourceType,
      sourceUrl,
      screenshotPath: sourceType === "screenshot" ? detail || sourceUrl : null,
      usageMode: sourceType === "screenshot" ? "image" : "rewrite",
      rationale: "来自研究简报顶层来源汇总",
      researchTag,
      evidenceRole,
    });
  }

  if (items.length === 0 && researchSummary) {
    items.push({
      title: "研究简报摘要",
      excerpt: researchSummary.slice(0, 280),
      sourceType: "manual",
      sourceUrl: null,
      screenshotPath: null,
      usageMode: "rewrite",
      rationale: "来自研究简报摘要的基础判断线索",
      researchTag: "timeline",
      evidenceRole: "supportingEvidence",
    });
  }

  return items;
}

export async function ensureStrategyCardPreparedForWriting(input: {
  articleId: number;
  userId: number;
  title: string;
  markdownContent: string;
  promptContext: PromptLoadContext;
}) {
  const [strategyCard, researchArtifact, audienceArtifact, outlineArtifact, outcomeBundle] = await Promise.all([
    getArticleStrategyCard(input.articleId, input.userId),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
    getArticleStageArtifact(input.articleId, input.userId, "audienceAnalysis"),
    getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning"),
    getArticleOutcomeBundle(input.articleId, input.userId),
  ]);

  const stageArtifacts = [
    { stageCode: "researchBrief", payload: researchArtifact?.payload ?? null },
    { stageCode: "audienceAnalysis", payload: audienceArtifact?.payload ?? null },
    { stageCode: "outlinePlanning", payload: outlineArtifact?.payload ?? null },
  ];
  const suggested = buildSuggestedStrategyCard({
    strategyCard,
    stageArtifacts,
    seriesInsight: null,
    outcomeBundle,
  });
  const humanSeed = buildHumanSignalSeed(input.title);
  const needAutoDraft = !isStrategyCardComplete(strategyCard) || getHumanSignalScore(strategyCard) < 2;
  const autoDraft: StrategyCardAutoDraft = needAutoDraft
    ? await generateStrategyCardAutoDraft({
        title: input.title,
        summary: input.markdownContent.replace(/\s+/g, " ").slice(0, 700),
        chosenAngle: mergeTextField(strategyCard?.coreAssertion, suggested.coreAssertion, ""),
        recommendationReason: mergeTextField(strategyCard?.whyNow, suggested.whyNow, ""),
        readerSnapshotHint: mergeTextField(strategyCard?.targetReader, suggested.targetReader, ""),
        strategyCard: strategyCard ?? undefined,
        promptContext: input.promptContext,
      }).catch(() => ({} as StrategyCardAutoDraft))
    : {};

  const nextStrategyCard = {
    archetype: strategyCard?.archetype ?? suggested.archetype ?? autoDraft.archetype ?? "opinion",
    mainstreamBelief: mergeTextField(strategyCard?.mainstreamBelief, autoDraft.mainstreamBelief, suggested.mainstreamBelief),
    targetReader: mergeTextField(strategyCard?.targetReader, suggested.targetReader, autoDraft.targetReader),
    coreAssertion: mergeTextField(strategyCard?.coreAssertion, suggested.coreAssertion, autoDraft.coreAssertion),
    whyNow: mergeTextField(strategyCard?.whyNow, suggested.whyNow, autoDraft.whyNow),
    researchHypothesis: mergeTextField(strategyCard?.researchHypothesis, suggested.researchHypothesis, autoDraft.researchHypothesis),
    marketPositionInsight: mergeTextField(strategyCard?.marketPositionInsight, suggested.marketPositionInsight, autoDraft.marketPositionInsight),
    historicalTurningPoint: mergeTextField(strategyCard?.historicalTurningPoint, suggested.historicalTurningPoint, autoDraft.historicalTurningPoint),
    targetPackage: mergeTextField(strategyCard?.targetPackage, autoDraft.targetPackage, suggested.targetPackage || buildTargetPackageFallback()),
    publishWindow: mergeTextField(strategyCard?.publishWindow, autoDraft.publishWindow, buildPublishWindowFallback()),
    endingAction: mergeTextField(strategyCard?.endingAction, autoDraft.endingAction, suggested.endingAction || buildEndingActionFallback(input.title)),
    firstHandObservation: mergeTextField(strategyCard?.firstHandObservation, autoDraft.firstHandObservation, humanSeed.firstHandObservation),
    feltMoment: mergeTextField(strategyCard?.feltMoment, autoDraft.feltMoment, humanSeed.feltMoment),
    whyThisHitMe: mergeTextField(strategyCard?.whyThisHitMe, autoDraft.whyThisHitMe, humanSeed.whyThisHitMe),
    realSceneOrDialogue: mergeTextField(strategyCard?.realSceneOrDialogue, autoDraft.realSceneOrDialogue, humanSeed.realSceneOrDialogue),
    wantToComplain: mergeTextField(strategyCard?.wantToComplain, autoDraft.wantToComplain, humanSeed.wantToComplain),
    nonDelegableTruth: mergeTextField(strategyCard?.nonDelegableTruth, autoDraft.nonDelegableTruth, humanSeed.nonDelegableTruth),
  };

  const shouldClearLock = hasStrategyLockInputsChanged(strategyCard, nextStrategyCard);
  const fourPointAudit = buildFourPointAudit(nextStrategyCard);
  const saved = await upsertArticleStrategyCard({
    articleId: input.articleId,
    userId: input.userId,
    ...nextStrategyCard,
    fourPointAudit,
    strategyLockedAt: shouldClearLock ? null : strategyCard?.strategyLockedAt ?? null,
    strategyOverride: shouldClearLock ? false : strategyCard?.strategyOverride ?? false,
  });

  const changed = JSON.stringify(strategyCard ?? null) !== JSON.stringify(saved ?? null);
  return {
    changed,
  };
}

export async function ensureEvidencePackagePreparedForPublish(input: {
  articleId: number;
  userId: number;
}) {
  const [currentEvidenceItems, nodes, factCheckArtifact, researchArtifact] = await Promise.all([
    getArticleEvidenceItems(input.articleId, input.userId),
    getArticleNodes(input.articleId),
    getArticleStageArtifact(input.articleId, input.userId, "factCheck"),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
  ]);

  const suggestedFromNodes = buildSuggestedEvidenceItems({
    nodes,
    factCheckPayload: factCheckArtifact?.payload ?? null,
  });
  const suggestedFromResearch = buildResearchEvidenceCandidates(researchArtifact?.payload ?? null);
  const merged = currentEvidenceItems.map((item) => (
    Array.isArray(item.hookTags) && item.hookTags.length > 0
      ? item
      : tagEvidenceItemHooks(item)
  ));
  const signatures = new Set(currentEvidenceItems.map((item) => buildEvidenceSignature(item)));

  for (const candidate of [...suggestedFromNodes, ...suggestedFromResearch]) {
    const signature = buildEvidenceSignature(candidate);
    if (signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    merged.push(tagEvidenceItemHooks({
      id: 0,
      articleId: input.articleId,
      userId: input.userId,
      fragmentId: Number(candidate.fragmentId || 0) || null,
      nodeId: Number(candidate.nodeId || 0) || null,
      claim: getString(candidate.claim) || null,
      title: getString(candidate.title),
      excerpt: getString(candidate.excerpt),
      sourceType: getString(candidate.sourceType) || "manual",
      sourceUrl: getString(candidate.sourceUrl) || null,
      screenshotPath: getString(candidate.screenshotPath) || null,
      usageMode: getString(candidate.usageMode) || null,
      rationale: getString(candidate.rationale) || null,
      researchTag: getString(candidate.researchTag) || null,
      hookTags: [],
      hookStrength: null,
      hookTaggedBy: null,
      hookTaggedAt: null,
      evidenceRole: getString(candidate.evidenceRole) || "supportingEvidence",
      sortOrder: merged.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  const beforeStats = getArticleEvidenceStats(currentEvidenceItems);
  const afterStats = getArticleEvidenceStats(merged);
  const hookTagsChanged = currentEvidenceItems.some((item, index) => {
    const beforeTags = Array.isArray(item.hookTags) ? item.hookTags : [];
    const afterTags = Array.isArray(merged[index]?.hookTags) ? merged[index]?.hookTags : [];
    return JSON.stringify(beforeTags) !== JSON.stringify(afterTags);
  });
  const evidenceStatsChanged =
    beforeStats.ready !== afterStats.ready
    || beforeStats.itemCount !== afterStats.itemCount
    || beforeStats.externalOrScreenshotCount !== afterStats.externalOrScreenshotCount
    || beforeStats.hookTagCoverageCount !== afterStats.hookTagCoverageCount;
  if (!hookTagsChanged && !evidenceStatsChanged) {
    return {
      changed: false,
    };
  }

  await replaceArticleEvidenceItems({
    articleId: input.articleId,
    userId: input.userId,
    items: merged.map((item) => ({
      fragmentId: item.fragmentId,
      nodeId: item.nodeId,
      claim: item.claim,
      title: item.title,
      excerpt: item.excerpt,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      screenshotPath: item.screenshotPath,
      usageMode: item.usageMode,
      rationale: item.rationale,
      researchTag: item.researchTag,
      evidenceRole: item.evidenceRole,
      hookTags: item.hookTags,
      hookStrength: item.hookStrength,
      hookTaggedBy: item.hookTaggedBy,
      hookTaggedAt: item.hookTaggedAt,
    })),
  });

  return {
    changed: true,
  };
}

function buildFactRiskItems(factCheckPayload: Record<string, unknown> | null | undefined) {
  const checks = getRecordArray(factCheckPayload?.checks);
  const riskyClaims = checks
    .filter((item) => getString(item.status) === "risky")
    .map((item) => getString(item.claim))
    .filter(Boolean);
  const needsSourceClaims = checks
    .filter((item) => getString(item.status) === "needs_source")
    .map((item) => getString(item.claim))
    .filter(Boolean);
  return {
    riskyClaims,
    needsSourceClaims,
    missingEvidence: getStringArray(factCheckPayload?.missingEvidence, 8),
    overallRisk: getString(factCheckPayload?.overallRisk),
  };
}

export async function runFactRiskRepairWithRetries(input: {
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
  scope?: "highRiskOnly" | "allBlocking";
}) {
  let article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      error: "article_missing",
      riskyClaimCount: 0,
      needsSourceClaimCount: 0,
    };
  }

  const factCheckArtifact = await getArticleStageArtifact(input.articleId, input.userId, "factCheck");
  const riskItems = buildFactRiskItems(factCheckArtifact?.payload ?? null);
  const scope = input.scope || "allBlocking";
  const needsRepair =
    scope === "highRiskOnly"
      ? riskItems.overallRisk === "high" || riskItems.riskyClaims.length > 0
      : riskItems.overallRisk === "high"
        || riskItems.riskyClaims.length > 0
        || riskItems.needsSourceClaims.length > 0
        || riskItems.missingEvidence.length > 0;
  if (!needsRepair) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      error: null as string | null,
      riskyClaimCount: 0,
      needsSourceClaimCount: 0,
    };
  }

  let changed = false;
  let provider: string | null = null;
  let model: string | null = null;
  let errorMessage: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const promptMeta = await loadPromptWithMeta("fact_check", input.promptContext);
    try {
      const result = await generateSceneText({
        sceneCode: "factCheck",
        systemPrompt: [
          promptMeta.content,
          "现在你的任务不是再次打分，而是担任事实风险改写编辑。",
          "只允许输出修复后的完整 Markdown 正文，不要解释，不要 JSON。",
          "原则：没有证据支撑的具体数字、案例、强因果、行业定论和绝对趋势必须删除、降级为条件判断，或改写成「可观察信号/有限样本」表述。",
          "禁止新增事实、禁止编造来源、禁止为了保留观点而扩大证据含义。",
        ].join("\n"),
        userPrompt: [
          `标题：${article.title}`,
          `整体风险：${riskItems.overallRisk || "unknown"}`,
          riskItems.riskyClaims.length > 0 ? `高风险断言：${riskItems.riskyClaims.join("；")}` : "高风险断言：无",
          scope === "allBlocking" && riskItems.needsSourceClaims.length > 0 ? `待补证据断言：${riskItems.needsSourceClaims.join("；")}` : "待补证据断言：本轮不处理",
          scope === "allBlocking" && riskItems.missingEvidence.length > 0 ? `缺失证据：${riskItems.missingEvidence.join("；")}` : "缺失证据：本轮不处理",
          "改写要求：",
          "1. 对高风险断言，优先删除具体强判断；如果保留，只能写成有条件、可被证据支撑的判断。",
          scope === "allBlocking"
            ? "2. 对待补证据断言，正文中不得继续以确定语气出现。"
            : "2. 不要因为普通待补证据大改文章结构；只隔离高风险断言，保留原有段落顺序和节奏。",
          "3. 保留文章主线、段落顺序和已验证事实。",
          "4. 输出完整 Markdown 正文。",
          "当前正文：",
          article.markdown_content || "",
        ].join("\n"),
        temperature: 0.15,
        rolloutUserId: input.userId,
        maxAttempts: 1,
        requestTimeoutMs: PUBLISH_REPAIR_AI_TIMEOUT_MS,
      });
      provider = result.provider;
      model = result.model;
      const nextMarkdown = collapseNearDuplicateIntroParagraphs(result.text.trim());
      if (!nextMarkdown || nextMarkdown === article.markdown_content) {
        break;
      }
      await saveArticleDraft({
        articleId: article.id,
        userId: input.userId,
        body: {
          title: article.title,
          markdownContent: nextMarkdown,
          status: article.status,
          seriesId: article.series_id,
          wechatTemplateId: article.wechat_template_id,
        },
      });
      changed = true;
      article = await getArticleById(input.articleId, input.userId);
      if (!article) {
        break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "fact_risk_repair_failed";
      break;
    }
  }

  return {
    changed,
    provider,
    model,
    error: errorMessage,
    riskyClaimCount: riskItems.riskyClaims.length,
    needsSourceClaimCount: riskItems.needsSourceClaims.length,
  };
}

export async function ensureCoverImagePreparedForPublish(input: {
  articleId: number;
  userId: number;
  title: string;
}) {
  const authoringContext = await getArticleAuthoringStyleContext(input.userId, input.articleId);
  const article = await getArticleById(input.articleId, input.userId);
  let coverBrief = (await listArticleVisualBriefs(input.userId, input.articleId)).find((brief) => brief.visualScope === "cover") ?? null;
  if (!coverBrief && article) {
    const planned = await planArticleVisualBriefs({
      userId: input.userId,
      articleId: input.articleId,
      title: input.title,
      markdown: article.markdown_content,
      includeCover: true,
      includeInline: false,
    });
    coverBrief = (await replaceArticleVisualBriefs({
      userId: input.userId,
      articleId: input.articleId,
      briefs: planned,
    })).find((brief) => brief.visualScope === "cover") ?? null;
  }
  const currentCover = await getLatestArticleCoverImage(input.userId, input.articleId);
  if (currentCover) {
    if (coverBrief?.id) {
      const db = getDatabase();
      const row = await db.queryOne<{
        id: number;
        image_url: string;
        storage_provider: string | null;
        original_object_key: string | null;
        compressed_object_key: string | null;
        thumbnail_object_key: string | null;
        asset_manifest_json: string | Record<string, unknown> | null;
        created_at: string | null;
      }>(
        `SELECT id, image_url, storage_provider, original_object_key, compressed_object_key,
                thumbnail_object_key, asset_manifest_json, created_at
         FROM cover_images
         WHERE id = ? AND user_id = ? AND article_id = ?`,
        [currentCover.id, input.userId, input.articleId],
      );
      if (row) {
        const manifest = parseRecord(row.asset_manifest_json) ?? {};
        const visualManifest = {
          ...manifest,
          baoyu: coverBrief.promptManifest || getRecord(manifest.baoyu) || null,
          promptHash: coverBrief.promptHash || getString(manifest.promptHash) || null,
          visualBriefId: coverBrief.id,
        };
        const coverAssetFileId = await syncArticleVisualAssetToAssetFiles({
          assetScope: "visual_brief",
          sourceRecordId: coverBrief.id,
          visualBriefId: coverBrief.id,
          userId: input.userId,
          articleId: input.articleId,
          assetType: "cover_image",
          imageUrl: row.image_url,
          storageProvider: row.storage_provider,
          originalObjectKey: row.original_object_key,
          compressedObjectKey: row.compressed_object_key,
          thumbnailObjectKey: row.thumbnail_object_key,
          assetManifestJson: visualManifest,
          insertAnchor: coverBrief.targetAnchor,
          altText: coverBrief.altText,
          caption: coverBrief.caption ?? null,
          createdAt: row.created_at,
        });
        await updateArticleVisualBriefStatus({
          briefId: coverBrief.id,
          userId: input.userId,
          status: "generated",
          generatedAssetFileId: coverAssetFileId,
        });
      }
    }
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
    };
  }
  let generated: {
    imageUrl: string;
    prompt: string;
    providerName: string;
    model: string;
  };
  try {
    generated = await generateCoverImage({
      title: input.title,
      authoringContext,
      promptOverride: coverBrief?.promptText || undefined,
      negativePrompt: coverBrief?.negativePrompt || undefined,
      outputResolution: coverBrief?.outputResolution || undefined,
      aspectRatio: coverBrief?.aspectRatio || undefined,
    });
  } catch (error) {
    generated = {
      imageUrl: `data:image/jpeg;base64,${jpegThumbBuffer().toString("base64")}`,
      prompt: `本地兜底封面：${input.title}`,
      providerName: "local",
      model: "fallback-jpeg-thumb",
    };
  }
  const storedAsset = await persistArticleCoverImageAssetSet({
    userId: input.userId,
    articleId: input.articleId,
    batchToken: `auto-cover-${input.userId}-${Date.now()}`,
    variantLabel: "自动首选",
    source: generated.imageUrl,
    aspectRatio: coverBrief?.aspectRatio || "16:9",
  });
  const assetManifest = {
    ...storedAsset.assetManifest,
    baoyu: coverBrief?.promptManifest || null,
    prompt: generated.prompt,
    provider: generated.providerName,
    model: generated.model,
    size: coverBrief?.aspectRatio || "16:9",
    promptHash: coverBrief?.promptHash || null,
    visualBriefId: coverBrief?.id || null,
  };
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO cover_images (
      user_id, article_id, prompt, image_url, storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.articleId,
      generated.prompt,
      storedAsset.imageUrl,
      storedAsset.storageProvider,
      storedAsset.originalObjectKey,
      storedAsset.compressedObjectKey,
      storedAsset.thumbnailObjectKey,
      JSON.stringify(assetManifest),
      createdAt,
    ],
  );
  await syncArticleCoverAssetToAssetFiles({
    assetScope: "cover",
    sourceRecordId: Number(result.lastInsertRowid || 0),
    userId: input.userId,
    articleId: input.articleId,
    batchToken: `auto-cover-${input.userId}`,
    variantLabel: "自动首选",
    imageUrl: storedAsset.imageUrl,
    storageProvider: storedAsset.storageProvider,
    originalObjectKey: storedAsset.originalObjectKey,
    compressedObjectKey: storedAsset.compressedObjectKey,
    thumbnailObjectKey: storedAsset.thumbnailObjectKey,
    assetManifestJson: assetManifest,
    createdAt,
  });
  if (coverBrief?.id) {
    const coverAssetFileId = await syncArticleVisualAssetToAssetFiles({
      assetScope: "visual_brief",
      sourceRecordId: coverBrief.id,
      visualBriefId: coverBrief.id,
      userId: input.userId,
      articleId: input.articleId,
      assetType: "cover_image",
      imageUrl: storedAsset.imageUrl,
      storageProvider: storedAsset.storageProvider,
      originalObjectKey: storedAsset.originalObjectKey,
      compressedObjectKey: storedAsset.compressedObjectKey,
      thumbnailObjectKey: storedAsset.thumbnailObjectKey,
      assetManifestJson: assetManifest,
      insertAnchor: coverBrief.targetAnchor,
      altText: coverBrief.altText,
      caption: coverBrief.caption ?? null,
      createdAt,
    });
    await updateArticleVisualBriefStatus({
      briefId: coverBrief.id,
      userId: input.userId,
      status: "generated",
      generatedAssetFileId: coverAssetFileId,
    });
  }

  return {
    changed: true,
    provider: generated.providerName,
    model: generated.model,
  };
}

export async function runLanguageGuardAuditWithRetries(input: {
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
}) {
  let article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      hitCount: 0,
      error: "article_missing",
      fixedMarkdown: "",
      remainingHits: [] as Array<{
        patternText: string;
        matchedText: string;
        rewriteHint: string | null;
        ruleKind: string;
      }>,
      aiNoiseScore: 0,
    };
  }

  const rules = await getLanguageGuardRules(input.userId);
  const cleanedMarkdown = stripReaderInvisibleAutomationBlocks(article.markdown_content || "");
  if (cleanedMarkdown && cleanedMarkdown !== (article.markdown_content || "")) {
    await saveArticleDraft({
      articleId: article.id,
      userId: input.userId,
      body: {
        title: article.title,
        markdownContent: cleanedMarkdown,
        status: article.status,
        seriesId: article.series_id,
        wechatTemplateId: article.wechat_template_id,
      },
    });
    article = await getArticleById(input.articleId, input.userId);
    if (!article) {
      return {
        changed: true,
        provider: null as string | null,
        model: null as string | null,
        hitCount: 0,
        error: null as string | null,
        fixedMarkdown: cleanedMarkdown,
        remainingHits: [],
        aiNoiseScore: 0,
      };
    }
  }
  const initialOpeningSync = await syncArticleOpeningFromDeepWritingArtifact({
    articleId: article.id,
    userId: input.userId,
  }).catch(() => ({ changed: false, markdown: article?.markdown_content || "" }));
  if (initialOpeningSync.changed) {
    article = await getArticleById(input.articleId, input.userId);
    if (!article) {
      return {
        changed: true,
        provider: null as string | null,
        model: null as string | null,
        hitCount: 0,
        error: null as string | null,
        fixedMarkdown: initialOpeningSync.markdown,
        remainingHits: [],
        aiNoiseScore: 0,
      };
    }
  }
  let hits = collectLanguageGuardHits(article.markdown_content || "", rules);
  let aiNoise = analyzeAiNoise(article.markdown_content || "");
  const needsAiNoiseRepair =
    aiNoise.score >= 70
    || aiNoise.outlineRigidityRisk !== "low"
    || aiNoise.preannounceRisk !== "low"
    || aiNoise.summaryEndingRisk !== "low"
    || aiNoise.didacticToneRisk !== "low";
  if (hits.length === 0 && !needsAiNoiseRepair) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: "prosePolish",
      payloadPatch: {
        languageGuardHits: [],
        aiNoise,
      },
    }).catch(() => undefined);
    return {
      changed: initialOpeningSync.changed,
      provider: null as string | null,
      model: null as string | null,
      hitCount: 0,
      error: null as string | null,
      fixedMarkdown: article.markdown_content || "",
      remainingHits: [],
      aiNoiseScore: aiNoise.score,
    };
  }

  let changed = false;
  let provider: string | null = null;
  let model: string | null = null;
  let errorMessage: string | null = null;
  let latestMarkdown = article.markdown_content || "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const promptMeta = await loadPromptWithMeta("language_guard_audit", input.promptContext);
    try {
      const result = await generateSceneText({
        sceneCode: "languageGuardAudit",
        systemPrompt: promptMeta.content,
        userPrompt: [
          "请输出净化后的最终 Markdown 正文，不要解释。",
          `标题：${article.title}`,
          hits.length > 0
            ? `命中的语言守卫规则：${hits.slice(0, 12).map((item) => `${item.patternText}=>${item.rewriteHint || "改成更具体表达"}`).join("；")}`
            : "命中的语言守卫规则：当前未命中显性词规则，但正文仍有明显模板感和工整推进。",
          `AI 噪声观察：得分 ${aiNoise.score}；段落工整风险 ${aiNoise.outlineRigidityRisk}；预告腔 ${aiNoise.preannounceRisk}；总结腔 ${aiNoise.summaryEndingRisk}。`,
          "审校要求：优先修复命中规则，同时打散施工图式推进，删除抽象空话和总结腔；允许短句、断句和一句话成段；不新增事实，不改核心判断。",
          "段落要求：不要把每句话都拆成独立段落；相邻的现场、解释和判断可以合并成 2-4 句自然段。正文要像作者复盘，不像施工图或逐条讲义。",
          "反说教要求：减少“先/再/最后/应该/必须/要/不要/真正该/这里要看清”这类指挥读者的句式；把它们改成复盘现场、读者代价、判断句或边界句。",
          "情绪与共情要求：至少让读者看到一次会场压力、角色尴尬或解释不动的时刻，不要只保留正确判断。",
          "案例要求：把“很多团队/某次复盘”改成更具体的 mini case，写清谁说了什么、在看哪张表、最后卡在哪里。",
          "开头要求：保留已选高钩子开头的冲突密度，不要把开头改成连续铺垫句。",
          "当前正文：",
          article.markdown_content || "",
        ].join("\n"),
        temperature: 0.2,
        rolloutUserId: input.userId,
        maxAttempts: 1,
        requestTimeoutMs: PUBLISH_REPAIR_AI_TIMEOUT_MS,
      });
      const nextMarkdown = collapseNearDuplicateIntroParagraphs(result.text.trim());
      provider = result.provider;
      model = result.model;
      if (nextMarkdown && nextMarkdown !== article.markdown_content) {
        latestMarkdown = nextMarkdown;
        await saveArticleDraft({
          articleId: article.id,
          userId: input.userId,
          body: {
            title: article.title,
            markdownContent: nextMarkdown,
            status: article.status,
            seriesId: article.series_id,
            wechatTemplateId: article.wechat_template_id,
          },
        });
        changed = true;
      }
      article = await getArticleById(input.articleId, input.userId);
      if (!article) {
        break;
      }
      latestMarkdown = article.markdown_content || latestMarkdown;
      hits = collectLanguageGuardHits(article.markdown_content || "", rules);
      aiNoise = analyzeAiNoise(article.markdown_content || "");
      await updateArticleStageArtifactPayload({
        articleId: article.id,
        userId: input.userId,
        stageCode: "prosePolish",
        payloadPatch: {
          languageGuardHits: hits.map((item) => ({
            patternText: item.patternText,
            matchedText: item.matchedText,
            rewriteHint: item.rewriteHint,
            ruleKind: item.ruleKind,
          })),
          aiNoise,
        },
      }).catch(() => undefined);
      if (
        hits.length === 0
        && aiNoise.score < 70
        && aiNoise.outlineRigidityRisk === "low"
        && aiNoise.didacticToneRisk === "low"
        && aiNoise.summaryEndingRisk === "low"
      ) {
        break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "language_guard_repair_failed";
      break;
    }
  }

  if (article) {
    const openingSync = await syncArticleOpeningFromDeepWritingArtifact({
      articleId: article.id,
      userId: input.userId,
    }).catch(() => ({ changed: false, markdown: latestMarkdown }));
    if (openingSync.changed) {
      latestMarkdown = openingSync.markdown;
      article = await getArticleById(input.articleId, input.userId);
      aiNoise = analyzeAiNoise(latestMarkdown);
      hits = collectLanguageGuardHits(latestMarkdown, rules);
      changed = true;
    }
    await updateArticleStageArtifactPayload({
      articleId: input.articleId,
      userId: input.userId,
      stageCode: "prosePolish",
      payloadPatch: {
        languageGuardHits: hits.map((item) => ({
          patternText: item.patternText,
          matchedText: item.matchedText,
          rewriteHint: item.rewriteHint,
          ruleKind: item.ruleKind,
        })),
        aiNoise,
      },
    }).catch(() => undefined);
  }

  return {
    changed,
    provider,
    model,
    hitCount: hits.length,
    fixedMarkdown: latestMarkdown,
    error: errorMessage,
    remainingHits: hits.map((item) => ({
      patternText: item.patternText,
      matchedText: item.matchedText,
      rewriteHint: item.rewriteHint,
      ruleKind: item.ruleKind,
    })),
    aiNoiseScore: aiNoise.score,
  };
}

async function runViralScoreRepair(input: {
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
}) {
  let article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return {
      changed: false,
      error: "article_missing",
      viralScore: null as ReturnType<typeof evaluateArticleViralScore> | null,
      finalBodyContract: null as ReturnType<typeof evaluateFinalBodyViralContract> | null,
      provider: null as string | null,
      model: null as string | null,
    };
  }

  const [deepWritingArtifact, researchArtifact] = await Promise.all([
    getArticleStageArtifact(input.articleId, input.userId, "deepWriting"),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
  ]);
  const deepWritingPayload = getRecord(deepWritingArtifact?.payload);
  const deepWritingViralGenomePack = getRecord(deepWritingPayload?.viralGenomePack);
  const researchPayload = getRecord(researchArtifact?.payload);
  const repairPromptLines = buildViralScoreRepairPromptLines({
    title: article.title,
    markdownContent: article.markdown_content,
    deepWritingPayload,
    researchPayload,
  });
  const buildFinalBodyContract = (markdownContent: string) => evaluateFinalBodyViralContract({
    title: article?.title || "",
    markdownContent,
    authorPostureMode: getString(deepWritingViralGenomePack?.authorPostureMode),
    businessQuestions: getStringArray(researchPayload?.businessQuestions, 7),
    businessQuestionAnswers: getRecordArray(researchPayload?.businessQuestionAnswers).slice(0, 7).map((item) => ({
      question: getString(item.question),
      answer: getString(item.answer),
    })),
    firstScreenPromise: getString(deepWritingViralGenomePack?.firstScreenPromise),
    shareTrigger: getString(deepWritingViralGenomePack?.shareTrigger),
  });

  let viralScore = evaluateArticleViralScore({
    title: article.title,
    markdownContent: article.markdown_content || "",
    threshold: WECHAT_VIRAL_SCORE_THRESHOLD,
  });
  let finalBodyContract = buildFinalBodyContract(article.markdown_content || "");
  if (viralScore.passed && finalBodyContract.passed) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: "prosePolish",
      payloadPatch: { viralScore, finalBodyContract },
    }).catch(() => undefined);
    return {
      changed: false,
      error: null as string | null,
      viralScore,
      finalBodyContract,
      provider: null as string | null,
      model: null as string | null,
    };
  }

  let changed = false;
  let provider: string | null = null;
  let model: string | null = null;
  let errorMessage: string | null = null;

  for (let attempt = 0; attempt < 2 && (!viralScore.passed || !finalBodyContract.passed); attempt += 1) {
    const promptMeta = await loadPromptWithMeta("article_write", input.promptContext);
    try {
      const result = await generateSceneText({
        sceneCode: "articleWrite",
        systemPrompt: promptMeta.content,
        userPrompt: [
          "请直接输出优化后的完整 Markdown 正文，不要解释，不要 JSON。",
          `标题：${article.title}`,
          `当前爆款评分：${viralScore.score}/100，发布线 ${WECHAT_VIRAL_SCORE_THRESHOLD}/100。`,
          `主要短板：${viralScore.blockers.join("；") || viralScore.summary}`,
          `终稿兑现契约：${finalBodyContract.passed ? "已通过" : `未通过；${finalBodyContract.blockers.join("；")}`}`,
          `目标：把这篇公众号文章优化到 ${WECHAT_VIRAL_SCORE_THRESHOLD} 分以上，但不得新增无法支撑的命名案例、真实客户、精确金额或精确转化数据。`,
          ...repairPromptLines,
          "当前正文：",
          article.markdown_content || "",
        ].join("\n"),
        temperature: 0.35,
        rolloutUserId: input.userId,
        maxAttempts: 1,
        requestTimeoutMs: PUBLISH_REPAIR_AI_TIMEOUT_MS,
      });
      provider = result.provider;
      model = result.model;
      const nextMarkdown = collapseNearDuplicateIntroParagraphs(stripReaderInvisibleAutomationBlocks(result.text.trim()));
      const nextScore = evaluateArticleViralScore({
        title: article.title,
        markdownContent: nextMarkdown,
        threshold: WECHAT_VIRAL_SCORE_THRESHOLD,
      });
      const nextContract = buildFinalBodyContract(nextMarkdown);
      const scoreImproved = nextScore.score > viralScore.score;
      const contractImproved = nextContract.passed || nextContract.blockers.length < finalBodyContract.blockers.length;
      if (nextMarkdown && nextMarkdown !== article.markdown_content && (scoreImproved || contractImproved)) {
        await saveArticleDraft({
          articleId: article.id,
          userId: input.userId,
          body: {
            title: article.title,
            markdownContent: nextMarkdown,
            status: article.status,
            seriesId: article.series_id,
            wechatTemplateId: article.wechat_template_id,
          },
        });
        changed = true;
        article = await getArticleById(input.articleId, input.userId);
        if (!article) break;
        viralScore = evaluateArticleViralScore({
          title: article.title,
          markdownContent: article.markdown_content || nextMarkdown,
          threshold: WECHAT_VIRAL_SCORE_THRESHOLD,
        });
        finalBodyContract = buildFinalBodyContract(article.markdown_content || nextMarkdown);
        await updateArticleStageArtifactPayload({
          articleId: input.articleId,
          userId: input.userId,
          stageCode: "prosePolish",
          payloadPatch: { viralScore, finalBodyContract },
        }).catch(() => undefined);
      } else {
        break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "viral_score_repair_failed";
      break;
    }
  }

  return {
    changed,
    error: errorMessage,
    viralScore,
    finalBodyContract,
    provider,
    model,
  };
}

export async function runPublishAutoRepair(input: {
  runId: number;
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
  publishGuard?: PublishAutoRepairGuardSnapshot;
  skipLanguageGuardRepair?: boolean;
}) {
  await ensureExtendedProductSchema();
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在，无法执行自动修复。");
  }

  const appliedFixes: string[] = [];
  const errors: string[] = [];

  if (hasGuardIssue(input.publishGuard, ["strategyCard", "fourPointAudit", "humanSignals"], ["audienceAnalysis"])) {
    try {
      const strategy = await ensureStrategyCardPreparedForWriting({
        articleId: input.articleId,
        userId: input.userId,
        title: article.title,
        markdownContent: article.markdown_content || "",
        promptContext: input.promptContext,
      });
      if (strategy.changed) {
        appliedFixes.push("strategyCard");
      }
    } catch (error) {
      errors.push(`strategyCard:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasGuardIssue(input.publishGuard, ["evidencePackage", "wechatEvidenceFloor", "hookCoverage", "researchHollowRisk"], ["evidence", "factCheck", "researchBrief", "outlinePlanning"])) {
    try {
      const evidence = await ensureEvidencePackagePreparedForPublish({
        articleId: input.articleId,
        userId: input.userId,
      });
      if (evidence.changed) {
        appliedFixes.push("evidencePackage");
      }
    } catch (error) {
      errors.push(`evidencePackage:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (
    !input.skipLanguageGuardRepair
    && hasGuardIssue(input.publishGuard, ["language_guard", "ai_noise", "wechatProseFloor", "writingQualityFocus"], ["prosePolish"])
  ) {
    try {
      const languageGuard = await runLanguageGuardAuditWithRetries({
        articleId: input.articleId,
        userId: input.userId,
        promptContext: input.promptContext,
      });
      if (languageGuard.changed) {
        appliedFixes.push("languageGuard");
      }
      if (languageGuard.error) {
        errors.push(`languageGuard:${languageGuard.error}`);
      }
    } catch (error) {
      errors.push(`languageGuard:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasGuardIssue(input.publishGuard, ["viralScore90", "finalBodyContract"], ["deepWriting", "prosePolish"])) {
    try {
      const viralRepair = await runViralScoreRepair({
        articleId: input.articleId,
        userId: input.userId,
        promptContext: input.promptContext,
      });
      if (viralRepair.changed) {
        appliedFixes.push("viralScore90");
      }
      if (viralRepair.error) {
        errors.push(`viralScore90:${viralRepair.error}`);
      }
    } catch (error) {
      errors.push(`viralScore90:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasGuardIssue(input.publishGuard, ["wechatOpeningFloor", "opening_strength"], ["outlinePlanning"])) {
    try {
      const openingRepair = await runOpeningHookRepair({
        articleId: input.articleId,
        userId: input.userId,
      });
      if (openingRepair.changed) {
        appliedFixes.push("openingHook");
      }
      if (openingRepair.error) {
        errors.push(`openingHook:${openingRepair.error}`);
      }
    } catch (error) {
      errors.push(`openingHook:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasGuardIssue(input.publishGuard, ["coverImage", "articleVisualQuality"], ["coverImage", "inlineImageGenerate"])) {
    try {
      const cover = await ensureCoverImagePreparedForPublish({
        articleId: input.articleId,
        userId: input.userId,
        title: article.title,
      });
      if (cover.changed) {
        appliedFixes.push("coverImage");
      }
    } catch (error) {
      errors.push(`coverImage:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    appliedFixes,
    errors,
  };
}
