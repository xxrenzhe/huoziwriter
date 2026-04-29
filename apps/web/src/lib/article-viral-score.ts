import { analyzeAiNoise } from "./ai-noise-scan";
import { detectArticleViralMode, type ArticleViralMode } from "./article-viral-modes";

export const WECHAT_VIRAL_SCORE_THRESHOLD = 92;

export type ArticleViralScoreDimension = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
};

export type ArticleViralScoreResult = {
  version: "viral-score-v2";
  threshold: number;
  score: number;
  passed: boolean;
  summary: string;
  blockers: string[];
  suggestions: string[];
  dimensions: ArticleViralScoreDimension[];
};

const ROLE_MARKERS = ["老板", "销售", "投放", "运营", "客户", "用户", "团队", "负责人", "创始人"];
const EMOTION_MARKERS = ["难受", "发冷", "着急", "焦虑", "慌", "刺眼", "脸色", "火大", "卡住", "顶不住", "委屈", "心里一沉"];
const COST_MARKERS = ["预算", "花费", "亏", "回收", "线索", "成交", "转化", "消耗", "表单", "钱", "询盘", "客单"];
const CASE_ARTIFACT_MARKERS = ["搜索词报告", "线索表", "质量得分", "Quality Score", "落地页", "广告组", "表单", "销售跟进", "关键词列表", "后台"];
const ACTION_MARKERS = ["查", "拉", "看", "问", "复盘", "拆", "标", "停", "缩", "加价", "圈出来", "分层", "对照", "判断", "跟进"];
const DIDACTIC_MARKERS = ["应该", "必须", "需要", "第一步", "第二步", "第三步", "建议先", "不要先", "真正该", "更合理的做法"];
const POWER_ENTITY_MARKERS = ["Anthropic", "OpenAI", "微软", "Google", "谷歌", "Meta", "英伟达", "NVIDIA", "亚马逊", "Amazon", "奥特曼", "CFO", "CEO", "董事会", "WSJ", "华尔街日报"];
const POWER_CAPITAL_MARKERS = ["营收", "ARR", "估值", "融资", "IPO", "现金流", "利润", "算力", "合同", "成本", "周活", "收入", "亿美元", "万亿美元", "股价", "投资者"];
const POWER_SHIFT_MARKERS = ["刚刚", "正式", "易主", "换了", "反超", "超越", "碾压", "霸主", "逆袭", "内讧", "路线分歧", "后院起火", "权力游戏", "叛将", "下半场", "王座", "变天", "赢家", "输家", "倾斜"];
const POWER_CONFLICT_MARKERS = ["超越", "反超", "碾压", "错过", "分歧", "内讧", "后院起火", "担忧", "质疑", "失和", "掉队", "抄袭", "转向B2B", "疯狂", "警告", "裂痕", "冰山", "账单", "拖进", "伤口", "倾斜"];

function clamp(value: number, maxScore: number) {
  return Math.max(0, Math.min(maxScore, Math.round(value)));
}

