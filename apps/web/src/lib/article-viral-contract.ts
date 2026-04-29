import { analyzeAiNoise } from "./ai-noise-scan";
import { detectArticleViralMode } from "./article-viral-modes";

export type FinalBodyViralContractDimension = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type FinalBodyViralContractResult = {
  version: "final-body-contract-v1";
  passed: boolean;
  summary: string;
  blockers: string[];
  suggestions: string[];
  dimensions: FinalBodyViralContractDimension[];
};

export type FinalBodyViralContractInput = {
  title?: string | null;
  markdownContent?: string | null;
  authorPostureMode?: string | null;
  businessQuestions?: Array<string | null | undefined> | null;
  businessQuestionAnswers?: Array<{ question?: string | null; answer?: string | null } | null | undefined> | null;
  firstScreenPromise?: string | null;
  shareTrigger?: string | null;
};

const OBJECT_PATTERNS = [
  /\d/,
  /AI|Agent|MCP|SaaS|GitHub|Cursor|Figma|Notion|Google Ads|Shopify|Stripe|Claude|OpenAI/i,
  /公司|产品|工具|模型|团队|老板|投手|用户|客户|创始人|平台|账号|后台|关键词|搜索词|订单|线索|预算|定价|留存|续费|收款|佣金|仓库|插件|工作流|副业|美金|美元|海外|出海|独立站|联盟营销/,
] as const;

const CHANGE_PATTERNS = [
  /变化|变了|正在变|重排|重写|提速|变慢|拖慢|卡住|失效|替代|吃掉|收购|下跌|上涨|翻倍|增长|下降|破千万|改版|开源|上线|接入|进生产|跑通|删掉|切换|涨了|跌了|慢下来|快起来|不出单|不赚钱|判断错|错位|跑偏/,
  /不是.+而是|看起来.+实际|以为.+真正|表面.+真正|原来.+现在/,
] as const;

const CONSEQUENCE_PATTERNS = [
  /代价|成本|机会|风险|窗口|护城河|误判|返工|亏钱|赚钱|降本|少赚|多花|错过|转化|成交|订单|下单|出单|线索|效率|发布|核查|续费|留存|佣金|收入|预算|责任|压力|淘汰|值得换|不值得换/,
] as const;

const ROLE_MARKERS = ["老板", "销售", "投放", "运营", "客户", "用户", "团队", "负责人", "创始人", "产品", "开发", "财务"];
const COST_MARKERS = ["预算", "花费", "亏", "回收", "线索", "成交", "转化", "消耗", "表单", "钱", "询盘", "客单", "收入", "成本", "佣金", "留存", "续费"];
const EMOTION_MARKERS = ["难受", "发冷", "着急", "焦虑", "慌", "刺眼", "脸色", "火大", "卡住", "顶不住", "委屈", "心里一沉", "别扭", "不舒服", "急"];
const ARTIFACT_MARKERS = ["搜索词报告", "线索表", "质量得分", "Quality Score", "落地页", "广告组", "表单", "销售跟进", "关键词列表", "后台", "仪表盘", "截图", "账本", "定价页", "GitHub", "仓库"];
const ACTION_MARKERS = ["查", "拉", "看", "问", "复盘", "拆", "标", "停", "缩", "加价", "圈出来", "分层", "对照", "判断", "跟进", "上手", "试了", "跑了一遍", "重做"];
const CONFLICT_MARKERS = ["不是", "而是", "却", "反而", "卡住", "解释不动", "对不上", "误判", "错位", "翻车", "没想到", "但没有"];
const RESULT_MARKERS = ["卡在", "卡住", "没下单", "没成交", "不赚钱", "亏", "烧掉", "解释不动", "对不上", "拖慢", "浪费", "错过", "回收不了", "白花", "压不住"];
const TOOL_MARKERS = ["工具", "平台", "后台", "GitHub", "Google Ads", "PPC", "SaaS", "Cursor", "Figma", "Notion", "OpenAI", "Claude", "Stripe", "Shopify", "Wise"];
const TEST_MARKERS = ["我试了", "我跑了一遍", "亲测", "实测", "上手", "对比了", "我会先", "我把", "我拿", "我自己", "我测了", "用了两周"];
const DIDACTIC_MARKERS = ["应该", "必须", "需要", "第一步", "第二步", "第三步", "建议先", "不要先", "真正该", "更合理的做法", "方法论"];
const POWER_ENTITY_MARKERS = ["Anthropic", "OpenAI", "微软", "Google", "谷歌", "Meta", "英伟达", "NVIDIA", "亚马逊", "Amazon", "奥特曼", "CFO", "CEO", "董事会", "WSJ", "华尔街日报"];
const POWER_CAPITAL_MARKERS = ["营收", "ARR", "估值", "融资", "IPO", "现金流", "利润", "算力", "合同", "成本", "周活", "收入", "亿美元", "万亿美元", "股价", "投资者"];
const POWER_CONFLICT_MARKERS = ["超越", "反超", "碾压", "内讧", "分歧", "后院起火", "权力游戏", "担忧", "质疑", "失和", "掉队", "抄袭", "警告", "路线分歧", "裂痕", "冰山", "账单", "倾斜", "赢家", "输家", "王座"];

