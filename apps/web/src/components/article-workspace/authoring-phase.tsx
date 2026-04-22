import type { ReactNode } from "react";
import type { WorkspaceView } from "./types";

export type AuthoringPhaseCode = "collect" | "think" | "write" | "polish";

export const AUTHORING_PHASES: Array<{
  code: AuthoringPhaseCode;
  title: string;
  summary: string;
  supportLabel: string;
  targetStageCode: string;
  defaultView: WorkspaceView;
}> = [
  {
    code: "collect",
    title: "采集",
    summary: "先把题目、线索和素材抓到手里，再动判断。",
    supportLabel: "研究简报 / 证据包 / 大纲挂材",
    targetStageCode: "researchBrief",
    defaultView: "workspace",
  },
  {
    code: "think",
    title: "构思",
    summary: "把读者、论点和章节推进顺序定清楚。",
    supportLabel: "受众分析 / 大纲规划 / 策略卡",
    targetStageCode: "outlinePlanning",
    defaultView: "workspace",
  },
  {
    code: "write",
    title: "写作",
    summary: "只留稿纸与执行卡，把注意力放回句子本身。",
    supportLabel: "写作执行卡 / Markdown / 节奏图",
    targetStageCode: "deepWriting",
    defaultView: "edit",
  },
  {
    code: "polish",
    title: "润色",
    summary: "用红笔和微信真机视角清掉机器味，再决定是否交付。",
    supportLabel: "语言守卫 / 事实核查 / 微信预览",
    targetStageCode: "prosePolish",
    defaultView: "audit",
  },
];

export const GENERATABLE_STAGE_ACTIONS: Record<string, { label: string; helper: string }> = {
  researchBrief: {
    label: "生成研究简报",
    helper: "围绕核心问题补齐信源覆盖、时间脉络、横向比较和交汇洞察，再把研究结论写回后续判断。",
  },
  audienceAnalysis: {
    label: "生成受众分析",
    helper: "根据标题、人设、素材和当前正文，给出读者分层与表达建议。",
  },
  outlinePlanning: {
    label: "生成大纲规划",
    helper: "输出核心观点、段落推进、证据提示与结尾收束策略。",
  },
  deepWriting: {
    label: "生成写作执行卡",
    helper: "把已确认的大纲、受众、素材和文风约束整理成一张可直接驱动正文生成的执行卡。",
  },
  factCheck: {
    label: "执行事实核查",
    helper: "标记需要补来源、改判断语气或重新核验的数据与案例。",
  },
  prosePolish: {
    label: "执行文笔润色",
    helper: "给出节奏、表达、金句与首段改写建议。",
  },
};

const CLASSIC_OPENING_PATTERNS: Array<{ title: string; detail: string }> = [
  {
    title: "先从一个异样场景切进去",
    detail: "别先讲道理，先写一个看似平常却明显不对劲的现场，让读者先被拉进问题里。",
  },
  {
    title: "先落一个反直觉判断",
    detail: "开头先给结论，但别给满。只落最关键的判断，把解释留到下一段继续展开。",
  },
  {
    title: "先追问一个真正的问题",
    detail: "好开头不是把背景讲完，而是把读者也会追问的那个问题准准地提出来。",
  },
  {
    title: "先写你为什么被刺到",
    detail: "如果这件事确实让你起了反应，先写触发你的那一下，文章会比模板开场更像人写。",
  },
];

export function getAuthoringPhaseCode(stepCode: string, stageCode?: string): AuthoringPhaseCode {
  const normalizedStageCode = String(stageCode || "").trim();
  if (["factCheck", "prosePolish", "coverImage", "layout", "publish"].includes(normalizedStageCode)) return "polish";
  if (normalizedStageCode === "deepWriting" || stepCode === "draft") return "write";
  if (["audienceAnalysis", "outlinePlanning"].includes(normalizedStageCode) || stepCode === "strategy") return "think";
  if (stepCode === "publish" || stepCode === "result") return "polish";
  return "collect";
}

export function formatWorkspaceViewLabel(view: WorkspaceView) {
  if (view === "workspace") return "阶段工作台";
  if (view === "preview") return "微信预览";
  if (view === "audit") return "红笔校阅";
  return "稿纸";
}

export function getDefaultWorkspaceViewForStageCode(stageCode: string): WorkspaceView {
  if (["deepWriting", "refine"].includes(stageCode)) return "edit";
  if (stageCode === "prosePolish") return "audit";
  if (stageCode === "publish") return "preview";
  return "workspace";
}

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickSeededItems<T>(items: T[], count: number, seedSource: string) {
  if (items.length <= count) return items;
  const pool = [...items];
  const selected: T[] = [];
  let seed = hashSeed(seedSource);
  while (pool.length > 0 && selected.length < count) {
    const index = seed % pool.length;
    const [item] = pool.splice(index, 1);
    if (item) {
      selected.push(item);
    }
    seed = (seed * 1103515245 + 12345) >>> 0;
  }
  return selected;
}

