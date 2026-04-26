export type ImaCreds = {
  clientId: string;
  apiKey: string;
};

export type ImaKnowledgeBaseSummary = {
  kbId: string;
  kbName: string;
  description: string | null;
  contentCount: number | null;
};

export type ImaKnowledgeSearchItem = {
  mediaId: string;
  title: string;
  parentFolderId: string | null;
  sourceUrl: string | null;
  highlightContent: string;
};

type ImaResponse<T> = {
  retcode?: number;
  errmsg?: string;
  code?: number;
  msg?: string;
  data: T;
};

type ImaKnowledgeBaseSearchData = {
  info_list?: Array<{
    id?: string;
    name?: string;
    kb_id?: string;
    kb_name?: string;
    description?: string;
    content_count?: string | number;
  }>;
  is_end?: boolean;
  next_cursor?: string;
};

type ImaKnowledgeBaseInfoData = {
  infos?: Record<string, {
    id?: string;
    name?: string;
    kb_id?: string;
    kb_name?: string;
    description?: string;
    content_count?: string | number;
  }>;
};

type ImaSearchKnowledgeData = {
  info_list?: Array<{
    media_id?: string;
    title?: string;
    parent_folder_id?: string;
    highlight_content?: string;
    web_info?: { content_id?: string; url?: string };
    url?: string;
    content_id?: string;
  }>;
  next_cursor?: string;
  is_end?: boolean;
};

function getImaResponseCode<T>(payload: ImaResponse<T> | null | undefined) {
  if (!payload) return null;
  if (typeof payload.retcode === "number") return payload.retcode;
  if (typeof payload.code === "number") return payload.code;
  return null;
}

function getImaResponseMessage<T>(payload: ImaResponse<T> | null | undefined) {
  if (!payload) return null;
  if (typeof payload.errmsg === "string" && payload.errmsg.trim()) return payload.errmsg.trim();
  if (typeof payload.msg === "string" && payload.msg.trim()) return payload.msg.trim();
  return null;
}

function parseContentCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return Number(normalized);
    }
  }
  return null;
}

export class ImaApiError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
    this.name = "ImaApiError";
  }
}

export class ImaNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImaNetworkError";
  }
}

function parseCountFromDescription(value: string | null | undefined) {
  const match = String(value || "").match(/(\d[\d,]*)\s*(篇|条|个)/);
  if (!match) return null;
  const count = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(count) ? count : null;
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function getImaBaseUrl() {
  const configured = String(process.env.IMA_OPENAPI_BASE_URL || "").trim();
  const baseUrl = configured || "https://ima.qq.com";
  return `${baseUrl.replace(/\/+$/, "")}/`;
}

export async function imaRequest<T>(path: string, body: unknown, creds: ImaCreds): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getImaBaseUrl()}${path.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ima-openapi-clientid": creds.clientId,
        "ima-openapi-apikey": creds.apiKey,
        "ima-openapi-ctx": "skill_version=huoziwriter",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new ImaNetworkError(error instanceof Error ? error.message : "IMA 请求失败");
  }

  const payload = await response.json().catch(() => null) as ImaResponse<T> | null;
  if (!response.ok) {
    throw new ImaNetworkError(getImaResponseMessage(payload) || `IMA 请求失败，HTTP ${response.status}`);
  }
  const responseCode = getImaResponseCode(payload);
  if (!payload || typeof responseCode !== "number") {
    throw new ImaNetworkError("IMA 返回格式异常");
  }
  if (responseCode !== 0) {
    throw new ImaApiError(getImaResponseMessage(payload) || "IMA 调用失败", responseCode);
  }
  return payload.data;
}

export async function getKnowledgeBaseInfo(creds: ImaCreds, kbIds: string[]) {
  const ids = Array.from(new Set(kbIds.map((item) => String(item || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [] as ImaKnowledgeBaseSummary[];

  const result: ImaKnowledgeBaseSummary[] = [];
  for (const group of chunk(ids, 20)) {
    const data = await imaRequest<ImaKnowledgeBaseInfoData>("openapi/wiki/v1/get_knowledge_base", { ids: group }, creds);
    const infos = data.infos ?? {};
    for (const kbId of group) {
      const info = infos[kbId];
      const resolvedKbId = String(info?.id || info?.kb_id || kbId).trim();
      const resolvedKbName = String(info?.name || info?.kb_name || "").trim();
      if (!resolvedKbId || !resolvedKbName) continue;
      result.push({
        kbId: resolvedKbId,
        kbName: resolvedKbName,
        description: typeof info.description === "string" ? info.description.trim() || null : null,
        contentCount: parseContentCount(info.content_count) ?? parseCountFromDescription(info.description),
      });
    }
  }
  return result;
}

export async function listKnowledgeBases(creds: ImaCreds) {
  const basicRows: Array<{ kbId: string; kbName: string }> = [];
  let cursor = "";
  let page = 0;

  while (page < 20) {
    const data = await imaRequest<ImaKnowledgeBaseSearchData>("openapi/wiki/v1/search_knowledge_base", {
      query: "",
      cursor,
      limit: 20,
    }, creds);
    for (const item of data.info_list ?? []) {
      const kbId = String(item.id || item.kb_id || "").trim();
      const kbName = String(item.name || item.kb_name || "").trim();
      if (kbId && kbName) {
        basicRows.push({ kbId, kbName });
      }
    }
    if (data.is_end) break;
    cursor = String(data.next_cursor || "");
    if (!cursor) break;
    page += 1;
  }

  const details = await getKnowledgeBaseInfo(creds, basicRows.map((item) => item.kbId));
  const detailMap = new Map(details.map((item) => [item.kbId, item]));
  return basicRows.map((item) => detailMap.get(item.kbId) ?? {
    kbId: item.kbId,
    kbName: item.kbName,
    description: null,
    contentCount: null,
  });
}

export async function searchKnowledge(
  creds: ImaCreds,
  kbId: string,
  query: string,
  cursor = "",
) {
  const data = await imaRequest<ImaSearchKnowledgeData>("openapi/wiki/v1/search_knowledge", {
    query,
    cursor,
    knowledge_base_id: kbId,
  }, creds);
  return {
    items: (data.info_list ?? []).map((item) => ({
      mediaId: String(item.media_id || "").trim(),
      title: String(item.title || "").trim(),
      parentFolderId: String(item.parent_folder_id || "").trim() || null,
      sourceUrl:
        typeof item.web_info?.url === "string"
          ? item.web_info.url.trim() || null
          : typeof item.web_info?.content_id === "string"
            ? item.web_info.content_id.trim() || null
            : typeof item.url === "string"
              ? item.url.trim() || null
              : typeof item.content_id === "string"
                ? item.content_id.trim() || null
                : null,
      highlightContent: String(item.highlight_content || "").trim(),
    })).filter((item) => item.mediaId && item.title),
    nextCursor: String(data.next_cursor || ""),
    isEnd: Boolean(data.is_end),
  };
}