type BusinessCategory = "money" | "why_now" | "audience" | "not_fit" | "evidence" | "share";

const BUSINESS_CATEGORY_RULES: Array<{ code: BusinessCategory; ask: RegExp; body: RegExp }> = [
  {
    code: "money",
    ask: /(钱从哪里来|谁在赚钱|谁在亏钱|降本|成本|预算|效率|佣金|收入|回本|roi|arr|mrr|留存|续费|线索|成交)/i,
    body: /(赚钱|亏钱|降本|成本|预算|效率|佣金|收入|回本|ROI|ARR|MRR|留存|续费|线索|成交|客单|花费|回收)/i,
  },
  {
    code: "why_now",
    ask: /(为什么.*现在|why now|为什么是现在|这次为什么|今年|窗口)/i,
    body: /(为什么是现在|这次|今年|现在|窗口|版本|改版|变化|今天|这一轮|最近|此刻)/i,
  },
  {
    code: "audience",
    ask: /(影响.*哪类人|哪一类人|谁会受影响|适合.*谁|谁该看)/i,
    body: /(适合|更适合|这类人|如果你是|老板|销售|投放|运营|开发者|创始人|团队|客户)/i,
  },
  {
    code: "not_fit",
    ask: /(谁不适合|哪些人不适合|不该做|别做|边界|反例|不适用)/i,
    body: /(不适合|别照搬|别急着|不该|边界|前提|反例|不是所有人|先别做)/i,
  },
  {
    code: "evidence",
    ask: /(最可信|案例|账本|证据|数字|原话|截图|平台|数据)/i,
    body: /(案例|账本|证据|数字|原话|截图|平台|数据|仪表盘|后台|表格|报告|GitHub|quoted|“|”)/i,
  },
  {
    code: "share",
    ask: /(转发|转给|会转给谁|替谁解释|谁应该看)/i,
    body: /(转给|发给|甩给|老板看|销售看|团队看|适合发给|拿给)/i,
  },
];

function clean(value: unknown) {
  return String(value || "").trim();
}