export function getDraftStarterOptions(phase: AuthoringPhaseCode, title: string) {
  const subject = String(title || "这件事").trim() || "这件事";
  if (phase === "collect") {
    return [
      {
        label: "先记线索",
        text: `我先记下一个线索：${subject} 表面上看是 ______，但真正值得追下去的是 ______。`,
      },
      {
        label: "先记疑问",
        text: `这篇稿子先不急着下判断。我现在最想弄清楚的，其实只有一个问题：${subject} 为什么会走到今天这一步？`,
      },
    ];
  }
  if (phase === "think") {
    return [
      {
        label: "先写论点",
        text: `如果只能先写一句中心判断，我会这样落笔：${subject} 真正改变行业节奏的，不是 ______，而是 ______。`,
      },
      {
        label: "先写读者",
        text: `如果你也在盯着 ${subject}，这篇稿子想先回答一个更底层的问题：我们到底该把注意力放在哪个变化上？`,
      },
    ];
  }
  if (phase === "polish") {
    return [
      {
        label: "贴一段待修稿",
        text: "把最需要润色的一段先贴进来：\n\n______",
      },
      {
        label: "先改首段",
        text: `先把首段写得更像人说话：关于 ${subject}，我最近越来越确信一件事：______。`,
      },
    ];
  }
  return [
    {
      label: "先写结论",
      text: `关于 ${subject}，我越来越确信，真正值得注意的不是 ______，而是 ______。`,
    },
    {
      label: "先写场景",
      text: `上周我在 ______ 的时候，突然意识到：${subject} 这件事最容易被忽略的，其实是 ______。`,
    },
  ];
}

export function buildBlankSlateInspirationCards(input: {
  fragments: Array<{ id: number; title?: string | null; distilledContent: string; shared?: boolean }>;
  phase: AuthoringPhaseCode;
  articleId: number;
  title: string;
}) {
  const seedSource = `${input.articleId}:${input.title}:${input.phase}`;
  const fragmentCards = pickSeededItems(
    input.fragments
      .filter((fragment) => String(fragment.distilledContent || "").trim())
      .map((fragment) => ({
        key: `fragment-${fragment.id}`,
        kind: "fragment" as const,
        title: fragment.title ? `素材灵感 · ${fragment.title}` : `素材灵感 · 片段 ${fragment.id}`,
        detail: String(fragment.distilledContent || "").trim(),
        meta: fragment.shared ? "来自共用素材池" : "来自当前稿件素材池",
      })),
    2,
    `${seedSource}:fragment`,
  );
  const classicCards = pickSeededItems(CLASSIC_OPENING_PATTERNS, 2, `${seedSource}:classic`).map((item, index) => ({
    key: `classic-${index}-${item.title}`,
    kind: "classic" as const,
    title: `经典起手法 · ${item.title}`,
    detail: item.detail,
    meta: "适合空白稿纸时借来破冰",
  }));
  return [...fragmentCards, ...classicCards].slice(0, 4);
}

