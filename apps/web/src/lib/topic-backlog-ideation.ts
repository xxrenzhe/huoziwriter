import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { bulkCreateTopicBacklogItems, getTopicBacklogById, type TopicBacklogArchetype, type TopicBacklogItemStatus } from "./topic-backlogs";
import { loadPrompt } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
import { ensureBootstrapData } from "./repositories";

type TopicBacklogIdea = {
  theme: string;
  archetype: TopicBacklogArchetype;
  targetAudience: string | null;
  readerSnapshotHint: string | null;
  strategyDraft: Record<string, unknown> | null;
};

function pickText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeArchetype(value: unknown, fallback: TopicBacklogArchetype): TopicBacklogArchetype {
  if (value === "opinion" || value === "case" || value === "howto" || value === "hotTake" || value === "phenomenon") {
    return value;
  }
  return fallback;
}

function normalizeStatus(value: unknown): TopicBacklogItemStatus {
  if (value === "ready" || value === "queued" || value === "generated" || value === "discarded") {
    return value;
  }
  return "draft";
}

function uniqueIdeas(items: TopicBacklogIdea[], limit: number) {
  const seen = new Set<string>();
  const deduped: TopicBacklogIdea[] = [];
  for (const item of items) {
    const key = item.theme.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) {
      break;
    }
  }
  return deduped;
}

function buildStrategyDraft(input: {
  coreAssertion?: unknown;
  whyNow?: unknown;
  mainstreamBelief?: unknown;
  targetReader?: unknown;
}) {
  const draft = {
    coreAssertion: pickText(input.coreAssertion, 220) || null,
    whyNow: pickText(input.whyNow, 220) || null,
    mainstreamBelief: pickText(input.mainstreamBelief, 220) || null,
    targetReader: pickText(input.targetReader, 160) || null,
  };
  return Object.values(draft).some(Boolean) ? draft : null;
}