function stripInlineMarkdown(text: string) {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitBlocks(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function getReaderBlocks(markdown: string) {
  return splitBlocks(markdown)
    .filter((block) => !/^#\s+/.test(block))
    .filter((block) => !/^<!--/.test(block))
    .filter((block) => !/^!\[/.test(block))
    .filter((block) => !/^```/.test(block));
}

function getReaderParagraphs(markdown: string) {
  return getReaderBlocks(markdown)
    .filter((block) => !/^#{2,6}\s/.test(block))
    .filter((block) => !/^\s*([-*]|\d+\.)\s+/.test(block))
    .map(stripInlineMarkdown)
    .filter(Boolean);
}

function getFirstParagraph(markdown: string) {
  return getReaderParagraphs(markdown)[0] || "";
}

function countMatches(text: string, regex: RegExp) {
  return (String(text || "").match(regex) || []).length;
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.reduce((sum, keyword) => sum + countMatches(text, new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")), 0);
}

function countUniqueKeywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function hasContrast(text: string) {
  return /(不是|而是|真正|却|反而|看起来|实际上|表面|背后|误判|错位|代价|最怕|最贵|最难受)/.test(text);
}

function hasReaderIdentity(text: string) {
  return /(老板|销售|投放|账户|团队|读者|客户|线索|预算|后台|复盘|广告主|运营|负责人)/.test(text);
}

function hasConcreteAction(text: string) {
  return /(查|拉|看|问|复盘|拆|标|停|缩|加价|跟进|回到|摆上桌|分层|对照|检查|判断)/.test(text);
}

function getParagraphsWithSharedRoleAndCost(markdown: string) {
  return getReaderParagraphs(markdown).filter((paragraph) => {
    const roleCount = countUniqueKeywordHits(paragraph, ROLE_MARKERS);
    const costCount = countUniqueKeywordHits(paragraph, COST_MARKERS);
    return roleCount >= 2 && costCount >= 2;
  }).length;
}

function getConcreteCaseAnchorCount(markdown: string) {
  const plain = stripInlineMarkdown(markdown);
  const numericAnchors = countMatches(plain, /\b\d+\b/g) + countMatches(plain, /\d+\s*(天|周|月|个|条|轮|次|%)/g);
  const artifactAnchors = countUniqueKeywordHits(plain, CASE_ARTIFACT_MARKERS);
  const dialogueAnchors = countMatches(plain, /“[^”]{4,40}”/g) + countMatches(plain, /(老板问的是|销售说的是|投放问的是|复盘会里|桌上摊着)/g);
  const actionAnchors = countUniqueKeywordHits(plain, ACTION_MARKERS);
  return numericAnchors + artifactAnchors + dialogueAnchors + actionAnchors;
}

function evaluateTitle(title: string, mode: ArticleViralMode) {
  const normalizedTitle = stripInlineMarkdown(title);
  let score = 0;
  if (normalizedTitle.length >= 12 && normalizedTitle.length <= 34) score += 4;
  else if (normalizedTitle.length >= 8 && normalizedTitle.length <= 42) score += 3;
  if (hasContrast(normalizedTitle)) score += 2;
  if (mode === "power_shift_breaking") {
    if (countUniqueKeywordHits(normalizedTitle, POWER_ENTITY_MARKERS) >= 2) score += 3;
    else if (countUniqueKeywordHits(normalizedTitle, POWER_ENTITY_MARKERS) >= 1) score += 2;
    if (countUniqueKeywordHits(normalizedTitle, POWER_SHIFT_MARKERS) >= 1) score += 2;
    if (/\d/.test(normalizedTitle)) score += 1;
  } else {
    if (hasReaderIdentity(normalizedTitle) || /(Google|搜索广告|关键词|质量得分|搜索意图)/i.test(normalizedTitle)) score += 2;
    if (/(最|为什么|别|真正|不是|看起来|踩坑|复盘|自查|亏|费预算)/.test(normalizedTitle)) score += 2;
  }
  return {
    key: "title",
    label: "标题点击欲",
    score: clamp(score, 10),
    maxScore: 10,
    detail: score >= 8 ? "标题具备对象、反差和传播承诺。" : "标题还缺更明确的对象、胜负变化或读者后果。",
  };
}

function evaluateOpening(markdown: string, mode: ArticleViralMode) {
  const opening = getFirstParagraph(markdown);
  let score = 0;
  if (opening.length >= 80 && opening.length <= 220) score += 2;
  else if (opening.length >= 55 && opening.length <= 280) score += 1;
  if (hasContrast(opening)) score += 2;
  if (mode === "power_shift_breaking") {
    if (countUniqueKeywordHits(opening, POWER_ENTITY_MARKERS) >= 2) score += 3;
    else if (countUniqueKeywordHits(opening, POWER_ENTITY_MARKERS) >= 1) score += 1;
    if (countUniqueKeywordHits(opening, POWER_CAPITAL_MARKERS) >= 2 || /\d+\s*(亿|万亿|倍|个月|年)/.test(opening)) score += 3;
    if (countUniqueKeywordHits(opening, POWER_SHIFT_MARKERS) >= 1) score += 2;
    if (/(今天|刚刚|正式|历史性|最新|独家)/.test(opening)) score += 1;
    if (countUniqueKeywordHits(opening, EMOTION_MARKERS) >= 1 || /(倒吸凉气|恐慌|炸碎|深水炸弹)/.test(opening)) score += 1;
  } else {
    if (hasReaderIdentity(opening)) score += 2;
    if (hasConcreteAction(opening)) score += 2;
    if (countUniqueKeywordHits(opening, COST_MARKERS) >= 2) score += 2;
    if (countUniqueKeywordHits(opening, EMOTION_MARKERS) >= 1) score += 1;
    if (/[？?]|到底|为什么|怎么/.test(opening)) score += 1;
    if (countUniqueKeywordHits(opening, ROLE_MARKERS) >= 2) score += 2;
  }
  return {
    key: "opening",
    label: "第一屏钩子",
    score: clamp(score, 12),
    maxScore: 12,
    detail: score >= 9 ? "开头已经把变化、胜负或具体冲突硬抛出来了。" : "开头还不够快地把读者拖进变化或冲突中心。",
  };
}

function evaluateStructure(markdown: string, mode: ArticleViralMode) {
  const headingCount = countMatches(markdown, /^##\s+/gm);
  const readerBlocks = getReaderBlocks(markdown);
  const imageCount = countMatches(markdown, /!\[[^\]]*]\([^)]+\)/g);
  const listCount = countMatches(markdown, /^\s*([-*]|\d+\.)\s+/gm);
  let score = 0;
  if (mode === "power_shift_breaking") {
    if (headingCount >= 4 && headingCount <= 8) score += 6;
    else if (headingCount >= 3) score += 4;
    if (readerBlocks.length >= 10 && readerBlocks.length <= 36) score += 2;
    else if (readerBlocks.length >= 8) score += 1;
    if (imageCount >= 1) score += 1;
    if (/(## .+\n\n.+\n\n## )/m.test(markdown)) score += 1;
  } else {
    if (headingCount >= 3 && headingCount <= 6) score += 5;
    else if (headingCount >= 2) score += 3;
    if (readerBlocks.length >= 12 && readerBlocks.length <= 32) score += 2;
    else if (readerBlocks.length >= 9) score += 1;
    if (listCount >= 2) score += 2;
    else if (listCount >= 1) score += 1;
    if (imageCount >= 2) score += 1;
  }
  return {
    key: "structure",
    label: "滑屏结构",
    score: clamp(score, 10),
    maxScore: 10,
    detail: score >= 8 ? "结构有滑屏抓手，但没有用结构冒充内容。" : "结构停顿还不够，或者内容块密度分布不理想。",
  };
}

function evaluateConflict(markdown: string, mode: ArticleViralMode) {
  const plain = stripInlineMarkdown(markdown);
  const openingBlocks = getReaderParagraphs(markdown).slice(0, 5).join("\n");
  let score = 0;
  if (mode === "power_shift_breaking") {
    if (countUniqueKeywordHits(plain, POWER_ENTITY_MARKERS) >= 3) score += 4;
    else if (countUniqueKeywordHits(plain, POWER_ENTITY_MARKERS) >= 2) score += 2;
    if (hasContrast(plain)) score += 3;
    if (countUniqueKeywordHits(plain, POWER_CAPITAL_MARKERS) >= 3) score += 2;
    if (countUniqueKeywordHits(plain, POWER_CONFLICT_MARKERS) >= 3) score += 3;
    if (countUniqueKeywordHits(openingBlocks, POWER_ENTITY_MARKERS) >= 2 && (/\d+\s*(亿|万亿|倍|个月|年)/.test(openingBlocks) || countUniqueKeywordHits(openingBlocks, POWER_CAPITAL_MARKERS) >= 2)) score += 2;
  } else {
    if (countUniqueKeywordHits(plain, ROLE_MARKERS) >= 3) score += 4;
    else if (countUniqueKeywordHits(plain, ROLE_MARKERS) >= 2) score += 2;
    if (hasContrast(plain)) score += 3;
    if (countUniqueKeywordHits(plain, COST_MARKERS) >= 3) score += 2;
    if (countMatches(plain, /(问的是|说的是|盯着|摊出来|解释不通|对不上|绕圈|卡住|却没有|但没有)/g) >= 2) score += 3;
    if (countUniqueKeywordHits(openingBlocks, ROLE_MARKERS) >= 2 && countUniqueKeywordHits(openingBlocks, COST_MARKERS) >= 2) score += 2;
  }
  return {
    key: "conflict",
    label: "冲突张力",
    score: clamp(score, 14),
    maxScore: 14,
    detail: score >= 10 ? "冲突不是口号，而是胜负、角色或权力裂痕真的撞上了。" : "冲突还不够硬，像在讲观点，不像在拆一场真实对撞。",
  };
}

function evaluateEmpathy(markdown: string, aiNoise: ReturnType<typeof analyzeAiNoise>, mode: ArticleViralMode) {
  const plain = stripInlineMarkdown(markdown);
  let score = 0;
  if (mode === "power_shift_breaking") {
    const powerEmotionHits = countUniqueKeywordHits(plain, ["倒吸一口凉气", "倒吸凉气", "恐慌", "担忧", "噩梦", "跳水", "冰山", "裂痕", "伤口", "倾斜", "变天"]);
    if (powerEmotionHits >= 3) score += 4;
    else if (powerEmotionHits >= 1) score += 3;
    if (countUniqueKeywordHits(plain, POWER_CAPITAL_MARKERS) >= 4) score += 3;
    else if (countUniqueKeywordHits(plain, POWER_CAPITAL_MARKERS) >= 2) score += 2;
    if (/(倒吸一口凉气|倒吸凉气|恐慌|焦虑|担忧|着火|噩梦|苍白|跳水|紧张|冰山|裂痕|伤口)/.test(plain)) score += 2;
    if (/(这不是一条普通财报快讯|今天全摆在台面上|这意味着|真正让.*难以追赶|市场在用真金白银投票|权力的天平已经倾斜|为什么今天变天了)/.test(plain)) score += 3;
  } else {
    if (countUniqueKeywordHits(plain, EMOTION_MARKERS) >= 2) score += 4;
    else if (countUniqueKeywordHits(plain, EMOTION_MARKERS) >= 1) score += 2;
    if (countUniqueKeywordHits(plain, COST_MARKERS) >= 3) score += 3;
    else if (countUniqueKeywordHits(plain, COST_MARKERS) >= 2) score += 2;
    if (/(我更怕的是|我会先|我最怕|我见过|我更担心|很多人都吃过这个亏)/.test(plain)) score += 2;
    if (aiNoise.readerClosenessCueCount >= 20) score += 2;
    else if (aiNoise.readerClosenessCueCount >= 12) score += 1;
  }
  if (aiNoise.didacticToneRisk === "medium") score -= 2;
  if (aiNoise.didacticToneRisk === "high") score -= 4;
  return {
    key: "empathy",
    label: "情绪与共情",
    score: clamp(score, 12),
    maxScore: 12,
    detail: score >= 8 ? "读者能感觉到压力、胜负和后果在逼近。" : "文章还在报事实，没把紧张感、损失感或权力变化的压迫感写出来。",
  };
}

function evaluateCaseEvidence(markdown: string, mode: ArticleViralMode) {
  const plain = stripInlineMarkdown(markdown);
  let score = 0;
  if (mode === "power_shift_breaking") {
    if (countUniqueKeywordHits(plain, POWER_ENTITY_MARKERS) >= 3) score += 4;
    else if (countUniqueKeywordHits(plain, POWER_ENTITY_MARKERS) >= 2) score += 2;
    if (countUniqueKeywordHits(plain, POWER_CAPITAL_MARKERS) >= 4) score += 4;
    else if (countUniqueKeywordHits(plain, POWER_CAPITAL_MARKERS) >= 2) score += 2;
    if (countMatches(plain, /\d+\s*(亿|万亿|倍|个月|年|%)/g) >= 4) score += 4;
    else if (countMatches(plain, /\d+\s*(亿|万亿|倍|个月|年|%)/g) >= 2) score += 2;
    if (/(WSJ|华尔街日报|The Information|SaaStr|The Atlantic|财务文件|外媒披露|媒体报道)/.test(plain)) score += 2;
    if (countUniqueKeywordHits(plain, POWER_CONFLICT_MARKERS) >= 3) score += 2;
  } else {
    if (getParagraphsWithSharedRoleAndCost(markdown) >= 1) score += 4;
    if (countUniqueKeywordHits(plain, CASE_ARTIFACT_MARKERS) >= 3) score += 4;
    else if (countUniqueKeywordHits(plain, CASE_ARTIFACT_MARKERS) >= 2) score += 2;
    if (countMatches(plain, /\d+\s*(天|周|月|个|条|轮|次|%)/g) >= 2) score += 3;
    else if (countMatches(plain, /\d+\s*(天|周|月|个|条|轮|次|%)/g) >= 1) score += 1;
    if (countMatches(plain, /“[^”]{4,40}”/g) >= 1 || /(老板问的是|销售说的是|投放问的是|复盘会里|桌上摊着)/.test(plain)) score += 3;
    if (countUniqueKeywordHits(plain, ACTION_MARKERS) >= 4) score += 2;
    if (countKeywordHits(plain, ["判断", "变量", "本质", "逻辑", "阶段"]) >= 10 && getConcreteCaseAnchorCount(markdown) < 8) score -= 4;
  }
  return {
    key: "caseEvidence",
    label: "案例具体度",
    score: clamp(score, 16),
    maxScore: 16,
    detail: score >= 11 ? "证据已经够硬，读者能看见数字、对象、对撞和后果。" : "证据还是偏糊，缺硬数字、对象、对比或关键来源。",
  };
}

function evaluateShareability(markdown: string, mode: ArticleViralMode) {
  const plain = stripInlineMarkdown(markdown);
  let score = 0;
  if (mode === "power_shift_breaking") {
    if (countUniqueKeywordHits(plain, POWER_ENTITY_MARKERS) >= 2 && countMatches(plain, /\d+\s*(亿|万亿|倍|个月|年|%)/g) >= 3) score += 4;
    if (/(这意味着|总有一天|下半场|权力的天平|市场在用真金白银投票|真正值得玩味|终结了)/.test(plain)) score += 2;
    if (/(转发|群里|投资者|团队|老板)/.test(plain)) score += 2;
  } else {
    if (countMatches(markdown, /^\s*([-*]|\d+\.)\s+/gm) >= 2) score += 3;
    if (/(检查表|复盘表|判断标准|三列|三步|自查|收藏|照着|回后台)/.test(plain)) score += 3;
    if (/(别再|先问|真正该|一句话|说到底|最先该|轮得到)/.test(plain)) score += 1;
    if (/(转发|同事|老板|销售|团队|投放)/.test(plain)) score += 1;
  }
  return {
    key: "shareability",
    label: "收藏转发价值",
    score: clamp(score, 8),
    maxScore: 8,
    detail: score >= 6 ? "文章已经压出了可复述、可转发的强判断。" : "观点有了，但还没压成一句值得转发的强判断。",
  };
}

function evaluateRhythm(markdown: string, mode: ArticleViralMode) {
  const paragraphs = getReaderParagraphs(markdown);
  const lengths = paragraphs.map((paragraph) => paragraph.length);
  const avgLength = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
  const longCount = lengths.filter((length) => length > 220).length;
  const repeatedNotBut = countMatches(markdown, /不是|而是/g);
  let score = 0;
  if (mode === "power_shift_breaking") {
    const shortPunchCount = lengths.filter((length) => length >= 28 && length <= 95).length;
    const variance = lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0;
    if (avgLength >= 55 && avgLength <= 165) score += 3;
    else if (avgLength <= 190) score += 2;
    if (longCount <= 2) score += 2;
    else if (longCount <= 3) score += 1;
    if (paragraphs.length >= 6 && paragraphs.length <= 16) score += 1;
    if (shortPunchCount >= 2) score += 1;
    if (variance >= 90) score += 1;
    if (repeatedNotBut <= 10) score += 1;
  } else {
    if (avgLength >= 45 && avgLength <= 150) score += 3;
    else if (avgLength <= 185) score += 2;
    if (longCount <= 1) score += 2;
    else if (longCount <= 3) score += 1;
    if (paragraphs.length >= 10 && paragraphs.length <= 26) score += 2;
    else if (paragraphs.length >= 8) score += 1;
    if (repeatedNotBut <= 8) score += 1;
  }
  return {
    key: "rhythm",
    label: "阅读节奏",
    score: clamp(score, 8),
    maxScore: 8,
    detail: score >= 6 ? "段落呼吸和句式重复基本可控。" : "段落还是偏匀、偏长，容易越读越平。",
  };
}

function evaluateVisualPlacement(markdown: string) {
  const blocks = splitBlocks(markdown);
  const imageIndexes = blocks
    .map((block, index) => (/^!\[/.test(block) || /huozi-visual:/.test(block) ? index : -1))
    .filter((index) => index >= 0);
  let score = 0;
  if (imageIndexes.length >= 3) score += 2;
  else if (imageIndexes.length >= 1) score += 1;
  const hasMiddleImage = imageIndexes.some((index) => index > 3 && index < blocks.length - 4);
  if (hasMiddleImage) score += 2;
  return {
    key: "visualPlacement",
    label: "视觉辅助",
    score: clamp(score, 4),
    maxScore: 4,
    detail: score >= 3 ? "图片在关键段落附近起到了停顿和解释作用。" : "图片数量或位置还不够帮正文出力。",
  };
}

function evaluateLanguage(markdown: string, aiNoise: ReturnType<typeof analyzeAiNoise>) {
  const plain = stripInlineMarkdown(markdown);
  let score = 6;
  if (/(因此可以看出|具有重要意义|提供了新的视角|在此过程中)/.test(plain)) score -= 2;
  if (/(本文将|综上所述|首先.+其次.+最后)/.test(plain)) score -= 1;
  if (aiNoise.didacticToneRisk === "medium") score -= 2;
  if (aiNoise.didacticToneRisk === "high") score -= 4;
  if (aiNoise.distantToneRisk === "medium") score -= 1;
  if (aiNoise.distantToneRisk === "high") score -= 3;
  if (aiNoise.summaryEndingRisk !== "low") score -= 1;
  if (aiNoise.preannounceRisk !== "low") score -= 1;
  if (countKeywordHits(plain, DIDACTIC_MARKERS) >= 6) score -= 1;
  return {
    key: "language",
    label: "去说教程度",
    score: clamp(score, 6),
    maxScore: 6,
    detail: score >= 4 ? "没有明显报告腔，方法感也被压住了。" : "语言还带着教读者做事的劲，容易把情绪和共情压平。",
  };
}

export function evaluateArticleViralScore(input: {
  title: string;
  markdownContent: string;
  threshold?: number;
}) {
  const threshold = Math.max(0, Math.min(100, Math.round(input.threshold ?? WECHAT_VIRAL_SCORE_THRESHOLD)));
  const aiNoise = analyzeAiNoise(input.markdownContent);
  const mode = detectArticleViralMode({
    title: input.title,
    markdownContent: input.markdownContent,
  });
  const dimensions = [
    evaluateTitle(input.title, mode),
    evaluateOpening(input.markdownContent, mode),
    evaluateStructure(input.markdownContent, mode),
    evaluateConflict(input.markdownContent, mode),
    evaluateEmpathy(input.markdownContent, aiNoise, mode),
    evaluateCaseEvidence(input.markdownContent, mode),
    evaluateShareability(input.markdownContent, mode),
    evaluateRhythm(input.markdownContent, mode),
    evaluateVisualPlacement(input.markdownContent),
    evaluateLanguage(input.markdownContent, aiNoise),
  ];
  const score = clamp(dimensions.reduce((sum, item) => sum + item.score, 0), 100);
  const weakDimensions = dimensions.filter((item) => item.score / item.maxScore < 0.78);
  const coreFloorFailures = [
    dimensions.find((item) => item.key === "opening" && item.score < 9),
    dimensions.find((item) => item.key === "conflict" && item.score < 10),
    dimensions.find((item) => item.key === "empathy" && item.score < 8),
    dimensions.find((item) => item.key === "caseEvidence" && item.score < 11),
    dimensions.find((item) => item.key === "language" && item.score < 4),
  ].filter(Boolean) as ArticleViralScoreDimension[];
  const aiToneBlockers = [
    aiNoise.didacticToneRisk === "high" ? "说教姿态过重" : null,
    aiNoise.distantToneRisk === "high" ? "读者距离感过重" : null,
  ].filter(Boolean) as string[];
  const passed = score >= threshold && coreFloorFailures.length === 0 && aiToneBlockers.length === 0;
  const blockers = passed
    ? []
    : [
        ...coreFloorFailures.map((item) => `${item.label} ${item.score}/${item.maxScore}：${item.detail}`),
        ...aiToneBlockers,
        ...weakDimensions
          .filter((item) => !coreFloorFailures.some((failure) => failure.key === item.key))
          .slice(0, 3)
          .map((item) => `${item.label} ${item.score}/${item.maxScore}：${item.detail}`),
      ].slice(0, 5);
  const suggestions = passed
    ? ["爆款评分已过线，发布前只需继续核对事实、配图和微信排版。"]
    : [
        ...coreFloorFailures.map((item) => item.detail),
        aiNoise.didacticToneRisk !== "low" ? "把“应该/必须/步骤”改成读者已经付出的代价、冲突和复盘现场。" : null,
        aiNoise.distantToneRisk !== "low" ? "把抽象词翻成后台、预算、线索表、销售跟进和会场对话。" : null,
        ...weakDimensions.slice(0, 3).map((item) => item.detail),
      ].filter(Boolean) as string[];

  return {
    version: "viral-score-v2",
    threshold,
    score,
    passed,
    summary: passed
      ? `爆款评分 ${score}/100，已达到更高的 ${threshold} 分发布线。`
      : `爆款评分 ${score}/100，低于更高的 ${threshold} 分发布线；当前主要问题是 ${blockers.slice(0, 3).join("；") || "情绪、冲突和案例不够硬"}。`,
    blockers,
    suggestions,
    dimensions,
  } satisfies ArticleViralScoreResult;
}