export function getAuthoringBlankSlateCopy(input: {
  phase: AuthoringPhaseCode;
  surface: "paper" | "workspace" | "review" | "knowledge";
  stepTitle: string;
}) {
  const { phase, surface, stepTitle } = input;
  if (surface === "paper") {
    if (phase === "collect") {
      return {
        eyebrow: "案头起笔",
        title: "这页稿纸先不用急着写满",
        detail: "采集阶段先抓线索、记事实锚点、标出疑问。哪怕只写下一句“我真正想追的问题是什么”，空白感也会立刻下降。",
        prompts: ["先写问题，不急着写答案", "把最关键的一条事实先钉住", "素材不足时，优先回左侧继续挂材"],
      };
    }
    if (phase === "think") {
      return {
        eyebrow: "案头起笔",
        title: "先把论点写出来，正文可以稍后再长",
        detail: "构思阶段最怕一直在脑子里转。先落一条判断、一类读者或一个段落推进顺序，后面的句子自然会跟上。",
        prompts: ["先写中心判断", "先写读者真正关心的冲突", "先决定开头要从场景还是结论切入"],
      };
    }
    if (phase === "polish") {
      return {
        eyebrow: "待修稿纸",
        title: "先把要修的那一段贴上来",
        detail: "润色不是在空白页上完成的。先放进一段已有正文，再看节奏图、红笔批注和微信预览，判断会更稳。",
        prompts: ["先修首段，再修转折", "机器味通常藏在过整齐的句式里", "要交付前，至少过一遍红笔和真机预览"],
      };
    }
    return {
      eyebrow: "案头起笔",
      title: "先落一句判断，整篇就不会再那么空",
      detail: "写作阶段不要求一口气写完。只要先写出第一句结论、一个真实场景或一段读者困惑，稿纸就开始有重量了。",
      prompts: ["别等完整结构，先落第一句", "一段只解决一个判断", "写完 3 到 5 句后再看节奏图更准"],
    };
  }

  if (surface === "review") {
    return {
      eyebrow: "主编红笔",
      title: "红笔暂时还没有落点",
      detail: "校阅模式更适合处理已经成形的段落。先写出几句可读正文，红笔才会帮你指出哪里像模板、哪里该拆句。",
      prompts: ["先写能读的一小段", "先看节奏，再看语言守卫", "正文出现后，批注编号会直接落在稿纸上"],
    };
  }

  if (surface === "knowledge") {
    return {
      eyebrow: "相关背景卡",
      title: "这篇稿子还没召回可复用的背景卡",
      detail: "通常不是系统无卡，而是当前标题、正文和已挂素材还不足以把它们拉到眼前。先补线索，再回来会更准。",
      prompts: ["优先补具体名词、时间点和案例", "标题和正文越明确，背景卡越容易命中", "刷新背景卡前，先保存当前稿件"],
    };
  }

  if (phase === "collect") {
    return {
      eyebrow: "阶段工作台",
      title: `先把「${stepTitle}」这张工作卡立起来`,
      detail: "采集阶段的工作台不是为了展示成稿，而是为了沉淀研究底座。先把事实、时间线和素材关系整理出来，后续写作会轻很多。",
      prompts: ["先补齐研究和证据", "先保存关键快照", "先让每个大纲节点都有挂材"],
    };
  }
  if (phase === "think") {
    return {
      eyebrow: "阶段工作台",
      title: `「${stepTitle}」还没生成，但判断已经可以先收束`,
      detail: "构思阶段最重要的是把读者、段落推进和文章角度定清楚。先生成阶段卡，会比在空白页里反复琢磨更稳。",
      prompts: ["先明确这篇是写给谁的", "先定文章角度，再补段落顺序", "策略卡和大纲卡最好互相校准"],
    };
  }
  if (phase === "polish") {
    return {
      eyebrow: "阶段工作台",
      title: `「${stepTitle}」还没落下，先别急着交稿`,
      detail: "润色阶段的结构化结果更像最后一道门。先生成这张卡，再决定哪些句子该拆、哪些判断该收、哪些地方该补证。",
      prompts: ["先让系统给出高风险句提示", "先看首段和转折段是否太像模板", "交付前再走一遍真机预览"],
    };
  }
  return {
    eyebrow: "阶段工作台",
    title: `「${stepTitle}」还没生成，写作会少一张地图`,
    detail: "写作阶段可以直接起笔，但有了执行卡后，文章原型、状态切换和节奏安排会更清楚，白纸感也会明显下降。",
    prompts: ["先生成执行卡，再决定怎么起笔", "不确定时，先看推荐原型与状态", "正文写出一段后，再回来刷新会更贴稿子"],
  };
}

export function AuthoringBlankSlate({
  eyebrow,
  title,
  detail,
  prompts,
  compact = false,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  prompts?: string[];
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden border border-lineStrong/70 bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.14),transparent_30%),linear-gradient(180deg,rgba(255,253,250,1)_0%,rgba(250,247,240,1)_100%)] ${compact ? "px-4 py-4" : "px-6 py-6"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
      <div className="relative">
        <div className="inline-flex items-center border border-lineStrong/70 bg-surface/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-inkMuted">
          {eyebrow}
        </div>
        <div className={`mt-4 font-serifCn text-ink text-balance ${compact ? "text-2xl" : "text-3xl"}`}>{title}</div>
        <div className={`mt-3 max-w-3xl text-inkSoft ${compact ? "text-sm leading-7" : "text-sm leading-8"}`}>{detail}</div>
        {prompts && prompts.length > 0 ? (
          <div className={`mt-4 grid gap-2 ${compact ? "" : "md:grid-cols-3"}`}>
            {prompts.map((prompt) => (
              <div key={prompt} className="border border-lineStrong/60 bg-surface/80 px-3 py-3 text-xs leading-6 text-inkSoft">
                {prompt}
              </div>
            ))}
          </div>
        ) : null}
        {children ? <div className="mt-5 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </div>
  );
}