function stripInlineMarkdown(text: string) {
  return String(text || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitReaderParagraphs(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^#\s+/.test(block))
    .filter((block) => !/^<!--/.test(block))
    .filter((block) => !/^!\[/.test(block))
    .filter((block) => !/^```/.test(block))
    .filter((block) => !/^\s*([-*]|\d+\.)\s+/.test(block))
    .map(stripInlineMarkdown)
    .filter(Boolean);
}

function hasAnyPattern(text: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function countUniqueKeywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.reduce((sum, keyword) => sum + (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 0);
}

function detectBusinessCategories(input: FinalBodyViralContractInput) {
  const askText = [
    ...(input.businessQuestions ?? []).map((item) => clean(item)),
    ...((input.businessQuestionAnswers ?? []).map((item) => `${clean(item?.question)} ${clean(item?.answer)}`)),
  ].join("\n");
  const categories = BUSINESS_CATEGORY_RULES
    .filter((rule) => rule.ask.test(askText))
    .map((rule) => rule.code);
  return Array.from(new Set(categories));
}

function evaluateSceneConflict(paragraphs: string[]) {
  const windowTexts = paragraphs.flatMap((paragraph, index) => {
    const next = paragraphs[index + 1];
    return next ? [paragraph, `${paragraph} ${next}`] : [paragraph];
  });

  let strongestScore = 0;
  let strongestText = "";
  for (const text of windowTexts) {
    const score =
      (countUniqueKeywordHits(text, ROLE_MARKERS) >= 2 ? 1 : 0)
      + (countUniqueKeywordHits(text, COST_MARKERS) >= 1 ? 1 : 0)
      + (countUniqueKeywordHits(text, CONFLICT_MARKERS) >= 2 ? 1 : 0)
      + (countUniqueKeywordHits(text, ACTION_MARKERS) >= 1 ? 1 : 0)
      + (countUniqueKeywordHits(text, RESULT_MARKERS) >= 1 ? 1 : 0);
    if (score > strongestScore) {
      strongestScore = score;
      strongestText = text;
    }
  }

  return {
    passed: strongestScore >= 4,
    score: strongestScore,
    strongestText,
  };
}

function evaluatePowerShiftConflict(paragraphs: string[]) {
  const windowTexts = paragraphs.flatMap((paragraph, index) => {
    const next = paragraphs[index + 1];
    return next ? [paragraph, `${paragraph} ${next}`] : [paragraph];
  });

  let strongestScore = 0;
  for (const text of windowTexts) {
    const entityHits = countUniqueKeywordHits(text, POWER_ENTITY_MARKERS);
    const capitalHits = countUniqueKeywordHits(text, POWER_CAPITAL_MARKERS);
    const conflictHits = countUniqueKeywordHits(text, POWER_CONFLICT_MARKERS);
    const hasNumericBoard = /\d+\s*(亿|万亿|倍|个月|年|%)/.test(text);
    const hasUrgency = /(刚刚|正式|今天|历史性|独家)/.test(text);
    const hasInternalCrack = /(CFO|CEO|董事会|投资者|股价|路线分歧|后院起火|内部裂痕|财务冰山)/.test(text);
    const score =
      (entityHits >= 2 ? 1 : 0)
      + (capitalHits >= 2 || hasNumericBoard ? 1 : 0)
      + (conflictHits >= 2 ? 1 : 0)
      + (hasUrgency ? 1 : 0)
      + (hasInternalCrack ? 1 : 0)
      + (/(权力.*倾斜|王座.*换了人|赢家|输家)/.test(text) ? 1 : 0);
    strongestScore = Math.max(strongestScore, score);
  }
  return {
    passed: strongestScore >= 3,
    score: strongestScore,
  };
}

function evaluatePowerShiftEvidence(paragraphs: string[]) {
  const plainText = paragraphs.join("\n");
  const entityHit = countUniqueKeywordHits(plainText, POWER_ENTITY_MARKERS);
  const capitalHit = countUniqueKeywordHits(plainText, POWER_CAPITAL_MARKERS);
  const numericHit = (plainText.match(/\d+\s*(亿|万亿|倍|个月|年|%)/g) || []).length;
  const sourceHit = /(WSJ|华尔街日报|The Information|SaaStr|The Atlantic|财务文件|外媒披露|媒体报道)/.test(plainText);
  return {
    passed: entityHit >= 2 && capitalHit >= 2 && numericHit >= 3 && sourceHit,
    entityHit,
    capitalHit,
    numericHit,
    sourceHit,
  };
}

function evaluateMiniCase(paragraphs: string[]) {
  const windows = paragraphs.flatMap((paragraph, index) => {
    const next = paragraphs[index + 1];
    return next ? [paragraph, `${paragraph} ${next}`] : [paragraph];
  });

  let strongestScore = 0;
  let strongestFlags = {
    speaker: false,
    artifact: false,
    result: false,
    action: false,
    timeOrNumber: false,
  };

  for (const text of windows) {
    const flags = {
      speaker: /“[^”]{3,40}”|「[^」]{3,40}」|老板问的是|销售说的是|投放问的是|对方说|有人说|我当时问/.test(text),
      artifact: countUniqueKeywordHits(text, ARTIFACT_MARKERS) >= 1,
      result: countUniqueKeywordHits(text, RESULT_MARKERS) >= 1,
      action: countUniqueKeywordHits(text, ACTION_MARKERS) >= 1,
      timeOrNumber: /\d+\s*(天|周|月|个|条|轮|次|%)/.test(text) || /那天|当天|上周|昨晚|今天|最近/.test(text),
    };
    const score = Object.values(flags).filter(Boolean).length;
    if (score > strongestScore) {
      strongestScore = score;
      strongestFlags = flags;
    }
  }

  const passed = strongestFlags.speaker && strongestFlags.artifact && strongestFlags.result && (strongestFlags.action || strongestFlags.timeOrNumber);
  return { passed, score: strongestScore, flags: strongestFlags };
}

function evaluatePostureMode(mode: string, plainText: string, paragraphs: string[]) {
  const didacticHits = countKeywordHits(plainText, DIDACTIC_MARKERS);
  if (!mode || !["case_breakdown", "operator_test", "analysis_interpreter"].includes(mode)) {
    return {
      passed: true,
      detail: "未提供明确作者姿态模式，跳过姿态一致性强校验。",
    };
  }

  if (mode === "case_breakdown") {
    const passed = evaluateSceneConflict(paragraphs).passed && countUniqueKeywordHits(plainText, ARTIFACT_MARKERS) >= 2 && didacticHits <= 10;
    return {
      passed,
      detail: passed
        ? "正文保持了案例拆解姿态，冲突和证据都还在前台。"
        : "正文没有稳定维持案例拆解姿态，像在讲观点或讲课，不像在拆一个具体翻车现场。",
    };
  }

  if (mode === "operator_test") {
    const passed = hasTestVoice(plainText) && countUniqueKeywordHits(plainText, TOOL_MARKERS) >= 1 && (countUniqueKeywordHits(plainText, RESULT_MARKERS) >= 1 || /\d/.test(plainText));
    return {
      passed,
      detail: passed
        ? "正文保持了实测/操盘者姿态，有亲手动作、工具对象和结果反馈。"
        : "正文没有稳定维持实测/操盘者姿态，缺亲手动作、工具对象或结果反馈。",
    };
  }

  const firstScreen = paragraphs.slice(0, 2).join(" ").slice(0, 240);
  const evidenceHits = [
    countUniqueKeywordHits(plainText, ARTIFACT_MARKERS) >= 1,
    /\d/.test(plainText),
    /“[^”]{3,40}”|「[^」]{3,40}」/.test(plainText),
  ].filter(Boolean).length;
  const passed = hasAnyPattern(firstScreen, OBJECT_PATTERNS) && hasAnyPattern(firstScreen, CHANGE_PATTERNS) && hasAnyPattern(firstScreen, CONSEQUENCE_PATTERNS) && evidenceHits >= 2 && didacticHits <= 10;
  return {
    passed,
    detail: passed
      ? "正文保持了解释型姿态，但仍然贴着对象、变化和证据在讲。"
      : "正文虽然走了解释型姿态，但没有把对象、变化和证据压到前台，容易重新滑回泛分析稿。",
  };
}

function evaluatePowerShiftPosture(plainText: string, paragraphs: string[]) {
  const firstScreen = paragraphs.slice(0, 2).join(" ").slice(0, 240);
  const evidenceHit = evaluatePowerShiftEvidence(paragraphs.slice(0, 12)).passed;
  const conflictHit = evaluatePowerShiftConflict(paragraphs.slice(0, 10)).passed;
  const didacticHits = countKeywordHits(plainText, DIDACTIC_MARKERS);
  const entityHits = countUniqueKeywordHits(plainText, POWER_ENTITY_MARKERS);
  const capitalHits = countUniqueKeywordHits(plainText, POWER_CAPITAL_MARKERS);
  const conflictMarkers = countUniqueKeywordHits(plainText, POWER_CONFLICT_MARKERS);
  const paragraphCount = paragraphs.length;
  const passed =
    countUniqueKeywordHits(firstScreen, POWER_ENTITY_MARKERS) >= 2
    && (countUniqueKeywordHits(firstScreen, POWER_CAPITAL_MARKERS) >= 2 || /\d+\s*(亿|万亿|倍|个月|年|%)/.test(firstScreen))
    && evidenceHit
    && (conflictHit || conflictMarkers >= 4)
    && entityHits >= 2
    && capitalHits >= 3
    && paragraphCount >= 5
    && didacticHits <= 10;
  return {
    passed,
    detail: passed
      ? "正文保持了权力更替/资本战姿态，先抛胜负，再给数字和裂痕。"
      : "正文没有稳定维持权力更替/资本战姿态，像在复述新闻，不像在拆一场王座更替。",
  };
}

function hasTestVoice(text: string) {
  return TEST_MARKERS.some((marker) => text.includes(marker)) || countKeywordHits(text, ["我", "自己"]) >= 3;
}

export function evaluateFinalBodyViralContract(input: FinalBodyViralContractInput): FinalBodyViralContractResult {
  const paragraphs = splitReaderParagraphs(clean(input.markdownContent));
  const plainText = paragraphs.join("\n");
  const aiNoise = analyzeAiNoise(plainText);
  const mode = detectArticleViralMode({
    title: input.title,
    markdownContent: input.markdownContent,
    businessQuestions: input.businessQuestions,
  });
  const firstScreen = paragraphs.slice(0, 2).join(" ").slice(0, 240);
  const dimensions: FinalBodyViralContractDimension[] = [];

  const openingPassed =
    mode === "power_shift_breaking"
      ? Boolean(firstScreen)
        && countUniqueKeywordHits(firstScreen, POWER_ENTITY_MARKERS) >= 2
        && (countUniqueKeywordHits(firstScreen, POWER_CAPITAL_MARKERS) >= 2 || /\d+\s*(亿|万亿|倍|个月|年|%)/.test(firstScreen))
        && /(刚刚|正式|今天|历史性|独家|易主|反超|超越|霸主)/.test(firstScreen)
        && countKeywordHits(firstScreen, DIDACTIC_MARKERS) <= 2
      : Boolean(firstScreen)
        && hasAnyPattern(firstScreen, OBJECT_PATTERNS)
        && hasAnyPattern(firstScreen, CHANGE_PATTERNS)
        && hasAnyPattern(firstScreen, CONSEQUENCE_PATTERNS)
        && (countUniqueKeywordHits(firstScreen, ROLE_MARKERS) >= 2 || countUniqueKeywordHits(firstScreen, COST_MARKERS) >= 2)
        && countKeywordHits(firstScreen, DIDACTIC_MARKERS) <= 2;
  dimensions.push({
    key: "firstScreen",
    label: "第一屏兑现",
    passed: openingPassed,
    detail: openingPassed
      ? "终稿第一屏已经把对象、变化和后果一起抛出来。"
      : `终稿第一屏还没把对象、变化和后果同时钉住${clean(input.firstScreenPromise) ? `；当前承诺是「${clean(input.firstScreenPromise)}」` : ""}。`,
  });

  const sceneConflict = mode === "power_shift_breaking"
    ? evaluatePowerShiftConflict(paragraphs.slice(0, 10))
    : evaluateSceneConflict(paragraphs.slice(0, 8));
  dimensions.push({
    key: "sceneConflict",
    label: "角色冲突",
    passed: sceneConflict.passed,
    detail: sceneConflict.passed
      ? "终稿里能看见胜负、角色或组织裂痕真的撞在一起。"
      : "终稿还没有形成硬冲突，像在解释观点，不像在拆一场真实对撞。",
  });

  const miniCase = mode === "power_shift_breaking"
    ? evaluatePowerShiftEvidence(paragraphs.slice(0, 12))
    : evaluateMiniCase(paragraphs.slice(0, 10));
  dimensions.push({
    key: mode === "power_shift_breaking" ? "scoreboardEvidence" : "miniCase",
    label: mode === "power_shift_breaking" ? "胜负看板证据" : "具体小案例",
    passed: miniCase.passed,
    detail: mode === "power_shift_breaking"
      ? miniCase.passed
        ? "终稿里已经有赢家/输家、数字看板、时间锚点和外部来源。"
        : "终稿缺少足够硬的胜负看板证据，赢家/输家、硬数字、时间线或来源还没同时站住。"
      : miniCase.passed
        ? "终稿里已经有“谁说了什么、看哪张表、结果卡在哪里”的 mini case。"
        : "终稿缺少完整 mini case，还是“有个案例/很多团队”这种虚焦写法。",
  });

  const empathyPassed =
    aiNoise.didacticToneRisk !== "high"
    && aiNoise.distantToneRisk !== "high"
    && countUniqueKeywordHits(plainText, EMOTION_MARKERS) >= 1
    && (
      mode === "power_shift_breaking"
        ? countUniqueKeywordHits(plainText, POWER_CAPITAL_MARKERS) >= 2 || /(倒吸凉气|恐慌|担忧|跳水|冰山)/.test(plainText)
        : countUniqueKeywordHits(plainText, COST_MARKERS) >= 2 && aiNoise.readerClosenessCueCount >= 10
    );
  dimensions.push({
    key: "empathy",
    label: "情绪共情",
    passed: empathyPassed,
    detail: empathyPassed
      ? "终稿让读者能感觉到压力、后果和胜负倾斜。"
      : "终稿还在讲判断，没有先把读者拖进压力、后果和情绪里。",
  });

  const posture = mode === "power_shift_breaking"
    ? evaluatePowerShiftPosture(plainText, paragraphs)
    : evaluatePostureMode(clean(input.authorPostureMode), plainText, paragraphs);
  dimensions.push({
    key: "posture",
    label: "作者姿态",
    passed: posture.passed,
    detail: posture.detail,
  });

  const businessCategories = detectBusinessCategories(input);
  if (businessCategories.length > 0) {
    const covered = BUSINESS_CATEGORY_RULES
      .filter((rule) => businessCategories.includes(rule.code))
      .map((rule) => ({ code: rule.code, covered: rule.body.test(plainText) }));
    const coveredCount = covered.filter((item) => item.covered).length;
    const missingCore = ["money", "evidence"].filter((code) => businessCategories.includes(code as BusinessCategory) && !covered.find((item) => item.code === code)?.covered);
    const needsOneStrategicCategory = ["why_now", "audience", "not_fit"].some((code) => businessCategories.includes(code as BusinessCategory));
    const hasStrategicCategory = covered.some((item) => ["why_now", "audience", "not_fit"].includes(item.code) && item.covered);
    const businessPassed = missingCore.length === 0 && coveredCount >= Math.min(4, businessCategories.length) && (!needsOneStrategicCategory || hasStrategicCategory);
    const missingLabels = covered.filter((item) => !item.covered).map((item) => item.code);
    dimensions.push({
      key: "businessCoverage",
      label: "商业问题兑现",
      passed: businessPassed,
      detail: businessPassed
        ? "终稿已经把商业七问里的关键问题落回正文，不只是停在研究卡里。"
        : `终稿还没把商业七问真正写进正文，缺：${missingLabels.join("、")}。`,
    });
  }

  if (clean(input.shareTrigger)) {
    const sharePassed = /转给|发给|甩给|老板看|销售看|团队看|适合发给|拿给/.test(plainText);
    dimensions.push({
      key: "shareTrigger",
      label: "转发动机",
      passed: true,
      detail: sharePassed
        ? "终稿已经把“这篇适合转给谁”说出来了。"
        : `转发理由还偏隐性${clean(input.shareTrigger) ? `；当前转发触发器是「${clean(input.shareTrigger)}」` : ""}。`,
    });
  }

  const blockers = dimensions.filter((item) => !item.passed).map((item) => item.detail);
  const suggestions = dimensions.filter((item) => item.passed).map((item) => item.detail);

  return {
    version: "final-body-contract-v1",
    passed: blockers.length === 0,
    summary:
      blockers.length === 0
        ? "最终正文已经兑现第一屏、冲突、案例、共情和商业姿态，不再只是中间产物看起来完整。"
        : `最终正文契约还有 ${blockers.length} 处没兑现，Plan13/24/26 的核心要求还停留在提示词或中间产物层。`,
    blockers,
    suggestions,
    dimensions,
  };
}
