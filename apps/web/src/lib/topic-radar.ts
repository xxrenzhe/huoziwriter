import { getDatabase } from "./db";
import { getUserAccessScope } from "./access-scope";

type TopicSourceRow = {
  id: number;
  owner_user_id: number | null;
  name: string;
  homepage_url: string | null;
  is_active: number | boolean;
};

type ParsedTopic = {
  title: string;
  sourceUrl: string | null;
};

function decodeHtml(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function absolutizeUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractTopicsFromHtml(baseUrl: string, html: string) {
  const matches = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const topics: ParsedTopic[] = [];
  for (const match of matches) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (text.length < 12 || text.length > 80) continue;
    if (/登录|注册|下载|APP|关于我们|联系我们|广告|隐私|版权|更多|专题|视频|直播/i.test(text)) continue;
    const sourceUrl = absolutizeUrl(baseUrl, href);
    topics.push({
      title: text,
      sourceUrl,
    });
  }
  return topics.filter(
    (topic, index, items) => topic.title && items.findIndex((item) => item.title === topic.title) === index,
  );
}

function pickEmotionLabels(title: string) {
  const labels = new Set<string>();
  if (/(裁员|降薪|亏损|倒闭|收缩|失业|出血|焦虑)/.test(title)) labels.add("行业焦虑");
  if (/(涨价|降价|利润|融资|估值|财富|收入|现金)/.test(title)) labels.add("财富焦虑");
  if (/(AI|模型|大厂|算力|芯片|平台|工具)/i.test(title)) labels.add("技术震荡");
  if (/(监管|争议|反垄断|封禁|事故|问题|风险)/.test(title)) labels.add("冷眼旁观");
  if (labels.size === 0) labels.add("创作危机");
  return Array.from(labels).slice(0, 3);
}

function buildAngleOptions(title: string, labels: string[]) {
  const lead = labels[0] || "行业焦虑";
  return [
    `${lead}不是背景音，它本身就是这条新闻最值得写的切口。`,
    `别急着重复标题，先拆开“${title}”背后的利益变化和叙事漏洞。`,
    `如果把这件事放回长期观察里，真正变化的不是事件，而是判断这件事的坐标。`,
  ];
}

function buildSummary(title: string) {
  return `热点信号：${title}。建议优先关注其中涉及的数据变化、角色关系和叙事转向。`;
}

async function getTopicSources(userId?: number) {
  const db = getDatabase();
  if (!userId) {
    return db.query<TopicSourceRow>(
      "SELECT * FROM topic_sources WHERE is_active = ? AND owner_user_id IS NULL ORDER BY id ASC",
      [true],
    );
  }

  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  return db.query<TopicSourceRow>(
    `SELECT * FROM topic_sources
     WHERE is_active = ? AND (owner_user_id IS NULL OR owner_user_id IN (${placeholders}))
     ORDER BY owner_user_id ASC, id ASC`,
    [true, ...scope.userIds],
  );
}

async function hasRecentTopic(sourceName: string, title: string, ownerUserId?: number | null) {
  const db = getDatabase();
  const row =
    ownerUserId == null
      ? await db.queryOne<{ id: number }>(
          "SELECT id FROM topic_items WHERE source_name = ? AND title = ? AND owner_user_id IS NULL ORDER BY id DESC LIMIT 1",
          [sourceName, title],
        )
      : await db.queryOne<{ id: number }>(
          "SELECT id FROM topic_items WHERE source_name = ? AND title = ? AND owner_user_id = ? ORDER BY id DESC LIMIT 1",
          [sourceName, title, ownerUserId],
        );
  return Boolean(row);
}

async function insertTopicItem(input: {
  ownerUserId?: number | null;
  sourceName: string;
  title: string;
  summary: string;
  emotionLabels: string[];
  angleOptions: string[];
  sourceUrl: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO topic_items (
      owner_user_id, source_name, title, summary, emotion_labels_json, angle_options_json, source_url, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.ownerUserId ?? null,
      input.sourceName,
      input.title,
      input.summary,
      input.emotionLabels,
      input.angleOptions,
      input.sourceUrl,
      now,
      now,
    ],
  );
}

async function fetchSourceTopics(source: TopicSourceRow) {
  if (!source.homepage_url) return [] as ParsedTopic[];
  try {
    const response = await fetch(source.homepage_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    return extractTopicsFromHtml(source.homepage_url, html).slice(0, 8);
  } catch {
    return [];
  }
}

export async function syncTopicRadar(options?: { userId?: number; limitPerSource?: number }) {
  const sources = await getTopicSources(options?.userId);
  let inserted = 0;

  for (const source of sources) {
    const topics = await fetchSourceTopics(source);
    for (const topic of topics.slice(0, options?.limitPerSource ?? 4)) {
      if (await hasRecentTopic(source.name, topic.title, source.owner_user_id)) {
        continue;
      }
      const emotionLabels = pickEmotionLabels(topic.title);
      await insertTopicItem({
        ownerUserId: source.owner_user_id,
        sourceName: source.name,
        title: topic.title,
        summary: buildSummary(topic.title),
        emotionLabels,
        angleOptions: buildAngleOptions(topic.title, emotionLabels),
        sourceUrl: topic.sourceUrl,
      });
      inserted += 1;
    }
  }

  return { inserted };
}

export async function ensureDefaultTopics() {
  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM topic_items");
  if ((count?.count ?? 0) > 0) {
    const latest = await db.queryOne<{ created_at: string }>("SELECT created_at FROM topic_items ORDER BY id DESC LIMIT 1");
    const latestAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
    if (Date.now() - latestAt < 60 * 60 * 1000) {
      return;
    }
  }
  await syncTopicRadar({ limitPerSource: 4 });
}

export async function getVisibleTopicSources(userId: number) {
  return getTopicSources(userId);
}

export async function createTopicSource(input: { userId: number; name: string; homepageUrl: string }) {
  const db = getDatabase();
  const scope = await getUserAccessScope(input.userId);
  const now = new Date().toISOString();
  const normalizedName = input.name.trim();
  const normalizedUrl = input.homepageUrl.trim();
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const existingVisible = await db.queryOne<{ id: number; owner_user_id: number | null }>(
    `SELECT id, owner_user_id
     FROM topic_sources
     WHERE name = ?
       AND (
         owner_user_id IS NULL
         OR owner_user_id IN (${placeholders})
       )
     ORDER BY owner_user_id ASC, id ASC
     LIMIT 1`,
    [normalizedName, ...scope.userIds],
  );
  if (existingVisible) {
    if (existingVisible.owner_user_id == null) {
      throw new Error("系统信息源里已经存在同名来源，请直接复用，不要重复创建");
    }
    throw new Error(scope.isTeamShared ? "当前团队共享作用域里已经存在同名信息源" : "你已经创建过同名信息源");
  }

  await db.exec(
    `INSERT INTO topic_sources (owner_user_id, name, homepage_url, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.userId, normalizedName, normalizedUrl, true, now, now],
  );
  await syncTopicRadar({ userId: input.userId, limitPerSource: 4 });
}

export async function disableTopicSource(input: { userId: number; sourceId: number }) {
  const db = getDatabase();
  const scope = await getUserAccessScope(input.userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  await db.exec(
    `UPDATE topic_sources
     SET is_active = ?, updated_at = ?
     WHERE id = ? AND owner_user_id IN (${placeholders})`,
    [false, new Date().toISOString(), input.sourceId, ...scope.userIds],
  );
}
