export type ArticleViralMode = "default" | "power_shift_breaking";

const POWER_SHIFT_ENTITY_PATTERN = /(Anthropic|OpenAI|微软|Microsoft|谷歌|Google|Meta|英伟达|NVIDIA|亚马逊|Amazon|苹果|Apple|甲骨文|Oracle|软银|SoftBank|Broadcom|Salesforce|德勤|埃森哲|奥特曼|Sam Altman|Dario|Amodei|Friar|CFO|CEO|董事会|WSJ|华尔街日报)/i;
const POWER_SHIFT_CAPITAL_PATTERN = /(营收|ARR|MRR|估值|融资|IPO|现金流|利润|亏损|算力合同|成本|周活|年收|亿美元|万亿美元|市值|收入|财报|投资者|股价|合同|现金流|盈利)/i;
const POWER_SHIFT_CHANGE_PATTERN = /(刚刚|正式|易主|换了|反超|超越|碾压|霸主|王座|逆袭|内讧|路线分歧|后院起火|权力游戏|恐慌|叛将|复仇者|史诗级|小老弟|下半场)/i;
const POWER_SHIFT_BUSINESS_QUESTION_PATTERN = /(钱从哪里来|为什么这个变化是现在|最可信的案例|影响的是哪一类人|谁不适合|转发给谁)/i;

function clean(value: unknown) {
  return String(value || "").trim();
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || []).length;
}

export function detectArticleViralMode(input: {
  title?: string | null;
  markdownContent?: string | null;
  businessQuestions?: Array<string | null | undefined> | null;
}) {
  const title = clean(input.title);
  const markdownContent = clean(input.markdownContent);
  const businessQuestions = (input.businessQuestions ?? []).map((item) => clean(item)).join("\n");
  const corpus = [title, markdownContent.slice(0, 1200), businessQuestions].filter(Boolean).join("\n");
  if (!corpus) {
    return "default" as ArticleViralMode;
  }

  const entityHit = POWER_SHIFT_ENTITY_PATTERN.test(corpus);
  const entityCount = countMatches(corpus, POWER_SHIFT_ENTITY_PATTERN);
  const capitalHit = POWER_SHIFT_CAPITAL_PATTERN.test(corpus);
  const changeHit = POWER_SHIFT_CHANGE_PATTERN.test(corpus);
  const questionHit = POWER_SHIFT_BUSINESS_QUESTION_PATTERN.test(businessQuestions);
  const numericHit = /\d+\s*(亿|万亿|倍|%|年|个月|周|天)|ARR|IPO/i.test(corpus);

  if (
    entityHit
    && capitalHit
    && (changeHit || numericHit)
    && (entityCount >= 2 || questionHit)
  ) {
    return "power_shift_breaking" as ArticleViralMode;
  }

  return "default" as ArticleViralMode;
}