function buildFallbackIdeas(input: {
  seedTheme: string;
  targetAudience: string | null;
  seedContext: string | null;
  count: number;
}) {
  const seedTheme = input.seedTheme;
  const targetAudience = input.targetAudience || "正在判断这类变化会不会影响自己的内容作者";
  const contextHint = input.seedContext
    ? formatPromptTemplate("，背景是 {{seedContext}}", {
      seedContext: input.seedContext,
    })
    : "";
  const variants: Array<{
    archetype: TopicBacklogArchetype;
    theme: string;
    readerSnapshotHint: string;
    coreAssertion: string;
    whyNow: string;
    mainstreamBelief: string;
  }> = [
    {
      archetype: "phenomenon",
      theme: formatPromptTemplate("{{seedTheme}} 正在改写谁的默认判断", {
        seedTheme,
      }),
      readerSnapshotHint: formatPromptTemplate("{{targetAudience}} 已经感觉旧经验开始失灵，但还说不清真正变化发生在哪{{contextHint}}。", {
        targetAudience,
        contextHint,
      }),
      coreAssertion: formatPromptTemplate("{{seedTheme}} 值得写，不是因为它新，而是因为它让旧判断开始系统性失效。", {
        seedTheme,
      }),
      whyNow: "现在写，是因为读者已经感到别扭，但多数人还没把别扭翻译成判断。",
      mainstreamBelief: formatPromptTemplate("大众以为 {{seedTheme}} 只是新动向，还不会影响日常判断。", {
        seedTheme,
      }),
    },
    {
      archetype: "opinion",
      theme: formatPromptTemplate("别把 {{seedTheme}} 当成表面机会，真正变化在后面", {
        seedTheme,
      }),
      readerSnapshotHint: formatPromptTemplate("{{targetAudience}} 一边被新信号吸引，一边还在沿用旧动作，结果越做越拧巴{{contextHint}}。", {
        targetAudience,
        contextHint,
      }),
      coreAssertion: formatPromptTemplate("{{seedTheme}} 真正危险的不是机会太少，而是还在用旧动作理解新局面。", {
        seedTheme,
      }),
      whyNow: "讨论刚进入泛化阶段，最适合抢先给出判断而不是复述热闹。",
      mainstreamBelief: formatPromptTemplate("大众以为跟上 {{seedTheme}} 的关键词就算跟上变化。", {
        seedTheme,
      }),
    },
    {
      archetype: "howto",
      theme: formatPromptTemplate("面对 {{seedTheme}}，先别忙着跟，先改这 3 个判断动作", {
        seedTheme,
      }),
      readerSnapshotHint: formatPromptTemplate("{{targetAudience}} 正准备照着别人动作执行，却担心自己只是在追一个已经过载的模板{{contextHint}}。", {
        targetAudience,
        contextHint,
      }),
      coreAssertion: formatPromptTemplate("面对 {{seedTheme}}，最该升级的不是工具清单，而是判断顺序。", {
        seedTheme,
      }),
      whyNow: "读者已经开始执行，但执行顺序错了，越早纠偏越值钱。",
      mainstreamBelief: formatPromptTemplate("大众以为碰到 {{seedTheme}}，先搜工具和步骤就够了。", {
        seedTheme,
      }),
    },
    {
      archetype: "case",
      theme: formatPromptTemplate("一个 {{targetAudience}} 遇上 {{seedTheme}} 后，最先崩掉的是哪条旧经验", {
        targetAudience,
        seedTheme,
      }),
      readerSnapshotHint: formatPromptTemplate("{{targetAudience}} 在一个具体场景里发现过去屡试不爽的做法忽然不灵了{{contextHint}}。", {
        targetAudience,
        contextHint,
      }),
      coreAssertion: `案例真正说明的，不是个人执行力，而是旧经验在新环境里已经失效。`,
      whyNow: "单靠抽象判断还不够，真实处境更能把变化写实。",
      mainstreamBelief: formatPromptTemplate("大众以为遇到 {{seedTheme}} 只要更努力执行就能追上。", {
        seedTheme,
      }),
    },
    {
      archetype: "hotTake",
      theme: formatPromptTemplate("{{seedTheme}} 刷屏之后，最值得警惕的不是热度本身", {
        seedTheme,
      }),
      readerSnapshotHint: formatPromptTemplate("{{targetAudience}} 被刷屏信息裹挟着想立刻表态，但越看越觉得大家谈的不是重点{{contextHint}}。", {
        targetAudience,
        contextHint,
      }),
      coreAssertion: formatPromptTemplate("{{seedTheme}} 的热度只是表层，真正该警惕的是被一套旧叙事带偏。", {
        seedTheme,
      }),
      whyNow: "热度高的时候最容易形成错误共识，反而适合用评论切开。",
      mainstreamBelief: formatPromptTemplate("大众以为 {{seedTheme}} 最重要的是追热度、抢表态。", {
        seedTheme,
      }),
    },
  ];

  return uniqueIdeas(
    variants.map((item) => ({
      theme: item.theme,
      archetype: item.archetype,
      targetAudience,
      readerSnapshotHint: item.readerSnapshotHint,
      strategyDraft: buildStrategyDraft({
        coreAssertion: item.coreAssertion,
        whyNow: item.whyNow,
        mainstreamBelief: item.mainstreamBelief,
        targetReader: targetAudience,
      }),
    })),
    input.count,
  );
}

function parseIdeaItems(value: unknown, limit: number, fallbackAudience: string | null) {
  const items = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { items?: unknown }).items
    : Array.isArray(value)
      ? value
      : [];
  if (!Array.isArray(items)) {
    return [] as TopicBacklogIdea[];
  }
  return uniqueIdeas(
    items.map((item, index) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      const theme = pickText(record.theme, 120);
      const targetAudience = pickText(record.targetAudience, 160) || fallbackAudience;
      return {
        theme,
        archetype: normalizeArchetype(record.archetype, index % 2 === 0 ? "phenomenon" : "opinion"),
        targetAudience,
        readerSnapshotHint: pickText(record.readerSnapshotHint, 240) || null,
        strategyDraft: buildStrategyDraft({
          coreAssertion: record.coreAssertion,
          whyNow: record.whyNow,
          mainstreamBelief: record.mainstreamBelief,
          targetReader: targetAudience,
        }),
      } satisfies TopicBacklogIdea;
    }).filter((item) => item.theme),
    limit,
  );
}

async function generateIdeasWithAi(input: {
  userId: number;
  backlogName: string;
  backlogDescription: string | null;
  seedTheme: string;
  targetAudience: string | null;
  seedContext: string | null;
  count: number;
}) {
  const systemPrompt = await loadPrompt("topic_backlog_ideation");
  const userPrompt = [
    formatPromptTemplate("选题库：{{backlogName}}", {
      backlogName: input.backlogName,
    }),
    input.backlogDescription
      ? formatPromptTemplate("选题库说明：{{backlogDescription}}", {
        backlogDescription: input.backlogDescription,
      })
      : null,
    formatPromptTemplate("种子主题：{{seedTheme}}", {
      seedTheme: input.seedTheme,
    }),
    input.targetAudience
      ? formatPromptTemplate("优先目标读者：{{targetAudience}}", {
        targetAudience: input.targetAudience,
      })
      : null,
    input.seedContext
      ? formatPromptTemplate("补充背景：{{seedContext}}", {
        seedContext: input.seedContext,
      })
      : null,
    formatPromptTemplate("生成条数：{{count}}", {
      count: input.count,
    }),
    "",
    "请输出严格 JSON：",
    '{"items":[{"theme":"字符串","archetype":"opinion|case|howto|hotTake|phenomenon","targetAudience":"字符串","readerSnapshotHint":"字符串","coreAssertion":"字符串","whyNow":"字符串","mainstreamBelief":"字符串"}]}',
    "",
    "硬约束：",
    "1. 主题必须适合公众号选题库，不要写成正文标题党。",
    "2. 每条都要显式给出 archetype，且同批次尽量覆盖不同 archetype。",
    "3. readerSnapshotHint 要写成具体处境，不要退化成纯人群画像。",
    "4. coreAssertion 要体现判断，不要只复述现象。",
    "5. whyNow 要说明为何此刻值得写。",
    "6. 不要输出 markdown，不要解释，只返回 JSON。",
  ].filter(Boolean).join("\n");

  const result = await generateSceneText({
    sceneCode: "topicBacklogIdeation",
    systemPrompt,
    userPrompt,
    temperature: 0.5,
    rolloutUserId: input.userId,
  });
  return parseIdeaItems(extractJsonObject(result.text), input.count, input.targetAudience);
}

export async function generateTopicBacklogItemsFromSeed(input: {
  userId: number;
  backlogId: number;
  seedTheme?: unknown;
  targetAudience?: unknown;
  seedContext?: unknown;
  count?: unknown;
  defaultStatus?: unknown;
}) {
  await ensureBootstrapData();
  const backlog = await getTopicBacklogById(input.userId, input.backlogId);
  if (!backlog) {
    throw new Error("选题库不存在");
  }

  const seedTheme = pickText(input.seedTheme, 120);
  if (!seedTheme) {
    throw new Error("先输入一个种子主题");
  }

  const count = Math.max(3, Math.min(10, Math.round(Number(input.count) || 5)));
  const targetAudience = pickText(input.targetAudience, 160) || null;
  const seedContext = pickText(input.seedContext, 240) || null;
  const defaultStatus = normalizeStatus(input.defaultStatus);

  let ideas: TopicBacklogIdea[] = [];
  let degradedReason: string | null = null;
  try {
    ideas = await generateIdeasWithAi({
      userId: input.userId,
      backlogName: backlog.name,
      backlogDescription: backlog.description,
      seedTheme,
      targetAudience,
      seedContext,
      count,
    });
  } catch (error) {
    degradedReason = error instanceof Error ? error.message : "AI 生题失败";
  }

  if (ideas.length === 0) {
    ideas = buildFallbackIdeas({
      seedTheme,
      targetAudience,
      seedContext,
      count,
    });
    degradedReason = degradedReason || "AI 生题失败，已切换到本地模板生成。";
  }

  const result = await bulkCreateTopicBacklogItems({
    userId: input.userId,
    backlogId: input.backlogId,
    items: ideas.map((item) => ({
      theme: item.theme,
      archetype: item.archetype,
      targetAudience: item.targetAudience,
      readerSnapshotHint: item.readerSnapshotHint,
      strategyDraft: item.strategyDraft,
      sourceType: "ai-generated",
      status: defaultStatus,
    })),
    defaultSourceType: "ai-generated",
    defaultStatus,
  });

  return {
    ...result,
    degradedReason,
  };
}
