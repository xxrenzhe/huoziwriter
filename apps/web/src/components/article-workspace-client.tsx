"use client";

import {
  disableWechatConnectionAction,
  generateCoverImageAction,
  listWechatConnectionsAction,
  listWechatSyncLogsAction,
  refreshKnowledgeCardAction,
  selectCoverCandidateAction,
  upsertWechatConnectionAction,
} from "@/app/(writer)/writer-actions";
import { Button, Input, Select, Textarea } from "@huoziwriter/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, type ReactNode, startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewSeriesPlaybook } from "@/lib/article-outcomes";
import { analyzeAiNoise } from "@/lib/ai-noise-scan";
import { buildSuggestedEvidenceItems, formatEvidenceResearchTagLabel, formatEvidenceRoleLabel, getArticleEvidenceStats } from "@/lib/article-evidence";
import { getResearchBriefGenerationGate } from "@/lib/article-research";
import { formatArticleStatusLabel, normalizeArticleStatus } from "@/lib/article-status-label";
import {
  ARTICLE_HUMAN_SIGNAL_FIELD_LABELS,
  ARTICLE_STRATEGY_FIELD_LABELS,
  getHumanSignalCompletion,
  getHumanSignalScore,
  getStrategyCardCompletion,
  getStrategyCardMissingFields,
} from "@/lib/article-strategy";
import type { ImageAuthoringStyleContext } from "@/lib/image-authoring-context";
import { buildNodeVisualSuggestion, buildVisualSuggestion } from "@/lib/image-prompting";
import { collectLanguageGuardHits, type LanguageGuardHit, type LanguageGuardRule } from "@/lib/language-guard-core";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { summarizeTemplateRenderConfig } from "@/lib/template-rendering";
import {
  ARTICLE_MAIN_STEP_DEFINITIONS,
  getArticleMainStepDefinitionByStageCode,
  type ArticleMainStepCode,
} from "@/lib/article-workflow-registry";
import { buildWritingDiversityReport } from "@/lib/writing-diversity";
import { buildWritingQualityPanel } from "@/lib/writing-quality";
import type { ArticleStatus } from "@/lib/domain";
import { ArticleOutlineClient } from "./article-outline-client";
import { useCommandMenu } from "./command-menu";
import { WechatNativePreview } from "./wechat-native-preview";
import { SentenceRhythmMap } from "./sentence-rhythm-map";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type EditorialAnnotation = {
  id: string;
  anchorId: string;
  order: number;
  ruleId: string;
  ruleKind: LanguageGuardHit["ruleKind"];
  severity: LanguageGuardHit["severity"];
  scope: LanguageGuardHit["scope"];
  matchedText: string;
  patternText: string;
  rewriteHint: string | null;
  count: number;
  sampleContext: string;
};

const ARTICLE_AUTOSAVE_DEBOUNCE_MS = 500;

function buildEditorialAnnotationAnchorId(order: number) {
  return `editorial-annotation-${order}`;
}

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

function buildEditorialReview(markdown: string, hits: LanguageGuardHit[]) {
  const text = String(markdown || "");
  if (!text.trim() || hits.length === 0) {
    return {
      html: escapeHtml(text),
      annotations: [] as EditorialAnnotation[],
    };
  }

  const ranges: Array<{
    start: number;
    end: number;
    annotationId: string;
    anchorId: string;
    order: number;
    severity: LanguageGuardHit["severity"];
    isPrimary: boolean;
  }> = [];
  const annotations: EditorialAnnotation[] = [];
  const sortedHits = [...hits]
    .map((hit) => ({
      ...hit,
      matched: String(hit.matchedText || hit.patternText || "").trim(),
    }))
    .filter((hit) => hit.matched)
    .sort((left, right) => right.matched.length - left.matched.length);

  function overlaps(start: number, end: number) {
    return ranges.some((range) => start < range.end && end > range.start);
  }

  function buildContext(start: number, end: number) {
    const prefix = text.slice(Math.max(0, start - 18), start).trimStart();
    const suffix = text.slice(end, Math.min(text.length, end + 24)).trimEnd();
    return `${prefix}${prefix ? "" : ""}${text.slice(start, end)}${suffix}`;
  }

  sortedHits.forEach((hit, index) => {
    const annotationId = `${hit.ruleId}-${index}`;
    const anchorId = buildEditorialAnnotationAnchorId(index + 1);
    let count = 0;
    let searchIndex = 0;
    let sampleContext = hit.matched;

    while (searchIndex < text.length) {
      const foundAt = text.indexOf(hit.matched, searchIndex);
      if (foundAt === -1) {
        break;
      }
      const rangeEnd = foundAt + hit.matched.length;
      if (!overlaps(foundAt, rangeEnd)) {
        count += 1;
        if (count === 1) {
          sampleContext = buildContext(foundAt, rangeEnd);
        }
        ranges.push({
          start: foundAt,
          end: rangeEnd,
          annotationId,
          anchorId,
          order: index + 1,
          severity: hit.severity,
          isPrimary: count === 1,
        });
      }
      searchIndex = rangeEnd;
    }

    if (count > 0) {
      annotations.push({
        id: annotationId,
        anchorId,
        order: index + 1,
        ruleId: hit.ruleId,
        ruleKind: hit.ruleKind,
        severity: hit.severity,
        scope: hit.scope,
        matchedText: hit.matched,
        patternText: hit.patternText,
        rewriteHint: hit.rewriteHint,
        count,
        sampleContext,
      });
    }
  });

  if (ranges.length === 0) {
    return {
      html: escapeHtml(text),
      annotations,
    };
  }

  const orderedRanges = ranges.sort((left, right) => left.start - right.start);
  let html = "";
  let cursor = 0;
  for (const range of orderedRanges) {
    html += escapeHtml(text.slice(cursor, range.start));
    const matchedText = escapeHtml(text.slice(range.start, range.end));
    const tone =
      range.severity === "high"
        ? "color:rgb(127,29,29);background:rgba(167,48,50,0.10);text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:rgb(167,48,50);text-decoration-thickness:1.5px;box-shadow:inset 0 -1px 0 rgba(167,48,50,0.18);"
        : "color:rgb(125,100,48);background:rgba(196,138,58,0.14);text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:rgb(196,138,58);text-decoration-thickness:1.5px;";
    const primaryAttrs = range.isPrimary
      ? ` id="${range.anchorId}" tabindex="-1"`
      : "";
    html += `<span data-annotation-id="${range.annotationId}"${primaryAttrs} style="${tone}">${matchedText}<sup style="margin-left:2px;color:${range.severity === "high" ? "rgb(167,48,50)" : "rgb(138,101,30)"};font-size:10px;font-weight:700;">${range.order}</sup></span>`;
    cursor = range.end;
  }
  html += escapeHtml(text.slice(cursor));

  return {
    html,
    annotations,
  };
}

function refreshRouter(router: ReturnType<typeof useRouter>) {
  startTransition(() => {
    router.refresh();
  });
}

async function parseResponseMessage(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text || "请求失败";
  }
}

async function parseResponsePayload(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      data?: Record<string, unknown>;
    };
    return {
      message: json.message || json.error || text || "请求失败",
      data: json.data,
    };
  } catch {
    return {
      message: text || "请求失败",
      data: null as Record<string, unknown> | null,
    };
  }
}

function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function getRecordNumber(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordString(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getRecordStringArray(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function getStrategyDraftValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildStrategyCardItem(input: {
  base?: Partial<StrategyCardItem> | null;
  targetReader: string;
  coreAssertion: string;
  whyNow: string;
  researchHypothesis: string;
  marketPositionInsight: string;
  historicalTurningPoint: string;
  targetPackage: string;
  publishWindow: string;
  endingAction: string;
  firstHandObservation: string;
  feltMoment: string;
  whyThisHitMe: string;
  realSceneOrDialogue: string;
  wantToComplain: string;
  nonDelegableTruth: string;
  whyNowHints?: string[];
}) {
  const targetReader = getStrategyDraftValue(input.targetReader);
  const coreAssertion = getStrategyDraftValue(input.coreAssertion);
  const whyNow = getStrategyDraftValue(input.whyNow);
  const researchHypothesis = getStrategyDraftValue(input.researchHypothesis);
  const marketPositionInsight = getStrategyDraftValue(input.marketPositionInsight);
  const historicalTurningPoint = getStrategyDraftValue(input.historicalTurningPoint);
  const targetPackage = getStrategyDraftValue(input.targetPackage);
  const publishWindow = getStrategyDraftValue(input.publishWindow);
  const endingAction = getStrategyDraftValue(input.endingAction);
  const firstHandObservation = getStrategyDraftValue(input.firstHandObservation);
  const feltMoment = getStrategyDraftValue(input.feltMoment);
  const whyThisHitMe = getStrategyDraftValue(input.whyThisHitMe);
  const realSceneOrDialogue = getStrategyDraftValue(input.realSceneOrDialogue);
  const wantToComplain = getStrategyDraftValue(input.wantToComplain);
  const nonDelegableTruth = getStrategyDraftValue(input.nonDelegableTruth);
  const completion = getStrategyCardCompletion({
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
  });
  const humanSignalCompletion = getHumanSignalCompletion({
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
  });

  return {
    id: Number(input.base?.id || 0),
    articleId: Number(input.base?.articleId || 0),
    userId: Number(input.base?.userId || 0),
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
    createdAt: input.base?.createdAt || new Date().toISOString(),
    updatedAt: input.base?.updatedAt || new Date().toISOString(),
    completion,
    humanSignalCompletion,
    humanSignalScore: getHumanSignalScore({
      firstHandObservation,
      feltMoment,
      whyThisHitMe,
      realSceneOrDialogue,
      wantToComplain,
      nonDelegableTruth,
    }),
    whyNowHints: input.whyNowHints ?? input.base?.whyNowHints ?? [],
  } satisfies StrategyCardItem;
}

function buildEvidenceItemSignature(item: Partial<EvidenceItem>) {
  return JSON.stringify({
    fragmentId: Number(item.fragmentId || 0) || 0,
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getStrategyDraftValue(item.claim),
    title: getStrategyDraftValue(item.title),
    excerpt: getStrategyDraftValue(item.excerpt),
    sourceType: getStrategyDraftValue(item.sourceType),
    sourceUrl: getStrategyDraftValue(item.sourceUrl),
    screenshotPath: getStrategyDraftValue(item.screenshotPath),
    usageMode: getStrategyDraftValue(item.usageMode),
    rationale: getStrategyDraftValue(item.rationale),
    researchTag: getStrategyDraftValue(item.researchTag),
    evidenceRole: getStrategyDraftValue(item.evidenceRole),
  });
}

export function WechatConnectionsManager({
  connections,
  canManage,
  planName,
}: {
  connections: Array<{
    id: number;
    accountName: string | null;
    originalId: string | null;
    status: string;
    isDefault: boolean;
    accessTokenExpiresAt: string | null;
    updatedAt: string;
  }>;
  canManage: boolean;
  planName: string;
}) {
  const router = useRouter();
  const displayPlanName = formatPlanDisplayName(planName);
  const [accountName, setAccountName] = useState("");
  const [originalId, setOriginalId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [switchingDefaultId, setSwitchingDefaultId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const defaultConnection = connections.find((connection) => connection.isDefault) ?? null;

  function resetForm() {
    setAccountName("");
    setOriginalId("");
    setAppId("");
    setAppSecret("");
    setIsDefault(true);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持绑定微信公众号。升级到 Pro 或更高套餐后，才可新增连接并推送到微信草稿箱。`);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await upsertWechatConnectionAction({
        connectionId: editingId,
        accountName,
        originalId,
        appId: appId || undefined,
        appSecret: appSecret || undefined,
        isDefault,
      });
    } catch (error) {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : "公众号连接失败");
      return;
    }
    setLoading(false);
    resetForm();
    setMessage(editingId ? "公众号连接已更新" : "公众号连接已创建");
    refreshRouter(router);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("确定要删除吗？")) return;

    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持管理微信公众号连接。`);
      return;
    }
    try {
      await disableWechatConnectionAction(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除公众号连接失败");
      return;
    }
    refreshRouter(router);
  }

  function handleEdit(connection: (typeof connections)[number]) {
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持编辑微信公众号连接。`);
      return;
    }
    setEditingId(connection.id);
    setAccountName(connection.accountName || "");
    setOriginalId(connection.originalId || "");
    setAppId("");
    setAppSecret("");
    setIsDefault(connection.isDefault);
    setMessage("如只修改名称、原始 ID 或默认状态，可直接保存；只有轮换密钥时才需要重新填写 AppID / AppSecret。");
  }

  async function handleSetDefault(connection: (typeof connections)[number]) {
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持切换默认公众号。`);
      return;
    }
    setSwitchingDefaultId(connection.id);
    setMessage("");
    try {
      await upsertWechatConnectionAction({
        connectionId: connection.id,
        accountName: connection.accountName ?? undefined,
        originalId: connection.originalId ?? undefined,
        isDefault: true,
      });
    } catch (error) {
      setSwitchingDefaultId(null);
      setMessage(error instanceof Error ? error.message : "切换默认公众号失败");
      return;
    }
    setSwitchingDefaultId(null);
    setMessage(`已将 ${connection.accountName || `连接 ${connection.id}`} 设为默认公众号`);
    refreshRouter(router);
  }

  return (
    <div className="space-y-6">
      {!canManage ? (
        <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          {displayPlanName}当前不开放微信公众号授权。你仍可继续写作、导出 Markdown，并在升级到 Pro 或更高套餐后解锁公众号连接和草稿箱推送。
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-lineStrong/40 bg-paperStrong p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">授权说明</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
            <div>这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取访问令牌。</div>
            <div>编辑器发布区默认优先使用“默认连接”，也可以临时切换到其他已授权公众号。</div>
            <div>如果你只是改名称、原始 ID 或默认状态，不必重复填写密钥。</div>
          </div>
        </div>
        <div className="border border-lineStrong/40 bg-surface p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前默认连接</div>
          {defaultConnection ? (
            <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
              <div className="font-serifCn text-2xl text-ink text-balance">{defaultConnection.accountName || "未命名公众号"}</div>
              <div>原始 ID：{defaultConnection.originalId || "未填写"}</div>
              <div>状态：{formatConnectionStatus(defaultConnection.status)}</div>
              <div>{defaultConnection.accessTokenExpiresAt ? `访问令牌到期：${new Date(defaultConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录访问令牌到期时间"}</div>
            </div>
          ) : (
            <div className="mt-3 text-sm leading-7 text-inkMuted">当前还没有默认公众号。新增连接后可直接设为默认。</div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 border border-lineStrong/40 bg-surface p-5 shadow-ink">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">{editingId ? "编辑公众号连接" : "新增公众号连接"}</div>
          {editingId ? (
            <Button
              type="button"
              onClick={resetForm}
              variant="secondary"
              size="sm"
            >
              取消编辑
            </Button>
          ) : null}
        </div>
        <Input aria-label="公众号名称" value={accountName} disabled={!canManage} onChange={(event) => setAccountName(event.target.value)} placeholder="公众号名称" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="原始 ID" value={originalId} disabled={!canManage} onChange={(event) => setOriginalId(event.target.value)} placeholder="原始 ID" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="公众号 AppID" value={appId} disabled={!canManage} onChange={(event) => setAppId(event.target.value)} placeholder="公众号 AppID" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="input control" value={appSecret} disabled={!canManage} onChange={(event) => setAppSecret(event.target.value)} placeholder={editingId ? "公众号 AppSecret（仅轮换密钥时填写）" : "公众号 AppSecret"} type="password" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <label className="flex items-center gap-3 border border-lineStrong px-4 py-3 text-sm text-inkSoft">
          <input aria-label="input control" type="checkbox" checked={isDefault} disabled={!canManage} onChange={(event) => setIsDefault(event.target.checked)} />
          保存后设为默认公众号
        </label>
        <Button type="submit" disabled={loading || !canManage} variant="primary">
          {!canManage ? "当前套餐不可绑定公众号" : loading ? (editingId ? "更新中…" : "校验中…") : editingId ? "保存公众号连接" : "添加公众号连接"}
        </Button>
      </form>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
      <div className="space-y-3">
        {connections.map((connection) => (
          <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border border-lineStrong/40 bg-surface p-4">
            <div>
              <div className="font-serifCn text-xl text-ink">{connection.accountName || "未命名公众号"}</div>
              <div className="mt-1 text-sm text-inkSoft">
                状态：{formatConnectionStatus(connection.status)}
                {connection.isDefault ? " · 默认连接" : ""}
                {connection.accessTokenExpiresAt ? ` · 访问令牌到期 ${new Date(connection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : ""}
              </div>
              <div className="mt-1 text-xs text-inkMuted">
                原始 ID：{connection.originalId || "未填写"} · 更新于 {new Date(connection.updatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!connection.isDefault ? (
                <Button
                  type="button"
                  onClick={() => handleSetDefault(connection)}
                  disabled={switchingDefaultId === connection.id || !canManage}
                  variant="secondary"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {switchingDefaultId === connection.id ? "切换中…" : "设为默认"}
                </Button>
              ) : null}
              <Button type="button" onClick={() => handleEdit(connection)} disabled={!canManage} variant="secondary">
                编辑
              </Button>
              <Button type="button" onClick={() => handleDelete(connection.id)} disabled={!canManage} variant="secondary">
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type SnapshotMeta = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type DiffState = {
  snapshotId: number;
  snapshotNote: string | null;
  createdAt: string;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  lines: Array<{ type: "added" | "removed" | "unchanged"; content: string }>;
} | null;

type KnowledgeCardPanelItem = {
  id: number;
  userId: number;
  ownerUsername: string | null;
  shared: boolean;
  cardType: string;
  title: string;
  summary: string | null;
  latestChangeSummary: string | null;
  overturnedJudgements: string[];
  keyFacts: string[];
  openQuestions: string[];
  conflictFlags: string[];
  sourceFragmentIds: number[];
  relatedCardIds: number[];
  relatedCards: Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number; summary: string | null; shared: boolean; ownerUsername: string | null; linkType: string }>;
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  relevanceScore: number;
  matchedFragmentCount: number;
};

type RecentSyncLogItem = {
  id: number;
  articleId?: number;
  connectionName: string | null;
  mediaId: string | null;
  status: string;
  failureReason: string | null;
  failureCode: string | null;
  retryCount: number;
  articleVersionHash: string | null;
  templateId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  requestSummary: string | Record<string, unknown> | null;
  responseSummary: string | Record<string, unknown> | null;
};

type ArticleOutcomeItem = {
  id: number;
  articleId: number;
  userId: number;
  targetPackage: string | null;
  scorecard: Record<string, unknown>;
  hitStatus: "pending" | "hit" | "near_miss" | "miss";
  reviewSummary: string | null;
  nextAction: string | null;
  playbookTags: string[];
  createdAt: string;
  updatedAt: string;
} | null;

type ArticleOutcomeSnapshotItem = {
  id: number;
  outcomeId: number;
  articleId: number;
  userId: number;
  windowCode: "24h" | "72h" | "7d";
  readCount: number;
  shareCount: number;
  likeCount: number;
  notes: string | null;
  writingStateFeedback: {
    recommendedPrototypeCode: string | null;
    recommendedPrototypeLabel: string | null;
    adoptedPrototypeCode: string | null;
    adoptedPrototypeLabel: string | null;
    followedPrototypeRecommendation: boolean | null;
    recommendedVariantCode: string | null;
    recommendedVariantLabel: string | null;
    adoptedVariantCode: string | null;
    adoptedVariantLabel: string | null;
    followedRecommendation: boolean | null;
    recommendedOpeningPatternLabel: string | null;
    recommendedSyntaxPatternLabel: string | null;
    recommendedEndingPatternLabel: string | null;
    adoptedOpeningPatternLabel: string | null;
    adoptedSyntaxPatternLabel: string | null;
    adoptedEndingPatternLabel: string | null;
    followedPatternRecommendation: boolean | null;
    availableVariantCount: number;
    comparisonSampleCount: number;
    recommendationReason: string | null;
    adoptedReason: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type ArticleOutcomeBundleItem = {
  outcome: ArticleOutcomeItem;
  snapshots: ArticleOutcomeSnapshotItem[];
  completedWindowCodes: Array<"24h" | "72h" | "7d">;
  missingWindowCodes: Array<"24h" | "72h" | "7d">;
  nextWindowCode: "24h" | "72h" | "7d" | null;
};

type StrategyCardItem = {
  id: number;
  articleId: number;
  userId: number;
  targetReader: string | null;
  coreAssertion: string | null;
  whyNow: string | null;
  researchHypothesis: string | null;
  marketPositionInsight: string | null;
  historicalTurningPoint: string | null;
  targetPackage: string | null;
  publishWindow: string | null;
  endingAction: string | null;
  firstHandObservation: string | null;
  feltMoment: string | null;
  whyThisHitMe: string | null;
  realSceneOrDialogue: string | null;
  wantToComplain: string | null;
  nonDelegableTruth: string | null;
  createdAt: string;
  updatedAt: string;
  completion: {
    targetReader: boolean;
    coreAssertion: boolean;
    whyNow: boolean;
    targetPackage: boolean;
    publishWindow: boolean;
    endingAction: boolean;
  };
  humanSignalCompletion: {
    firstHandObservation: boolean;
    feltMoment: boolean;
    whyThisHitMe: boolean;
    realSceneOrDialogue: boolean;
    wantToComplain: boolean;
    nonDelegableTruth: boolean;
  };
  humanSignalScore: number;
  whyNowHints: string[];
};

type EvidenceItem = {
  id: number;
  articleId: number;
  userId: number;
  fragmentId: number | null;
  nodeId: number | null;
  claim: string | null;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  usageMode: string | null;
  rationale: string | null;
  researchTag: string | null;
  evidenceRole: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type SeriesOptionItem = {
  id: number;
  name: string;
  personaName: string;
  thesis: string | null;
  targetAudience: string | null;
  activeStatus: string;
};

type SeriesInsightItem = {
  label: string | null;
  reason: string | null;
  commonTerms: string[];
  coreStances: string[];
  driftRisks: string[];
  backgroundChecklist: string[];
  whyNow: string[];
  relatedArticleCount: number;
} | null;

type StageArtifactItem = {
  stageCode: string;
  title: string;
  status: "ready" | "failed";
  summary: string | null;
  payload: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArticleFragmentItem = {
  id: number;
  title?: string | null;
  distilledContent: string;
  sourceType?: string;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string;
  shared?: boolean;
};

type OutlineMaterialNodeItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: ArticleFragmentItem[];
};

type OutlineMaterialsState = {
  supplementalViewpoints: string[];
  nodes: OutlineMaterialNodeItem[];
};

type HistoryReferenceSelectionItem = {
  referencedArticleId: number;
  title: string;
  relationReason: string | null;
  bridgeSentence: string | null;
  sortOrder?: number;
};

type HistoryReferenceSuggestionItem = HistoryReferenceSelectionItem & {
  score?: number;
  seriesLabel?: string | null;
  consistencyHint?: string | null;
};

type AudienceSelectionDraft = {
  selectedReaderLabel: string;
  selectedLanguageGuidance: string;
  selectedBackgroundAwareness: string;
  selectedReadabilityLevel: string;
  selectedCallToAction: string;
};

type OutlineSelectionDraft = {
  selectedTitle: string;
  selectedTitleStyle: string;
  selectedOpeningHook: string;
  selectedTargetEmotion: string;
  selectedEndingStrategy: string;
};

type FactCheckClaimDecision = {
  claim: string;
  action: "keep" | "source" | "soften" | "remove" | "mark_opinion";
  note: string;
};

type FactCheckSelectionDraft = {
  claimDecisions: FactCheckClaimDecision[];
};

type CoverImageCandidateItem = {
  id: number;
  variantLabel: string;
  imageUrl: string;
  prompt: string;
  isSelected: boolean;
  createdAt: string;
};

type ArticleImagePromptItem = {
  id: number;
  articleNodeId: number | null;
  assetType: string;
  title: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

type WechatConnectionItem = {
  id: number;
  accountName: string | null;
  originalId?: string | null;
  status: string;
  isDefault: boolean;
  accessTokenExpiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PublishPreviewState = {
  title: string;
  templateId: string | null;
  templateName: string | null;
  templateVersion: string | null;
  templateOwnerLabel: string | null;
  templateSourceLabel: string | null;
  templateSummary: string[];
  finalHtml: string;
  finalHtmlHash: string | null;
  savedHtmlHash: string | null;
  isConsistentWithSavedHtml: boolean;
  mismatchWarnings: string[];
  publishGuard: {
    canPublish: boolean;
    blockers: string[];
    warnings: string[];
    suggestions: string[];
    checks: Array<{
      key: string;
      label: string;
      status: "passed" | "warning" | "blocked";
      severity: "blocking" | "warning" | "suggestion";
      detail: string;
      targetStageCode?: string;
      actionLabel?: string;
    }>;
    stageReadiness: Array<{
      stageCode: string;
      title: string;
      status: "ready" | "needs_attention" | "blocked";
      detail: string;
    }>;
    aiNoise: {
      score: number;
      level: string;
      findings: string[];
      suggestions: string[];
    };
    qualityPanel: ReturnType<typeof buildWritingQualityPanel>;
    materialReadiness: {
      attachedFragmentCount: number;
      uniqueSourceTypeCount: number;
      screenshotCount: number;
    };
    connectionHealth: {
      connectionName: string | null;
      status: string;
      detail: string;
      tokenExpiresAt: string | null;
    };
    latestAttempt: {
      status: string;
      createdAt: string;
      failureReason: string | null;
      failureCode: string | null;
      retryCount: number;
      mediaId: string | null;
    } | null;
  };
  generatedAt: string;
};

type PendingPublishIntent = {
  articleId: number;
  createdAt: string;
  templateId: string | null;
  reason: "missing_connection" | "auth_failed";
};

type ExternalFetchIssueRecord = {
  id: string;
  articleId: number | null;
  context: "fact-check-evidence";
  title: string | null;
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
  createdAt: string;
  resolvedAt: string | null;
  recoveryCount: number;
};

const PENDING_PUBLISH_INTENT_STORAGE_KEY = "huoziwriter.pendingPublishIntent";
const FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX = "huoziwriter.factCheckFetchIssues";
const OUTCOME_WINDOWS: Array<{ code: "24h" | "72h" | "7d"; label: string }> = [
  { code: "24h", label: "24 小时" },
  { code: "72h", label: "72 小时" },
  { code: "7d", label: "7 天" },
];

type AuthoringPhaseCode = "collect" | "think" | "write" | "polish";

const AUTHORING_PHASES: Array<{
  code: AuthoringPhaseCode;
  title: string;
  summary: string;
  supportLabel: string;
  targetStageCode: string;
  defaultView: "workspace" | "edit" | "preview" | "audit";
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

const GENERATABLE_STAGE_ACTIONS: Record<string, { label: string; helper: string }> = {
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

function getPayloadStringArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function getPayloadRecordArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getPayloadRecord(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatPublishFailureCode(code: string | null | undefined) {
  if (!code) return "未分类";
  if (code === "auth_failed") return "凭证失败";
  if (code === "media_failed") return "媒体素材失败";
  if (code === "rate_limited") return "频率限制";
  if (code === "content_invalid") return "内容格式问题";
  return "上游异常";
}

function formatConnectionStatus(status: string | null | undefined) {
  if (status === "valid") return "可发布";
  if (status === "expired") return "待刷新";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

function formatAiNoiseLevel(level: string | null | undefined) {
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return level || "未知";
}

function formatPublishStageStatus(status: "ready" | "needs_attention" | "blocked") {
  if (status === "ready") return "已就绪";
  if (status === "blocked") return "阻断";
  return "待处理";
}

function formatStageChecklistStatus(status: "ready" | "needs_attention" | "blocked") {
  if (status === "ready") return "已完成";
  if (status === "blocked") return "阻断项";
  return "待补充";
}

function formatWritingQualityStatus(status: "ready" | "needs_attention" | "blocked") {
  if (status === "ready") return "通过";
  if (status === "blocked") return "阻断";
  return "需关注";
}

function getWeakestWritingQualityLayerSummary(panel: { weakestLayerCode: string | null; layers: Array<{ code: string; title: string; status: "ready" | "needs_attention" | "blocked"; suggestions: string[]; summary: string }> }) {
  const weakestLayer = panel.layers.find((item) => item.code === panel.weakestLayerCode) ?? null;
  if (!weakestLayer) {
    return null;
  }
  return {
    title: weakestLayer.title,
    status: weakestLayer.status,
    suggestion: weakestLayer.suggestions[0] || weakestLayer.summary,
  };
}

function formatDeepWritingHistoryAdjustment(value: number | null | undefined) {
  const adjustment = Number(value || 0);
  if (!Number.isFinite(adjustment) || adjustment === 0) {
    return "";
  }
  return adjustment < 0 ? "本次轻度加权" : "本次降权观察";
}

function getDeepWritingHistorySignalSummary(signal: Record<string, unknown> | null | undefined) {
  const sampleCount = getRecordNumber(signal, "sampleCount") ?? 0;
  if (sampleCount <= 0) {
    return "";
  }
  const hitCount = getRecordNumber(signal, "hitCount") ?? 0;
  const nearMissCount = getRecordNumber(signal, "nearMissCount") ?? 0;
  const missCount = getRecordNumber(signal, "missCount") ?? 0;
  const adjustmentLabel = formatDeepWritingHistoryAdjustment(getRecordNumber(signal, "rankingAdjustment"));
  return [
    `历史样本 ${sampleCount} 篇`,
    hitCount > 0 ? `命中 ${hitCount}` : "",
    nearMissCount > 0 ? `接近命中 ${nearMissCount}` : "",
    missCount > 0 ? `未达目标 ${missCount}` : "",
    adjustmentLabel,
  ].filter(Boolean).join(" · ");
}

function formatResearchStepSummaryStatus(status: "ready" | "needs_attention" | "blocked") {
  if (status === "ready") return "研究已就位";
  if (status === "blocked") return "研究阻断";
  return "研究待补";
}

function formatViewpointAction(action: string) {
  if (action === "adopted") return "已采纳";
  if (action === "softened") return "已弱化";
  if (action === "deferred") return "暂缓采用";
  if (action === "conflicted") return "判定冲突";
  return action || "未说明";
}

function getAudienceSelectionDraft(payload: Record<string, unknown> | null | undefined): AudienceSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedReaderLabel: String(selection?.selectedReaderLabel || "").trim(),
    selectedLanguageGuidance: String(selection?.selectedLanguageGuidance || "").trim(),
    selectedBackgroundAwareness: String(selection?.selectedBackgroundAwareness || "").trim(),
    selectedReadabilityLevel: String(selection?.selectedReadabilityLevel || "").trim(),
    selectedCallToAction: String(selection?.selectedCallToAction || "").trim(),
  };
}

function hydrateAudienceSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: AudienceSelectionDraft,
): AudienceSelectionDraft {
  const readerSegments = getPayloadRecordArray(payload, "readerSegments");
  const languageGuidance = getPayloadStringArray(payload, "languageGuidance");
  const backgroundAwarenessOptions = getPayloadStringArray(payload, "backgroundAwarenessOptions");
  const readabilityOptions = getPayloadStringArray(payload, "readabilityOptions");
  const recommendedCallToAction = String(payload?.recommendedCallToAction || "").trim();

  return {
    selectedReaderLabel: draft.selectedReaderLabel || String(readerSegments[0]?.label || "").trim(),
    selectedLanguageGuidance: draft.selectedLanguageGuidance || languageGuidance[0] || "",
    selectedBackgroundAwareness: draft.selectedBackgroundAwareness || backgroundAwarenessOptions[0] || "",
    selectedReadabilityLevel: draft.selectedReadabilityLevel || readabilityOptions[0] || "",
    selectedCallToAction: draft.selectedCallToAction || recommendedCallToAction,
  };
}

function getOutlineSelectionDraft(payload: Record<string, unknown> | null | undefined): OutlineSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedTitle: String(selection?.selectedTitle || "").trim(),
    selectedTitleStyle: String(selection?.selectedTitleStyle || "").trim(),
    selectedOpeningHook: String(selection?.selectedOpeningHook || "").trim(),
    selectedTargetEmotion: String(selection?.selectedTargetEmotion || "").trim(),
    selectedEndingStrategy: String(selection?.selectedEndingStrategy || "").trim(),
  };
}

function hydrateOutlineSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: OutlineSelectionDraft,
): OutlineSelectionDraft {
  const titleOptions = getPayloadRecordArray(payload, "titleOptions");
  const workingTitle = String(payload?.workingTitle || "").trim();
  const selectedTitleOption = titleOptions.find(
    (item) => String(item.title || "").trim() === draft.selectedTitle,
  );
  const openingHook = String(payload?.openingHook || "").trim();
  const openingHookOptions = getPayloadStringArray(payload, "openingHookOptions");
  const targetEmotion = String(payload?.targetEmotion || "").trim();
  const targetEmotionOptions = getPayloadStringArray(payload, "targetEmotionOptions");
  const endingStrategy = String(payload?.endingStrategy || "").trim();
  const endingStrategyOptions = getPayloadStringArray(payload, "endingStrategyOptions");

  return {
    selectedTitle: draft.selectedTitle || String(titleOptions[0]?.title || "").trim() || workingTitle,
    selectedTitleStyle:
      draft.selectedTitleStyle
      || String(selectedTitleOption?.styleLabel || "").trim()
      || String(titleOptions[0]?.styleLabel || "").trim(),
    selectedOpeningHook: draft.selectedOpeningHook || openingHook || openingHookOptions[0] || "",
    selectedTargetEmotion: draft.selectedTargetEmotion || targetEmotion || targetEmotionOptions[0] || "",
    selectedEndingStrategy: draft.selectedEndingStrategy || endingStrategy || endingStrategyOptions[0] || "",
  };
}

function getDefaultFactCheckAction(status: string): FactCheckClaimDecision["action"] {
  if (status === "needs_source") return "source";
  if (status === "risky") return "soften";
  if (status === "opinion") return "mark_opinion";
  return "keep";
}

function getFactCheckSelectionDraft(payload: Record<string, unknown> | null | undefined): FactCheckSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  const existingDecisions = Array.isArray(selection?.claimDecisions)
    ? selection.claimDecisions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          claim: String(item.claim || "").trim(),
          action: String(item.action || "").trim() as FactCheckClaimDecision["action"],
          note: String(item.note || "").trim(),
        }))
        .filter((item) => item.claim)
    : [];
  const existingMap = new Map(existingDecisions.map((item) => [item.claim, item]));
  const checks = getPayloadRecordArray(payload, "checks");
  const claimDecisions = checks
    .map((item) => {
      const claim = String(item.claim || "").trim();
      if (!claim) {
        return null;
      }
      const status = String(item.status || "").trim();
      const existing = existingMap.get(claim);
      return {
        claim,
        action: existing?.action || getDefaultFactCheckAction(status),
        note: existing?.note || "",
      } satisfies FactCheckClaimDecision;
    })
    .filter(Boolean) as FactCheckClaimDecision[];
  return { claimDecisions };
}

function getFactCheckDecision(
  draft: FactCheckSelectionDraft,
  claim: string,
  status: string,
): FactCheckClaimDecision {
  const normalizedClaim = String(claim || "").trim();
  return (
    draft.claimDecisions.find((item) => item.claim === normalizedClaim) ?? {
      claim: normalizedClaim,
      action: getDefaultFactCheckAction(status),
      note: "",
    }
  );
}

function getFactCheckActionOptions(status: string) {
  if (status === "needs_source") {
    return [
      { value: "source", label: "补来源锚点" },
      { value: "soften", label: "改判断语气" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "risky") {
    return [
      { value: "soften", label: "保守改写" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "opinion") {
    return [
      { value: "mark_opinion", label: "明确为观点" },
      { value: "keep", label: "保持原样" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  return [
    { value: "keep", label: "保持原样" },
    { value: "source", label: "补来源锚点" },
  ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
}

function formatFactCheckActionLabel(action: string) {
  if (action === "source") return "补来源锚点";
  if (action === "soften") return "改判断语气";
  if (action === "remove") return "删除该表述";
  if (action === "mark_opinion") return "明确为观点";
  return "保持原样";
}

function formatFactCheckStatusLabel(status: string) {
  if (status === "needs_source") return "需补来源";
  if (status === "risky") return "高风险";
  if (status === "opinion") return "观点表达";
  if (status === "verified") return "已核实";
  return status || "待确认";
}

function readPendingPublishIntent(articleId: number): PendingPublishIntent | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingPublishIntent | null;
    const storedArticleId = typeof parsed?.articleId === "number" ? parsed.articleId : null;
    if (!parsed || storedArticleId !== articleId) {
      return null;
    }
    return {
      articleId: storedArticleId,
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      templateId: parsed.templateId ? String(parsed.templateId) : null,
      reason: String((parsed as { reason?: string | null }).reason || "") === "missing_connection" ? "missing_connection" : "auth_failed",
    };
  } catch {
    return null;
  }
}

function buildFactCheckFetchIssuesStorageKey(articleId: number) {
  return `${FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX}.${articleId}`;
}

function normalizeExternalFetchIssueRecord(
  value: unknown,
  expectedContext: ExternalFetchIssueRecord["context"],
  articleId?: number | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const url = String(item.url || "").trim();
  const degradedReason = String(item.degradedReason || "").trim();
  if (!url || !degradedReason) {
    return null;
  }
  return {
    id: String(item.id || `${expectedContext}-${url}-${item.createdAt || ""}`),
    articleId:
      articleId === undefined
        ? item.articleId == null
          ? null
          : Number.isInteger(Number(item.articleId))
            ? Number(item.articleId)
            : null
        : articleId,
    context: expectedContext,
    title: item.title ? String(item.title).trim() : null,
    url,
    degradedReason,
    retryRecommended: Boolean(item.retryRecommended),
    createdAt: String(item.createdAt || new Date().toISOString()),
    resolvedAt: item.resolvedAt ? String(item.resolvedAt) : null,
    recoveryCount: Math.max(0, Number(item.recoveryCount || 0) || 0),
  } satisfies ExternalFetchIssueRecord;
}

function readExternalFetchIssues(
  storageKey: string,
  expectedContext: ExternalFetchIssueRecord["context"],
  articleId?: number | null,
) {
  if (typeof window === "undefined") {
    return [] as ExternalFetchIssueRecord[];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [] as ExternalFetchIssueRecord[];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as ExternalFetchIssueRecord[];
    }
    return parsed
      .map((item) => normalizeExternalFetchIssueRecord(item, expectedContext, articleId))
      .filter((item): item is ExternalFetchIssueRecord => Boolean(item))
      .slice(0, 8);
  } catch {
    return [] as ExternalFetchIssueRecord[];
  }
}

function writeExternalFetchIssues(storageKey: string, issues: ExternalFetchIssueRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(issues.slice(0, 8)));
}

function prependExternalFetchIssue(
  current: ExternalFetchIssueRecord[],
  next: Omit<ExternalFetchIssueRecord, "id" | "createdAt" | "resolvedAt" | "recoveryCount">,
) {
  const createdAt = new Date().toISOString();
  const issue = {
    ...next,
    id: `${next.context}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    resolvedAt: null,
    recoveryCount: 0,
  } satisfies ExternalFetchIssueRecord;
  return [
    issue,
    ...current.filter((item) => !(item.context === issue.context && item.url === issue.url && item.degradedReason === issue.degradedReason)),
  ].slice(0, 8);
}

function removeExternalFetchIssue(current: ExternalFetchIssueRecord[], issueId: string) {
  return current.filter((item) => item.id !== issueId);
}

function markExternalFetchIssueRecovered(
  current: ExternalFetchIssueRecord[],
  input: { context: ExternalFetchIssueRecord["context"]; url: string },
) {
  let recovered = false;
  const next = current.map((item) => {
    if (recovered || item.context !== input.context || item.url !== input.url) {
      return item;
    }
    recovered = true;
    return {
      ...item,
      resolvedAt: new Date().toISOString(),
      recoveryCount: item.recoveryCount + 1,
    } satisfies ExternalFetchIssueRecord;
  });
  return {
    issues: next,
    recovered,
  };
}

function upsertStageArtifact(items: StageArtifactItem[], next: StageArtifactItem) {
  const filtered = items.filter((item) => item.stageCode !== next.stageCode);
  return [next, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertKnowledgeCard(items: KnowledgeCardPanelItem[], next: KnowledgeCardPanelItem) {
  return [next, ...items.filter((item) => item.id !== next.id)];
}

function reorderKnowledgeCards(items: KnowledgeCardPanelItem[], highlightedId: number | null) {
  if (!highlightedId) {
    return items;
  }
  const highlighted = items.find((item) => item.id === highlightedId);
  if (!highlighted) {
    return items;
  }
  return [highlighted, ...items.filter((item) => item.id !== highlightedId)];
}

function buildHighlightedKnowledgeCard(
  detail: Partial<KnowledgeCardPanelItem> & { id: number; title: string },
  fallback?: KnowledgeCardPanelItem | null,
) {
  return {
    id: detail.id,
    userId: typeof detail.userId === "number" ? detail.userId : fallback?.userId ?? 0,
    ownerUsername: detail.ownerUsername ?? fallback?.ownerUsername ?? null,
    shared: typeof detail.shared === "boolean" ? detail.shared : fallback?.shared ?? false,
    cardType: detail.cardType ?? fallback?.cardType ?? "topic",
    title: detail.title,
    summary: detail.summary ?? fallback?.summary ?? null,
    latestChangeSummary: detail.latestChangeSummary ?? fallback?.latestChangeSummary ?? null,
    overturnedJudgements: Array.isArray(detail.overturnedJudgements) ? detail.overturnedJudgements : fallback?.overturnedJudgements ?? [],
    keyFacts: Array.isArray(detail.keyFacts) ? detail.keyFacts : fallback?.keyFacts ?? [],
    openQuestions: Array.isArray(detail.openQuestions) ? detail.openQuestions : fallback?.openQuestions ?? [],
    conflictFlags: Array.isArray(detail.conflictFlags) ? detail.conflictFlags : fallback?.conflictFlags ?? [],
    sourceFragmentIds: Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds : fallback?.sourceFragmentIds ?? [],
    relatedCardIds: Array.isArray(detail.relatedCardIds) ? detail.relatedCardIds : fallback?.relatedCardIds ?? [],
    relatedCards: Array.isArray(detail.relatedCards) ? detail.relatedCards : fallback?.relatedCards ?? [],
    sourceFragments: Array.isArray(detail.sourceFragments) ? detail.sourceFragments : fallback?.sourceFragments ?? [],
    confidenceScore: typeof detail.confidenceScore === "number" ? detail.confidenceScore : fallback?.confidenceScore ?? 0,
    status: detail.status ?? fallback?.status ?? "draft",
    lastCompiledAt: detail.lastCompiledAt ?? fallback?.lastCompiledAt ?? null,
    relevanceScore: typeof detail.relevanceScore === "number" ? detail.relevanceScore : fallback?.relevanceScore ?? 1,
    matchedFragmentCount:
      typeof detail.matchedFragmentCount === "number"
        ? detail.matchedFragmentCount
        : fallback?.matchedFragmentCount ?? (Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds.length : 0),
  } satisfies KnowledgeCardPanelItem;
}

function formatKnowledgeStatus(status: string) {
  if (status === "active") return "可引用";
  if (status === "stale") return "待刷新";
  if (status === "conflicted") return "有冲突";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

function formatTemplateConfigSummary(template?: { config?: Record<string, unknown> } | null) {
  return summarizeTemplateRenderConfig(template, 7).filter((item) => !item.startsWith("标题密度：") && !item.startsWith("列表："));
}

function formatTemplateAssetOwner(template?: { ownerUserId?: number | null } | null) {
  return template?.ownerUserId == null ? "官方模板库" : "你的个人空间";
}

function formatTemplateSourceSummary(template?: { sourceUrl?: string | null } | null) {
  if (!template?.sourceUrl) {
    return "系统模板库";
  }
  try {
    return new URL(template.sourceUrl).hostname;
  } catch {
    return template.sourceUrl;
  }
}

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatWorkflowStageStatus(status: "pending" | "current" | "completed" | "failed") {
  if (status === "completed") return "已完成";
  if (status === "current") return "进行中";
  if (status === "failed") return "待处理";
  return "待开始";
}

function formatOutcomeHitStatus(status: "pending" | "hit" | "near_miss" | "miss") {
  if (status === "hit") return "已命中";
  if (status === "near_miss") return "差一点命中";
  if (status === "miss") return "未命中";
  return "待判定";
}

type ArticleMainStepStatus = "pending" | "current" | "completed" | "needs_attention";

const ARTICLE_MAIN_STEPS = ARTICLE_MAIN_STEP_DEFINITIONS;

function getArticleMainStepByStageCode(stageCode: string) {
  return getArticleMainStepDefinitionByStageCode(stageCode);
}

function getAuthoringPhaseCode(stepCode: string, stageCode?: string): AuthoringPhaseCode {
  const normalizedStageCode = String(stageCode || "").trim();
  if (["factCheck", "prosePolish", "coverImage", "layout", "publish"].includes(normalizedStageCode)) return "polish";
  if (normalizedStageCode === "deepWriting" || stepCode === "draft") return "write";
  if (["audienceAnalysis", "outlinePlanning"].includes(normalizedStageCode) || stepCode === "strategy") return "think";
  if (stepCode === "publish" || stepCode === "result") return "polish";
  return "collect";
}

function formatArticleMainStepStatus(status: ArticleMainStepStatus) {
  if (status === "completed") return "已完成";
  if (status === "current") return "当前步骤";
  if (status === "needs_attention") return "待处理";
  return "待开始";
}

function formatFactRiskLabel(risk: string) {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  if (risk === "low") return "低风险";
  return risk || "未评估";
}

function formatEvidenceSupportLevel(level: string) {
  if (level === "strong") return "证据较强";
  if (level === "partial") return "证据部分命中";
  if (level === "missing") return "缺少证据";
  return level || "未评估";
}

function formatResearchCoverageSufficiencyLabel(value: string) {
  if (value === "ready") return "研究底座已就位";
  if (value === "limited") return "研究仍有限";
  if (value === "blocked") return "研究覆盖不足";
  return value || "未评估";
}

function formatResearchSupportStatusLabel(value: string) {
  if (value === "enough") return "已支撑";
  if (value === "missing") return "仍缺支撑";
  return value || "未评估";
}

function formatResearchSourceTraceLabel(value: string) {
  if (value === "official") return "官方源";
  if (value === "industry") return "行业源";
  if (value === "comparison") return "同类源";
  if (value === "userVoice") return "用户源";
  if (value === "timeline") return "时间源";
  if (value === "knowledge") return "背景卡";
  if (value === "history") return "历史文章";
  if (value === "url") return "链接源";
  if (value === "screenshot") return "截图源";
  if (value === "manual") return "文本素材";
  return value || "来源";
}

function formatOutlineResearchFocusLabel(value: string) {
  if (value === "timeline") return "时间脉络";
  if (value === "comparison") return "横向比较";
  if (value === "intersection") return "交汇洞察";
  if (value === "support") return "辅助支撑";
  return value || "研究焦点";
}

const RESEARCH_GUARD_CHECK_KEYS = new Set([
  "researchBrief",
  "researchSourceCoverage",
  "researchTimeline",
  "researchComparison",
  "researchIntersection",
  "counterEvidence",
]);

function isResearchGuardCheckKey(value: string) {
  return RESEARCH_GUARD_CHECK_KEYS.has(value);
}

function formatFragmentSourceType(type: string | null | undefined) {
  if (type === "url") return "链接";
  if (type === "screenshot") return "截图";
  return "文本";
}

function formatFragmentUsageMode(mode: string | null | undefined) {
  return mode === "image" ? "原样插图" : "可改写素材";
}

function normalizeOutlineMaterialNode(node: {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: Array<{
    id: number;
    title?: string | null;
    distilledContent: string;
    sourceType?: string;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string;
    shared?: boolean;
  }>;
}): OutlineMaterialNodeItem {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    sortOrder: node.sortOrder,
    fragments: node.fragments.map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
      usageMode: fragment.usageMode,
      shared: fragment.shared,
    })),
  };
}

function getStageApplyButtonLabel(stageCode: string) {
  if (stageCode === "factCheck") {
    return "精修高风险句子";
  }
  if (stageCode === "prosePolish") {
    return "精修句段节奏";
  }
  return "一键应用回正文";
}

function extractPlainText(value: string) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type WorkspaceView = "workspace" | "edit" | "preview" | "audit";

function formatWorkspaceViewLabel(view: WorkspaceView) {
  if (view === "workspace") return "阶段工作台";
  if (view === "preview") return "微信预览";
  if (view === "audit") return "红笔校阅";
  return "稿纸";
}

function getDefaultWorkspaceViewForStageCode(stageCode: string): WorkspaceView {
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

function getDraftStarterOptions(phase: AuthoringPhaseCode, title: string) {
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

function buildBlankSlateInspirationCards(input: {
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

function getAuthoringBlankSlateCopy(input: {
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

function AuthoringBlankSlate({
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

export function ArticleEditorClient({
  article,
  seriesOptions,
  nodes: initialNodes,
  fragments: initialFragments,
  languageGuardRules,
  connections: initialConnections,
  snapshots: initialSnapshots,
  templates,
  recentSyncLogs,
  recentArticles,
  recentDeepWritingStates,
  initialStrategyCard,
  initialEvidenceItems,
  initialOutcomeBundle,
  workflow: initialWorkflow,
  stageArtifacts: initialStageArtifacts,
  knowledgeCards,
  canExportPdf,
  canGenerateCoverImage,
  canUseCoverImageReference,
  canUseHistoryReferences,
  canPublishToWechat,
  planName,
  authoringContext,
  seriesInsight,
  currentSeriesPlaybook,
  coverImageQuota: initialCoverImageQuota,
  imageAssetQuota: initialImageAssetQuota,
  initialCoverImageCandidates,
  initialImagePrompts,
  initialCoverImage,
  requestedMainStepCode,
}: {
  article: { id: number; title: string; markdownContent: string; status: string; htmlContent: string; seriesId: number | null; wechatTemplateId: string | null };
  seriesOptions: SeriesOptionItem[];
  nodes: OutlineMaterialNodeItem[];
  fragments: ArticleFragmentItem[];
  languageGuardRules: LanguageGuardRule[];
  connections: WechatConnectionItem[];
  snapshots: SnapshotMeta[];
  templates: Array<{ id: string; version: string; name: string; description: string | null; meta: string | null; ownerUserId: number | null; sourceUrl: string | null; config?: Record<string, unknown> }>;
  recentSyncLogs: RecentSyncLogItem[];
  recentArticles: Array<{ id: number; title: string; markdownContent: string; updatedAt: string }>;
  recentDeepWritingStates: Array<{ id: number; title: string; updatedAt: string; payload: Record<string, unknown> | null }>;
  initialStrategyCard: StrategyCardItem;
  initialEvidenceItems: EvidenceItem[];
  workflow: {
    currentStageCode: string;
    stages: Array<{ code: string; title: string; status: "pending" | "current" | "completed" | "failed" }>;
    pendingPublishIntent?: PendingPublishIntent | null;
    updatedAt: string;
  };
  stageArtifacts: StageArtifactItem[];
  knowledgeCards: KnowledgeCardPanelItem[];
  canExportPdf: boolean;
  canGenerateCoverImage: boolean;
  canUseCoverImageReference: boolean;
  canUseHistoryReferences: boolean;
  canPublishToWechat: boolean;
  planName: string;
  authoringContext: ImageAuthoringStyleContext | null;
  seriesInsight: SeriesInsightItem;
  currentSeriesPlaybook: ReviewSeriesPlaybook | null;
  coverImageQuota: { used: number; limit: number | null; remaining: number | null };
  imageAssetQuota: {
    usedBytes: number;
    limitBytes: number;
    remainingBytes: number;
    assetRecordCount: number;
    readyAssetRecordCount: number;
    uniqueObjectCount: number;
    reservedGenerationBytes: number;
  };
  initialCoverImageCandidates: CoverImageCandidateItem[];
  initialImagePrompts: ArticleImagePromptItem[];
  initialCoverImage: { imageUrl: string; prompt: string; createdAt: string } | null;
  initialOutcomeBundle: ArticleOutcomeBundleItem;
  requestedMainStepCode?: ArticleMainStepCode | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, focusMode: isFocusMode, toggleTheme, toggleFocusMode } = useCommandMenu();
  const displayPlanName = formatPlanDisplayName(planName);
  const [title, setTitle] = useState(article.title);
  const [markdown, setMarkdown] = useState(article.markdownContent);
  const [htmlPreview, setHtmlPreview] = useState(article.htmlContent);
  const [status, setStatus] = useState<ArticleStatus | "generating">(() => normalizeArticleStatus(article.status));
  const [seriesId, setSeriesId] = useState<number | null>(article.seriesId ?? (seriesOptions.length === 1 ? seriesOptions[0].id : null));
  const [wechatTemplateId, setWechatTemplateId] = useState<string | null>(article.wechatTemplateId);
  const [nodes, setNodes] = useState(initialNodes);
  const [fragmentPool, setFragmentPool] = useState(initialFragments);
  const [wechatConnections, setWechatConnections] = useState(initialConnections);
  const [syncLogs, setSyncLogs] = useState(recentSyncLogs);
  const [strategyCard, setStrategyCard] = useState<StrategyCardItem>(() =>
    initialStrategyCard.id > 0
      ? initialStrategyCard
      : buildStrategyCardItem({
          base: initialStrategyCard,
          targetReader: "",
          coreAssertion: "",
          whyNow: "",
          researchHypothesis: "",
          marketPositionInsight: "",
          historicalTurningPoint: "",
          targetPackage: "",
          publishWindow: "",
          endingAction: "",
          firstHandObservation: "",
          feltMoment: "",
          whyThisHitMe: "",
          realSceneOrDialogue: "",
          wantToComplain: "",
          nonDelegableTruth: "",
          whyNowHints: initialStrategyCard.whyNowHints,
        }),
  );
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>(() => initialEvidenceItems.filter((item) => item.id > 0));
  const [evidenceDraftItems, setEvidenceDraftItems] = useState<EvidenceItem[]>(initialEvidenceItems);
  const [articleOutcomeBundle, setArticleOutcomeBundle] = useState(initialOutcomeBundle);
  const [knowledgeCardItems, setKnowledgeCardItems] = useState(knowledgeCards);
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [stageArtifacts, setStageArtifacts] = useState(initialStageArtifacts);
  const [view, setView] = useState<WorkspaceView>(() => getDefaultWorkspaceViewForStageCode(initialWorkflow.currentStageCode));
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => {
    const preferred = initialConnections.find((connection) => connection.isDefault) ?? initialConnections[0];
    return preferred?.id ? String(preferred.id) : "";
  });
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [snapshotNote, setSnapshotNote] = useState("");
  const requestedMainStepHandledRef = useRef<string | null>(null);
  const currentSearchParams = searchParams.toString();
  const [diffState, setDiffState] = useState<DiffState>(null);
  const [saveState, setSaveState] = useState("未保存");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [coverImage, setCoverImage] = useState(initialCoverImage);
  const [coverImageCandidates, setCoverImageCandidates] = useState(initialCoverImageCandidates);
  const [coverImageQuota, setCoverImageQuota] = useState(initialCoverImageQuota);
  const [imageAssetQuota, setImageAssetQuota] = useState(initialImageAssetQuota);
  const [imagePrompts, setImagePrompts] = useState(initialImagePrompts);
  const [coverImageReferenceDataUrl, setCoverImageReferenceDataUrl] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [selectingCoverCandidateId, setSelectingCoverCandidateId] = useState<number | null>(null);
  const [savingImagePrompts, setSavingImagePrompts] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retryingPublish, setRetryingPublish] = useState(false);
  const [loadingDiffId, setLoadingDiffId] = useState<number | null>(null);
  const [refreshingKnowledgeId, setRefreshingKnowledgeId] = useState<number | null>(null);
  const [expandedKnowledgeCardId, setExpandedKnowledgeCardId] = useState<number | null>(knowledgeCards[0]?.id ?? null);
  const [highlightedKnowledgeCardId, setHighlightedKnowledgeCardId] = useState<number | null>(null);
  const [updatingWorkflowCode, setUpdatingWorkflowCode] = useState<string | null>(null);
  const [generatingStageArtifactCode, setGeneratingStageArtifactCode] = useState<string | null>(null);
  const [applyingStageArtifactCode, setApplyingStageArtifactCode] = useState<string | null>(null);
  const [syncingOutlineArtifact, setSyncingOutlineArtifact] = useState(false);
  const [savingAudienceSelection, setSavingAudienceSelection] = useState(false);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [loadingPublishPreview, setLoadingPublishPreview] = useState(false);
  const [refreshingPublishPreview, setRefreshingPublishPreview] = useState(false);
  const [deepWritingPrototypeOverride, setDeepWritingPrototypeOverride] = useState<string | null>(null);
  const [deepWritingStateVariantOverride, setDeepWritingStateVariantOverride] = useState<string | null>(null);
  const [deepWritingOpeningPreviewLoadingKey, setDeepWritingOpeningPreviewLoadingKey] = useState<string | null>(null);
  const [deepWritingOpeningPreviews, setDeepWritingOpeningPreviews] = useState<Record<string, string>>({});
  const [publishPreview, setPublishPreview] = useState<PublishPreviewState | null>(null);
  const [pendingPublishIntent, setPendingPublishIntent] = useState<PendingPublishIntent | null>(initialWorkflow.pendingPublishIntent ?? null);
  const [factCheckEvidenceUrl, setFactCheckEvidenceUrl] = useState("");
  const [addingFactCheckEvidence, setAddingFactCheckEvidence] = useState(false);
  const [factCheckEvidenceIssue, setFactCheckEvidenceIssue] = useState<null | {
    url: string;
    degradedReason: string;
    retryRecommended: boolean;
  }>(null);
  const [recentFactCheckEvidenceIssues, setRecentFactCheckEvidenceIssues] = useState<ExternalFetchIssueRecord[]>([]);
  const factCheckRetryableCount = recentFactCheckEvidenceIssues.filter((item) => item.retryRecommended && !item.resolvedAt).length;
  const factCheckRecoveredCount = recentFactCheckEvidenceIssues.filter((item) => item.recoveryCount > 0).reduce((sum, item) => sum + item.recoveryCount, 0);
  const [showMobileInspector, setShowMobileInspector] = useState(false);
  const [showWechatConnectModal, setShowWechatConnectModal] = useState(false);
  const [wechatConnectSubmitting, setWechatConnectSubmitting] = useState(false);
  const [continuePublishAfterWechatConnect, setContinuePublishAfterWechatConnect] = useState(false);
  const [wechatConnectAccountName, setWechatConnectAccountName] = useState("");
  const [wechatConnectOriginalId, setWechatConnectOriginalId] = useState("");
  const [wechatConnectAppId, setWechatConnectAppId] = useState("");
  const [wechatConnectAppSecret, setWechatConnectAppSecret] = useState("");
  const [wechatConnectIsDefault, setWechatConnectIsDefault] = useState(initialConnections.length === 0);
  const [wechatConnectMessage, setWechatConnectMessage] = useState("");
  const [selectedOutcomeWindowCode, setSelectedOutcomeWindowCode] = useState<"24h" | "72h" | "7d">(
    initialOutcomeBundle.nextWindowCode ?? "24h",
  );
  const [outcomeReadCount, setOutcomeReadCount] = useState("0");
  const [outcomeShareCount, setOutcomeShareCount] = useState("0");
  const [outcomeLikeCount, setOutcomeLikeCount] = useState("0");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeTargetPackage, setOutcomeTargetPackage] = useState(initialOutcomeBundle.outcome?.targetPackage ?? initialStrategyCard.targetPackage ?? "");
  const [outcomeHitStatus, setOutcomeHitStatus] = useState<"pending" | "hit" | "near_miss" | "miss">(
    initialOutcomeBundle.outcome?.hitStatus ?? "pending",
  );
  const [outcomeReviewSummary, setOutcomeReviewSummary] = useState(initialOutcomeBundle.outcome?.reviewSummary ?? "");
  const [outcomeNextAction, setOutcomeNextAction] = useState(initialOutcomeBundle.outcome?.nextAction ?? "");
  const [outcomePlaybookTagsInput, setOutcomePlaybookTagsInput] = useState(
    initialOutcomeBundle.outcome?.playbookTags.join("，") ?? "",
  );
  const [savingOutcomeSnapshot, setSavingOutcomeSnapshot] = useState(false);
  const [seriesPlaybook, setSeriesPlaybook] = useState<ReviewSeriesPlaybook | null>(currentSeriesPlaybook);
  const [loadingSeriesPlaybook, setLoadingSeriesPlaybook] = useState(false);
  const [audienceSelectionDraft, setAudienceSelectionDraft] = useState<AudienceSelectionDraft>({
    selectedReaderLabel: "",
    selectedLanguageGuidance: "",
    selectedBackgroundAwareness: "",
    selectedReadabilityLevel: "",
    selectedCallToAction: "",
  });
  const [outlineSelectionDraft, setOutlineSelectionDraft] = useState<OutlineSelectionDraft>({
    selectedTitle: "",
    selectedTitleStyle: "",
    selectedOpeningHook: "",
    selectedTargetEmotion: "",
    selectedEndingStrategy: "",
  });
  const [outlineMaterials, setOutlineMaterials] = useState<OutlineMaterialsState | null>(null);
  const [loadingOutlineMaterials, setLoadingOutlineMaterials] = useState(false);
  const [savingOutlineMaterials, setSavingOutlineMaterials] = useState(false);
  const [strategyTargetReader, setStrategyTargetReader] = useState(initialStrategyCard.targetReader ?? "");
  const [strategyCoreAssertion, setStrategyCoreAssertion] = useState(initialStrategyCard.coreAssertion ?? "");
  const [strategyWhyNow, setStrategyWhyNow] = useState(initialStrategyCard.whyNow ?? "");
  const [strategyResearchHypothesis, setStrategyResearchHypothesis] = useState(initialStrategyCard.researchHypothesis ?? "");
  const [strategyMarketPositionInsight, setStrategyMarketPositionInsight] = useState(initialStrategyCard.marketPositionInsight ?? "");
  const [strategyHistoricalTurningPoint, setStrategyHistoricalTurningPoint] = useState(initialStrategyCard.historicalTurningPoint ?? "");
  const [strategyTargetPackage, setStrategyTargetPackage] = useState(initialStrategyCard.targetPackage ?? "");
  const [strategyPublishWindow, setStrategyPublishWindow] = useState(initialStrategyCard.publishWindow ?? "");
  const [strategyEndingAction, setStrategyEndingAction] = useState(initialStrategyCard.endingAction ?? "");
  const [strategyFirstHandObservation, setStrategyFirstHandObservation] = useState(initialStrategyCard.firstHandObservation ?? "");
  const [strategyFeltMoment, setStrategyFeltMoment] = useState(initialStrategyCard.feltMoment ?? "");
  const [strategyWhyThisHitMe, setStrategyWhyThisHitMe] = useState(initialStrategyCard.whyThisHitMe ?? "");
  const [strategyRealSceneOrDialogue, setStrategyRealSceneOrDialogue] = useState(initialStrategyCard.realSceneOrDialogue ?? "");
  const [strategyWantToComplain, setStrategyWantToComplain] = useState(initialStrategyCard.wantToComplain ?? "");
  const [strategyNonDelegableTruth, setStrategyNonDelegableTruth] = useState(initialStrategyCard.nonDelegableTruth ?? "");
  const [savingStrategyCard, setSavingStrategyCard] = useState(false);
  const [savingEvidenceItems, setSavingEvidenceItems] = useState(false);
  const strategyCardDraft = useMemo(
    () =>
      buildStrategyCardItem({
        base: strategyCard,
        targetReader: strategyTargetReader,
        coreAssertion: strategyCoreAssertion,
        whyNow: strategyWhyNow,
        researchHypothesis: strategyResearchHypothesis,
        marketPositionInsight: strategyMarketPositionInsight,
        historicalTurningPoint: strategyHistoricalTurningPoint,
        targetPackage: strategyTargetPackage,
        publishWindow: strategyPublishWindow,
        endingAction: strategyEndingAction,
        firstHandObservation: strategyFirstHandObservation,
        feltMoment: strategyFeltMoment,
        whyThisHitMe: strategyWhyThisHitMe,
        realSceneOrDialogue: strategyRealSceneOrDialogue,
        wantToComplain: strategyWantToComplain,
        nonDelegableTruth: strategyNonDelegableTruth,
        whyNowHints: strategyCard.whyNowHints,
      }),
    [
      strategyCard,
      strategyCoreAssertion,
      strategyEndingAction,
      strategyFeltMoment,
      strategyFirstHandObservation,
      strategyNonDelegableTruth,
      strategyPublishWindow,
      strategyResearchHypothesis,
      strategyTargetPackage,
      strategyTargetReader,
      strategyHistoricalTurningPoint,
      strategyMarketPositionInsight,
      strategyRealSceneOrDialogue,
      strategyWantToComplain,
      strategyWhyNow,
      strategyWhyThisHitMe,
    ],
  );
  const strategyCardMissingFields = useMemo(() => getStrategyCardMissingFields(strategyCardDraft), [strategyCardDraft]);
  const savedStrategyCardMissingFields = useMemo(() => getStrategyCardMissingFields(strategyCard), [strategyCard]);
  const strategyCardIsComplete = strategyCardMissingFields.length === 0;
  const savedStrategyCardIsComplete = savedStrategyCardMissingFields.length === 0;
  const strategyCardHasUnsavedChanges = useMemo(
    () =>
      getStrategyDraftValue(strategyCard.targetReader) !== strategyCardDraft.targetReader
      || getStrategyDraftValue(strategyCard.coreAssertion) !== strategyCardDraft.coreAssertion
      || getStrategyDraftValue(strategyCard.whyNow) !== strategyCardDraft.whyNow
      || getStrategyDraftValue(strategyCard.researchHypothesis) !== strategyCardDraft.researchHypothesis
      || getStrategyDraftValue(strategyCard.marketPositionInsight) !== strategyCardDraft.marketPositionInsight
      || getStrategyDraftValue(strategyCard.historicalTurningPoint) !== strategyCardDraft.historicalTurningPoint
      || getStrategyDraftValue(strategyCard.targetPackage) !== strategyCardDraft.targetPackage
      || getStrategyDraftValue(strategyCard.publishWindow) !== strategyCardDraft.publishWindow
      || getStrategyDraftValue(strategyCard.endingAction) !== strategyCardDraft.endingAction
      || getStrategyDraftValue(strategyCard.firstHandObservation) !== strategyCardDraft.firstHandObservation
      || getStrategyDraftValue(strategyCard.feltMoment) !== strategyCardDraft.feltMoment
      || getStrategyDraftValue(strategyCard.whyThisHitMe) !== strategyCardDraft.whyThisHitMe
      || getStrategyDraftValue(strategyCard.realSceneOrDialogue) !== strategyCardDraft.realSceneOrDialogue
      || getStrategyDraftValue(strategyCard.wantToComplain) !== strategyCardDraft.wantToComplain
      || getStrategyDraftValue(strategyCard.nonDelegableTruth) !== strategyCardDraft.nonDelegableTruth,
    [strategyCard, strategyCardDraft],
  );
  const [supplementalViewpointsDraft, setSupplementalViewpointsDraft] = useState<string[]>(["", "", ""]);
  const [outlineMaterialNodeId, setOutlineMaterialNodeId] = useState<string>(initialNodes[0]?.id ? String(initialNodes[0].id) : "");
  const [outlineMaterialFragmentId, setOutlineMaterialFragmentId] = useState("");
  const [outlineMaterialUsageMode, setOutlineMaterialUsageMode] = useState<"rewrite" | "image">("rewrite");
  const [outlineMaterialCreateMode, setOutlineMaterialCreateMode] = useState<"manual" | "url" | "screenshot">("manual");
  const [outlineMaterialTitle, setOutlineMaterialTitle] = useState("");
  const [outlineMaterialContent, setOutlineMaterialContent] = useState("");
  const [outlineMaterialUrl, setOutlineMaterialUrl] = useState("");
  const [outlineMaterialImageDataUrl, setOutlineMaterialImageDataUrl] = useState<string | null>(null);
  const [outlineMaterialScreenshotFileName, setOutlineMaterialScreenshotFileName] = useState("");
  const [factCheckSelectionDraft, setFactCheckSelectionDraft] = useState<FactCheckSelectionDraft>({
    claimDecisions: [],
  });
  const [historyReferenceSuggestions, setHistoryReferenceSuggestions] = useState<HistoryReferenceSuggestionItem[]>([]);
  const [selectedHistoryReferences, setSelectedHistoryReferences] = useState<HistoryReferenceSelectionItem[]>([]);
  const [loadingHistoryReferences, setLoadingHistoryReferences] = useState(false);
  const [savingHistoryReferences, setSavingHistoryReferences] = useState(false);
  const lastSavedRef = useRef({
    title: article.title,
    markdown: article.markdownContent,
    status: normalizeArticleStatus(article.status),
    seriesId: article.seriesId ?? (seriesOptions.length === 1 ? seriesOptions[0].id : null),
    wechatTemplateId: article.wechatTemplateId,
  });
  const outlineMaterialScreenshotInputRef = useRef<HTMLInputElement | null>(null);
  const editorialPreviewRef = useRef<HTMLDivElement | null>(null);

  const bannedWords = useMemo(
    () =>
      Array.from(
        new Set(
          languageGuardRules
            .filter((rule) => rule.isEnabled && rule.ruleKind === "token")
            .map((rule) => rule.patternText.trim())
            .filter(Boolean),
        ),
      ),
    [languageGuardRules],
  );
  const detectedBannedWords = useMemo(() => {
    const hits = new Map<string, number>();
    for (const word of bannedWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = markdown.match(new RegExp(escaped, "g"));
      if (matches?.length) {
        hits.set(word, matches.length);
      }
    }
    return Array.from(hits.entries()).map(([word, count]) => ({ word, count }));
  }, [bannedWords, markdown]);
  const liveLanguageGuardHits = useMemo(
    () => collectLanguageGuardHits(markdown, languageGuardRules).slice(0, 8),
    [languageGuardRules, markdown],
  );
  const liveLanguageGuardSummary = useMemo(
    () => ({
      tokenCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "token").length,
      patternCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "pattern").length,
      highSeverityCount: liveLanguageGuardHits.filter((hit) => hit.severity === "high").length,
    }),
    [liveLanguageGuardHits],
  );
  const editorialReview = useMemo(
    () => buildEditorialReview(markdown, liveLanguageGuardHits),
    [liveLanguageGuardHits, markdown],
  );
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === wechatTemplateId) ?? null, [templates, wechatTemplateId]);
  const selectedSeries = useMemo(() => seriesOptions.find((item) => item.id === seriesId) ?? null, [seriesId, seriesOptions]);
  const selectedConnection = useMemo(
    () => wechatConnections.find((connection) => String(connection.id) === selectedConnectionId) ?? null,
    [wechatConnections, selectedConnectionId],
  );
  const latestSyncLog = syncLogs[0] ?? null;
  const currentArticleOutcome = articleOutcomeBundle.outcome;
  const currentOutcomeSnapshot = useMemo(
    () => articleOutcomeBundle.snapshots.find((snapshot) => snapshot.windowCode === selectedOutcomeWindowCode) ?? null,
    [articleOutcomeBundle.snapshots, selectedOutcomeWindowCode],
  );
  const visualSuggestion = useMemo(() => buildVisualSuggestion(title, markdown, authoringContext), [authoringContext, title, markdown]);
  const outlineMaterialReadiness = useMemo(() => {
    const activeNodes = outlineMaterials?.nodes ?? nodes;
    const allFragments = activeNodes.flatMap((node) => node.fragments);
    const uniqueFragmentIds = new Set(allFragments.map((fragment) => fragment.id));
    const uniqueSourceTypes = new Set(allFragments.map((fragment) => String(fragment.sourceType || "manual")));
    const screenshotCount = allFragments.filter((fragment) => String(fragment.usageMode || "") === "image" || String(fragment.sourceType || "") === "screenshot").length;
    const flags = [
      uniqueFragmentIds.size < 2 ? "缺最小素材集" : null,
      uniqueSourceTypes.size <= 1 ? "信源过单一" : null,
      screenshotCount === 0 ? "缺证据型素材" : null,
    ].filter(Boolean) as string[];
    const score = Math.max(
      0,
      Math.min(
        100,
        100
          - (uniqueFragmentIds.size < 2 ? 40 : 0)
          - (uniqueSourceTypes.size <= 1 ? 25 : 0)
          - (screenshotCount === 0 ? 15 : 0),
      ),
    );
    return {
      fragmentCount: uniqueFragmentIds.size,
      sourceTypeCount: uniqueSourceTypes.size,
      screenshotCount,
      score,
      flags,
      status:
        uniqueFragmentIds.size === 0
          ? "blocked"
          : uniqueSourceTypes.size <= 1
            ? "warning"
            : "passed",
      detail:
        uniqueFragmentIds.size === 0
          ? "当前大纲节点还没有挂素材，至少补 2 条文字素材再确认大纲。"
          : uniqueFragmentIds.size < 2
            ? "素材条数还不够，建议先补齐最小素材集，再继续确认标题和章节。"
            : uniqueSourceTypes.size <= 1
              ? "素材已挂入，但信源类型过于单一，建议补链接或截图证据。"
              : screenshotCount === 0
                ? "基础素材已够，但还缺证据型素材，后续事实核查会更容易卡住。"
                : `已挂 ${uniqueFragmentIds.size} 条素材，覆盖 ${uniqueSourceTypes.size} 类来源，当前可支撑大纲推进。`,
    };
  }, [nodes, outlineMaterials]);
  const articleScorecardSummary = useMemo(() => {
    const scorecard = currentArticleOutcome?.scorecard;
    if (!scorecard) {
      return null;
    }
    const aiNoise = getPayloadRecord(scorecard, "aiNoise");
    return {
      predictedScore: getRecordNumber(scorecard, "predictedScore"),
      qualityScore: getRecordNumber(scorecard, "qualityScore"),
      viralScore: getRecordNumber(scorecard, "viralScore"),
      riskPenalty: getRecordNumber(scorecard, "riskPenalty"),
      summary: getRecordString(scorecard, "summary"),
      blockers: getRecordStringArray(scorecard, "blockers"),
      aiNoiseScore: getRecordNumber(aiNoise, "score"),
      aiNoiseLevel: getRecordString(aiNoise, "level"),
    };
  }, [currentArticleOutcome?.scorecard]);
  const audienceArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "audienceAnalysis") ?? null,
    [stageArtifacts],
  );
  const outlineArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "outlinePlanning") ?? null,
    [stageArtifacts],
  );
  const deepWritingArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "deepWriting") ?? null,
    [stageArtifacts],
  );
  const factCheckArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "factCheck") ?? null,
    [stageArtifacts],
  );
  const prosePolishArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "prosePolish") ?? null,
    [stageArtifacts],
  );
  const researchArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === "researchBrief") ?? null,
    [stageArtifacts],
  );
  const currentStage = useMemo(
    () => workflow.stages.find((stage) => stage.code === workflow.currentStageCode) ?? workflow.stages[0] ?? null,
    [workflow],
  );
  const currentArticleMainStep = useMemo(
    () => (status === "published" ? ARTICLE_MAIN_STEPS[ARTICLE_MAIN_STEPS.length - 1] : getArticleMainStepByStageCode(workflow.currentStageCode)),
    [status, workflow.currentStageCode],
  );
  const currentStageArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === workflow.currentStageCode) ?? null,
    [stageArtifacts, workflow.currentStageCode],
  );
  const currentAudienceSelection = useMemo(
    () => getAudienceSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const currentOutlineSelection = useMemo(
    () => getOutlineSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const currentFactCheckSelection = useMemo(
    () => getFactCheckSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const audienceSelectionState = useMemo(
    () => getAudienceSelectionDraft(audienceArtifact?.payload),
    [audienceArtifact],
  );
  const outlineSelectionState = useMemo(
    () => getOutlineSelectionDraft(outlineArtifact?.payload),
    [outlineArtifact],
  );
  const liveAiNoise = useMemo(() => analyzeAiNoise(markdown), [markdown]);
  const activeAiNoiseRecord = useMemo(
    () => getPayloadRecord(prosePolishArtifact?.payload, "aiNoise") ?? (liveAiNoise as unknown as Record<string, unknown>),
    [liveAiNoise, prosePolishArtifact],
  );
  const activeAiNoiseScore = Number(activeAiNoiseRecord?.score ?? 0);
  const historyPlanCount = useMemo(
    () => getPayloadRecordArray(deepWritingArtifact?.payload, "historyReferencePlan").length,
    [deepWritingArtifact],
  );
  const strategySuggestedValues = useMemo(
    () => ({
      targetReader: audienceSelectionState.selectedReaderLabel || getRecordString(audienceArtifact?.payload, "coreReaderLabel") || selectedSeries?.targetAudience || "",
      coreAssertion: getRecordString(outlineArtifact?.payload, "centralThesis") || selectedSeries?.thesis || "",
      whyNow: strategyCard.whyNowHints.join("；") || seriesInsight?.reason || "",
      targetPackage: outcomeTargetPackage.trim() || "",
      publishWindow: "",
      endingAction:
        audienceSelectionState.selectedCallToAction
        || getRecordString(audienceArtifact?.payload, "recommendedCallToAction")
        || outlineSelectionState.selectedEndingStrategy
        || getRecordString(outlineArtifact?.payload, "endingStrategy")
        || "",
    }),
    [
      audienceArtifact?.payload,
      audienceSelectionState.selectedCallToAction,
      audienceSelectionState.selectedReaderLabel,
      outlineArtifact?.payload,
      outlineSelectionState.selectedEndingStrategy,
      outcomeTargetPackage,
      selectedSeries?.targetAudience,
      selectedSeries?.thesis,
      seriesInsight?.reason,
      strategyCard.whyNowHints,
    ],
  );
  const suggestedEvidenceItems = useMemo(
    () =>
      buildSuggestedEvidenceItems({
        nodes: outlineMaterials?.nodes ?? nodes,
        factCheckPayload: factCheckArtifact?.payload ?? null,
      }),
    [factCheckArtifact?.payload, nodes, outlineMaterials?.nodes],
  );
  const evidenceDraftStats = useMemo(() => getArticleEvidenceStats(evidenceDraftItems), [evidenceDraftItems]);
  const savedEvidenceStats = useMemo(() => getArticleEvidenceStats(evidenceItems), [evidenceItems]);
  const editorDiversityReport = useMemo(
    () =>
      buildWritingDiversityReport({
        currentArticle: {
          id: article.id,
          title,
          markdownContent: markdown,
        },
        deepWritingPayload: deepWritingArtifact?.payload ?? null,
        recentArticles,
        recentDeepWritingStates,
      }),
    [deepWritingArtifact?.payload, article.id, markdown, recentArticles, recentDeepWritingStates, title],
  );
  const editorQualityPanel = useMemo(
    () =>
      buildWritingQualityPanel({
        markdownContent: markdown,
        aiNoise: liveAiNoise,
        languageGuardHitsCount: liveLanguageGuardHits.length,
        humanSignalScore: strategyCardDraft.humanSignalScore,
        hasRealScene: Boolean(strategyCardDraft.firstHandObservation || strategyCardDraft.realSceneOrDialogue),
        hasNonDelegableTruth: Boolean(strategyCardDraft.nonDelegableTruth),
        materialReadiness: {
          attachedFragmentCount: evidenceDraftStats.itemCount,
          uniqueSourceTypeCount: evidenceDraftStats.uniqueSourceTypeCount,
          screenshotCount: evidenceDraftStats.screenshotEvidenceCount,
        },
        evidenceStats: {
          ready: evidenceDraftStats.ready,
          itemCount: evidenceDraftStats.itemCount,
          flags: evidenceDraftStats.flags,
        },
        missingEvidenceCount: getPayloadStringArray(factCheckArtifact?.payload, "missingEvidence").length,
        deepWritingPayload: deepWritingArtifact?.payload ?? null,
        researchBriefPayload: researchArtifact?.payload ?? null,
        diversityReport: editorDiversityReport,
      }),
    [
      deepWritingArtifact?.payload,
      editorDiversityReport,
      evidenceDraftStats.flags,
      evidenceDraftStats.itemCount,
      evidenceDraftStats.ready,
      evidenceDraftStats.screenshotEvidenceCount,
      evidenceDraftStats.uniqueSourceTypeCount,
      factCheckArtifact?.payload,
      liveAiNoise,
      liveLanguageGuardHits.length,
      markdown,
      researchArtifact?.payload,
      strategyCardDraft.firstHandObservation,
      strategyCardDraft.humanSignalScore,
      strategyCardDraft.nonDelegableTruth,
      strategyCardDraft.realSceneOrDialogue,
    ],
  );
  const evidenceHasUnsavedChanges = useMemo(() => {
    const left = evidenceDraftItems.map(buildEvidenceItemSignature);
    const right = evidenceItems.map(buildEvidenceItemSignature);
    return left.length !== right.length || left.some((item, index) => item !== right[index]);
  }, [evidenceDraftItems, evidenceItems]);
  const outlineGapHintsForGuide = useMemo(
    () => getPayloadStringArray(outlineArtifact?.payload, "materialGapHints"),
    [outlineArtifact],
  );
  const titleConfirmedForGuide = Boolean((outlineSelectionState.selectedTitle || "").trim() || String(outlineArtifact?.payload?.workingTitle || "").trim());
  const factCheckReady = Boolean(factCheckArtifact?.status === "ready" && factCheckArtifact?.payload);
  const prosePolishReady = Boolean(prosePolishArtifact?.status === "ready" && prosePolishArtifact?.payload);
  const researchTimelineCountForGuide = useMemo(
    () => getPayloadRecordArray(researchArtifact?.payload, "timelineCards").length,
    [researchArtifact?.payload],
  );
  const researchComparisonCountForGuide = useMemo(
    () => getPayloadRecordArray(researchArtifact?.payload, "comparisonCards").length,
    [researchArtifact?.payload],
  );
  const researchInsightCountForGuide = useMemo(
    () => getPayloadRecordArray(researchArtifact?.payload, "intersectionInsights").length,
    [researchArtifact?.payload],
  );
  const researchCoverageSufficiencyForGuide = useMemo(
    () => String(getPayloadRecord(researchArtifact?.payload, "sourceCoverage")?.sufficiency || "").trim(),
    [researchArtifact?.payload],
  );
  const researchGenerationGate = useMemo(
    () => getResearchBriefGenerationGate(researchArtifact?.payload ?? null),
    [researchArtifact?.payload],
  );
  const generateBlockedByResearch = researchGenerationGate.generationBlocked;
  const generateBlockedMessage = researchGenerationGate.generationBlockReason;
  const researchStepSummary = useMemo(() => {
    const sourceCoverage = getPayloadRecord(researchArtifact?.payload, "sourceCoverage");
    const missingCategories = getPayloadStringArray(sourceCoverage, "missingCategories");
    const missingParts = [
      researchTimelineCountForGuide === 0 ? "时间脉络" : null,
      researchComparisonCountForGuide === 0 ? "横向比较" : null,
      researchInsightCountForGuide === 0 ? "交汇洞察" : null,
    ].filter(Boolean) as string[];

    if (!researchArtifact?.payload) {
      return {
        status: "needs_attention" as const,
        title: "研究底座还没启动",
        detail: "还没有研究简报。建议先生成一版，把时间脉络、横向比较和交汇洞察补齐后，再继续往下推进。",
        highlights: ["待补：时间脉络", "待补：横向比较", "待补：交汇洞察"],
      };
    }

    if (researchCoverageSufficiencyForGuide === "blocked") {
      return {
        status: "blocked" as const,
        title: "研究覆盖不足",
        detail: missingCategories.length > 0
          ? `当前研究仍缺这些来源类别：${missingCategories.join("、")}。现在更像观点草稿，不适合直接把判断写硬。`
          : "当前研究覆盖仍不足，建议继续补官方、行业、同类、用户或时间维度的信源。",
        highlights: missingCategories.map((item) => `缺口：${item}`),
      };
    }

    if (missingParts.length > 0) {
      return {
        status: "needs_attention" as const,
        title: "研究骨架还没闭合",
        detail: `研究简报已有骨架，但仍缺 ${missingParts.join("、")}，主判断还没有完全被研究层写硬。`,
        highlights: missingParts.map((item) => `待补：${item}`),
      };
    }

    return {
      status: "ready" as const,
      title: "研究底座已就位",
      detail: `当前已补齐 ${researchTimelineCountForGuide} 张时间脉络卡、${researchComparisonCountForGuide} 张横向比较卡和 ${researchInsightCountForGuide} 条交汇洞察，可继续推进策略、证据和成稿。`,
      highlights: [
        `时间脉络 ${researchTimelineCountForGuide}`,
        `横向比较 ${researchComparisonCountForGuide}`,
        `交汇洞察 ${researchInsightCountForGuide}`,
      ],
    };
  }, [
    researchArtifact?.payload,
    researchComparisonCountForGuide,
    researchCoverageSufficiencyForGuide,
    researchInsightCountForGuide,
    researchTimelineCountForGuide,
  ]);
  const editorStageChecklist = useMemo(() => {
    const topicReady = Boolean(title.trim() && title.trim() !== "未命名稿件");
    const outlineReady = Boolean(outlineArtifact?.status === "ready" && outlineArtifact?.payload);
    const deepWritingReady = Boolean(deepWritingArtifact?.status === "ready" && deepWritingArtifact?.payload);
    const publishBlockedByConnection = canPublishToWechat && (!selectedConnection || selectedConnection.status !== "valid");
    const publishBlockedByCover = !coverImage;
    const researchGuideHint = !researchArtifact?.payload
      ? "研究简报还没生成，建议先补时间脉络、横向比较和交汇洞察。"
      : researchCoverageSufficiencyForGuide === "blocked"
        ? "研究简报已生成，但信源覆盖仍不足，当前更像观点草稿，不适合直接写硬判断。"
        : researchInsightCountForGuide === 0
          ? "研究简报已有骨架，但还缺交汇洞察，主判断还没有真正被研究层写硬。"
          : researchTimelineCountForGuide === 0 || researchComparisonCountForGuide === 0
            ? `研究简报还缺${[
              researchTimelineCountForGuide === 0 ? "时间脉络" : null,
              researchComparisonCountForGuide === 0 ? "横向比较" : null,
            ].filter(Boolean).join("和")}，建议先补齐。`
            : "";
    const researchNeedsAttention = Boolean(researchGuideHint);

    return [
      {
        stepCode: "opportunity",
        stageCode: "opportunity",
        title: "机会",
        status: !topicReady ? "blocked" : "ready",
        detail: !topicReady
          ? "标题仍是空白或占位状态，先明确这篇到底在写什么。"
          : "这篇稿件已经有明确切口，可以进入策略确认。",
      },
      {
        stepCode: "strategy",
        stageCode: "researchBrief",
        title: "策略",
        status: !strategyCardIsComplete ? "blocked" : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges || researchNeedsAttention || !outlineReady || !titleConfirmedForGuide ? "needs_attention" : "ready",
        detail: !strategyCardIsComplete
          ? `策略卡还缺这些必填项：${strategyCardMissingFields.join("、")}。`
          : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
            ? "策略卡字段已补齐，但还没确认保存，发布守门不会放行。"
          : researchNeedsAttention
            ? researchGuideHint
          : !outlineReady
            ? "策略卡已经确认，但还没有生成可执行大纲。"
            : !titleConfirmedForGuide
              ? "策略卡和结构已经生成，但还没明确确认最终标题。"
              : "目标读者、核心判断、目标包和发布时间窗都已就位。",
      },
      {
        stepCode: "evidence",
        stageCode: "outlinePlanning",
        title: "证据",
        status: !evidenceDraftStats.ready ? "blocked" : !savedEvidenceStats.ready || evidenceHasUnsavedChanges || researchNeedsAttention || !factCheckReady || outlineMaterialReadiness.status !== "passed" || outlineGapHintsForGuide.length > 0 ? "needs_attention" : "ready",
        detail: !evidenceDraftStats.ready
          ? `当前证据包未达最低标准：${evidenceDraftStats.flags.join("、")}。`
          : !savedEvidenceStats.ready || evidenceHasUnsavedChanges
            ? "证据包草稿已补齐，但还没确认保存，发布守门仍不会放行。"
          : researchNeedsAttention
            ? `证据包已开始整理，但研究底座仍有缺口：${researchGuideHint}`
          : outlineMaterialReadiness.status !== "passed"
            ? `${outlineMaterialReadiness.detail}${outlineMaterialReadiness.flags.length ? ` 当前缺口：${outlineMaterialReadiness.flags.join("、")}。` : ""}`
            : !factCheckReady
              ? "证据包已确认，但事实核查还没生成证据判断。"
              : outlineGapHintsForGuide.length > 0
                ? `已进入证据阶段，但仍提示这些素材缺口：${outlineGapHintsForGuide.join("；")}`
                : "已确认的证据包和事实核查都已具备。",
      },
      {
        stepCode: "draft",
        stageCode: "deepWriting",
        title: "成稿",
        status: !deepWritingReady ? "blocked" : !prosePolishReady || activeAiNoiseScore >= 70 || liveLanguageGuardHits.length > 0 || (canUseHistoryReferences && historyPlanCount === 0) ? "needs_attention" : "ready",
        detail: !deepWritingReady
          ? "还没有生成正文执行卡。"
          : !prosePolishReady
            ? "正文已经进入成稿区，但还没完成润色收口。"
            : canUseHistoryReferences && historyPlanCount === 0
              ? "正文与润色已完成，但系列旧文承接还没补进去。"
              : activeAiNoiseScore >= 70
                ? `AI 噪声得分 ${activeAiNoiseScore}，仍有明显空话或模板句需要重写。`
                : liveLanguageGuardHits.length > 0
                  ? `仍命中 ${liveLanguageGuardHits.length} 条语言守卫规则，建议先清理机器味。`
                  : "正文、润色和语言守卫都已收口。",
      },
      {
        stepCode: "publish",
        stageCode: "publish",
        title: "发布",
        status: !savedStrategyCardIsComplete || !savedEvidenceStats.ready || !titleConfirmedForGuide || !factCheckReady ? "blocked" : publishBlockedByCover || publishBlockedByConnection ? "needs_attention" : "ready",
        detail: !savedStrategyCardIsComplete
          ? `发布前需要先确认并保存策略卡，当前仍缺：${savedStrategyCardMissingFields.join("、")}。`
          : !savedEvidenceStats.ready
            ? `发布前需要先确认并保存证据包，当前仍缺：${savedEvidenceStats.flags.join("、")}。`
          : !titleConfirmedForGuide
          ? "发布前还没确认最终标题。"
          : !factCheckReady
            ? "发布前需要先跑完事实核查。"
            : canPublishToWechat
              ? publishBlockedByCover
                ? "微信推送前还缺封面图。"
                : publishBlockedByConnection
                  ? "微信推送能力已开放，但当前还没有可用公众号连接。"
                  : "微信连接、封面图和正文已具备发布条件。"
              : publishBlockedByCover
                ? "当前套餐不推微信，但仍建议补一张封面图再导出交付。"
                : "当前套餐走导出交付路径即可，不必等到发布页才发现不可用。",
      },
      {
        stepCode: "result",
        stageCode: "publish",
        title: "结果",
        status:
          status !== "published"
            ? "blocked"
            : articleOutcomeBundle.missingWindowCodes.length > 0 || (currentArticleOutcome?.hitStatus ?? "pending") === "pending"
              ? "needs_attention"
              : "ready",
        detail: status !== "published"
          ? "稿件还没正式发布，结果阶段尚未开始。"
          : articleOutcomeBundle.missingWindowCodes.length > 0
            ? `还缺 ${articleOutcomeBundle.missingWindowCodes.join(" / ")} 结果快照。`
            : (currentArticleOutcome?.hitStatus ?? "pending") === "pending"
              ? "24h / 72h / 7d 快照已补齐，但还没完成命中判定与复盘结论。"
              : `结果回流已闭环，当前判定：${formatOutcomeHitStatus(currentArticleOutcome?.hitStatus ?? "pending")}。`,
      },
    ] as Array<{ stepCode: string; stageCode: string; title: string; status: "ready" | "needs_attention" | "blocked"; detail: string }>;
  }, [
    activeAiNoiseScore,
    articleOutcomeBundle.missingWindowCodes,
    canPublishToWechat,
    canUseHistoryReferences,
    coverImage,
    deepWritingArtifact,
    evidenceDraftStats.flags,
    evidenceDraftStats.ready,
    evidenceHasUnsavedChanges,
    factCheckReady,
    historyPlanCount,
    liveLanguageGuardHits.length,
    outlineArtifact,
    outlineGapHintsForGuide,
    outlineMaterialReadiness.detail,
    outlineMaterialReadiness.flags,
    outlineMaterialReadiness.fragmentCount,
    outlineMaterialReadiness.status,
    prosePolishReady,
    researchArtifact?.payload,
    researchComparisonCountForGuide,
    researchCoverageSufficiencyForGuide,
    researchInsightCountForGuide,
    researchTimelineCountForGuide,
    savedEvidenceStats.flags,
    savedEvidenceStats.ready,
    savedStrategyCardIsComplete,
    savedStrategyCardMissingFields,
    selectedConnection,
    status,
    strategyCardHasUnsavedChanges,
    strategyCardIsComplete,
    strategyCardMissingFields,
    title,
    titleConfirmedForGuide,
    currentArticleOutcome?.hitStatus,
  ]);
  const articleMainSteps = useMemo(() => {
    const currentStepIndex = ARTICLE_MAIN_STEPS.findIndex((step) => step.code === currentArticleMainStep.code);
    return ARTICLE_MAIN_STEPS.map((step, index) => {
      const checklistItem = editorStageChecklist.find((item) => item.stepCode === step.code);
      let statusLabel: ArticleMainStepStatus = "pending";
      if (step.code === currentArticleMainStep.code) {
        statusLabel = "current";
      } else if (checklistItem?.status === "ready") {
        statusLabel = "completed";
      } else if (checklistItem?.status === "needs_attention" || checklistItem?.status === "blocked") {
        statusLabel = index < currentStepIndex ? "needs_attention" : "pending";
      }
      if (step.code === "result" && checklistItem?.status === "needs_attention") {
        statusLabel = "needs_attention";
      }
      return {
        ...step,
        statusLabel,
        detail: checklistItem?.detail || "当前步骤说明暂未生成。",
      };
    });
  }, [currentArticleMainStep.code, editorStageChecklist]);
  function handleArticleMainStepSelect(step: (typeof ARTICLE_MAIN_STEPS)[number]) {
    if (step.code === "result") {
      if (status !== "published") {
        return;
      }
      setView("workspace");
      return;
    }
    void updateWorkflow(step.primaryStageCode as typeof workflow.currentStageCode, "set");
  }
  const currentArticleMainStepDisplay = useMemo(
    () => articleMainSteps.find((step) => step.code === currentArticleMainStep.code) ?? null,
    [articleMainSteps, currentArticleMainStep.code],
  );
  const currentAuthoringPhase = useMemo(
    () => AUTHORING_PHASES.find((phase) => phase.code === getAuthoringPhaseCode(currentArticleMainStep.code, workflow.currentStageCode)) ?? AUTHORING_PHASES[0],
    [currentArticleMainStep.code, workflow.currentStageCode],
  );
  const authoringPhases = useMemo(() => {
    const currentPhaseIndex = AUTHORING_PHASES.findIndex((phase) => phase.code === currentAuthoringPhase.code);
    return AUTHORING_PHASES.map((phase, index) => {
      const steps = articleMainSteps.filter((step) => getAuthoringPhaseCode(step.code, step.primaryStageCode) === phase.code);
      const isCurrent = phase.code === currentAuthoringPhase.code;
      const hasNeedsAttention = steps.some((step) => step.statusLabel === "needs_attention");
      const isCompleted = steps.length > 0 && steps.every((step) => step.statusLabel === "completed");
      return {
        ...phase,
        statusLabel: isCurrent ? "current" : isCompleted ? "completed" : hasNeedsAttention || index < currentPhaseIndex ? "needs_attention" : "pending",
        steps,
      };
    });
  }, [articleMainSteps, currentAuthoringPhase.code]);
  const currentAuthoringPhaseHint = useMemo(() => {
    if (currentAuthoringPhase.code === "collect") {
      return "先把研究、素材和证据挂齐，再考虑漂亮句子。";
    }
    if (currentAuthoringPhase.code === "think") {
      return "这一段只看论点、读者和结构，减少正文噪音。";
    }
    if (currentAuthoringPhase.code === "write") {
      return "进入写作后，优先留在稿纸和节奏图里，不必频繁切预览。";
    }
    return liveLanguageGuardHits.length > 0
      ? `当前还命中 ${liveLanguageGuardHits.length} 条语言守卫，先清红笔，再看微信预览。`
      : "正文已进入收口区，先用红笔检查，再用微信预览确认最终体感。";
  }, [currentAuthoringPhase.code, liveLanguageGuardHits.length]);
  const hasDraftContent = markdown.trim().length > 0;
  const hasPreviewContent = useMemo(() => {
    const plainText = extractPlainText(htmlPreview);
    return plainText.length > 0 || /<(img|blockquote|h[1-6])\b/i.test(String(htmlPreview || ""));
  }, [htmlPreview]);
  const currentArticleLabel = title.trim() || article.title || "未命名稿件";
  const draftStarterOptions = useMemo(
    () => getDraftStarterOptions(currentAuthoringPhase.code, title),
    [currentAuthoringPhase.code, title],
  );
  const draftBlankSlate = useMemo(
    () =>
      getAuthoringBlankSlateCopy({
        phase: currentAuthoringPhase.code,
        surface: "paper",
        stepTitle: currentArticleMainStep.title,
      }),
    [currentArticleMainStep.title, currentAuthoringPhase.code],
  );
  const draftBlankSlateInspirations = useMemo(
    () =>
      buildBlankSlateInspirationCards({
        fragments: fragmentPool,
        phase: currentAuthoringPhase.code,
        articleId: article.id,
        title,
      }),
    [article.id, currentAuthoringPhase.code, fragmentPool, title],
  );
  const workspaceBlankSlate = useMemo(
    () =>
      getAuthoringBlankSlateCopy({
        phase: currentAuthoringPhase.code,
        surface: "workspace",
        stepTitle: currentArticleMainStep.title,
      }),
    [currentArticleMainStep.title, currentAuthoringPhase.code],
  );
  const reviewBlankSlate = useMemo(
    () =>
      getAuthoringBlankSlateCopy({
        phase: currentAuthoringPhase.code,
        surface: "review",
        stepTitle: currentArticleMainStep.title,
      }),
    [currentArticleMainStep.title, currentAuthoringPhase.code],
  );
  const knowledgeBlankSlate = useMemo(
    () =>
      getAuthoringBlankSlateCopy({
        phase: currentAuthoringPhase.code,
        surface: "knowledge",
        stepTitle: currentArticleMainStep.title,
      }),
    [currentArticleMainStep.title, currentAuthoringPhase.code],
  );
  const isCollectPhase = currentAuthoringPhase.code === "collect";
  const isThinkPhase = currentAuthoringPhase.code === "think";
  const isWritePhase = currentAuthoringPhase.code === "write";
  const isPolishPhase = currentAuthoringPhase.code === "polish";
  const showLeftWorkspaceRail = !isFocusMode && (isCollectPhase || isThinkPhase);
  const showResearchChecklistRail = isCollectPhase || isThinkPhase;
  const showKnowledgeCardsRail = isCollectPhase || isThinkPhase;
  const showLanguageGuardRail = isWritePhase || isPolishPhase;
  const showVisualEngineRail = isCollectPhase || isThinkPhase || isWritePhase;
  const showDeliveryRail = isPolishPhase;
  const showCompactSixStepRail = !showResearchChecklistRail;
  const showMobileInspectorEntry =
    !isFocusMode
    && (showCompactSixStepRail || !showLeftWorkspaceRail || showKnowledgeCardsRail || showLanguageGuardRail || showVisualEngineRail);
  const workspaceGridClass = useMemo(() => {
    if (isFocusMode) {
      return "xl:grid-cols-1";
    }
    if (isWritePhase || isPolishPhase) {
      return "xl:grid-cols-[minmax(0,1fr)_340px]";
    }
    return "xl:grid-cols-[260px_minmax(0,1fr)_360px]";
  }, [isFocusMode, isPolishPhase, isWritePhase]);
  const planCapabilityHints = useMemo(
    () =>
      [
        !canUseHistoryReferences
          ? {
              key: "history-reference",
              title: "历史文章自然引用",
              detail: `${displayPlanName}当前不支持旧文自然引用。替代路径：在深写执行卡里手动补 1 句桥接句，把旧判断写进正文。`,
            }
          : null,
        !canGenerateCoverImage
          ? {
              key: "cover-generate",
              title: "封面图生成",
              detail: `${displayPlanName}当前只开放配图提示词。替代路径：先保存提示词或导出 HTML，再用外部工具生成封面图。`,
            }
          : null,
        canGenerateCoverImage && !canUseCoverImageReference
          ? {
              key: "cover-reference",
              title: "参考图垫图",
              detail: `${displayPlanName}当前可直接生成封面图，但不能上传参考图。替代路径：先生成候选图，再从候选图里挑一张入库。`,
            }
          : null,
        !canPublishToWechat
          ? {
              key: "wechat-publish",
              title: "微信草稿箱推送",
              detail: `${displayPlanName}当前不开放公众号推送。替代路径：继续走 HTML / Markdown 导出，不要等到发布页才发现不可用。`,
            }
          : null,
        !canExportPdf
          ? {
              key: "pdf-export",
              title: "PDF 导出",
              detail: `${displayPlanName}当前不开放 PDF。替代路径：优先导出 HTML 或 Markdown，再做外部排版。`,
            }
          : null,
      ].filter(Boolean) as Array<{ key: string; title: string; detail: string }>,
    [
      canExportPdf,
      canGenerateCoverImage,
      canPublishToWechat,
      canUseCoverImageReference,
      canUseHistoryReferences,
      planName,
    ],
  );
  const audienceReaderSegments = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "readerSegments"),
    [currentStageArtifact],
  );
  const audienceLanguageGuidance = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "languageGuidance"),
    [currentStageArtifact],
  );
  const audienceBackgroundAwarenessOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "backgroundAwarenessOptions"),
    [currentStageArtifact],
  );
  const audienceReadabilityOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "readabilityOptions"),
    [currentStageArtifact],
  );
  const outlineOpeningHookOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "openingHookOptions"),
    [currentStageArtifact],
  );
  const outlineTitleOptions = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "titleOptions"),
    [currentStageArtifact],
  );
  const outlineTitleStrategyNotes = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "titleStrategyNotes"),
    [currentStageArtifact],
  );
  const outlineTargetEmotionOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "targetEmotionOptions"),
    [currentStageArtifact],
  );
  const outlineEndingStrategyOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "endingStrategyOptions"),
    [currentStageArtifact],
  );
  const factCheckChecks = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "checks"),
    [currentStageArtifact],
  );
  const factCheckResolvedCount = useMemo(
    () =>
      factCheckChecks.filter((item) => {
        const claim = String(item.claim || "").trim();
        const status = String(item.status || "").trim();
        return getFactCheckDecision(factCheckSelectionDraft, claim, status).action !== "keep";
      }).length,
    [factCheckChecks, factCheckSelectionDraft],
  );
  const audienceCallToActionOptions = useMemo(() => {
    if (!currentStageArtifact?.payload) {
      return [] as string[];
    }
    const recommended = String(currentStageArtifact.payload.recommendedCallToAction || "").trim();
    return Array.from(
      new Set(
        [
          recommended,
          "结尾给出下一步观察点和判断标准。",
          "结尾提示读者如何把这篇内容转成可执行动作。",
        ].map((item) => String(item || "").trim()).filter(Boolean),
      ),
    ).slice(0, 4);
  }, [currentStageArtifact]);
  const currentStageAction = currentStage ? GENERATABLE_STAGE_ACTIONS[currentStage.code] : null;
  const coverImageLimitReached = coverImageQuota.limit != null && coverImageQuota.used >= coverImageQuota.limit;
  const imageAssetStorageLimitReached = imageAssetQuota.remainingBytes < imageAssetQuota.reservedGenerationBytes;
  const canShowWechatControls = canPublishToWechat;
  const hasUnsavedWechatRenderInputs =
    title !== lastSavedRef.current.title ||
    markdown !== lastSavedRef.current.markdown ||
    wechatTemplateId !== lastSavedRef.current.wechatTemplateId;
  const coverImageButtonDisabled = !canGenerateCoverImage || generatingCover || coverImageLimitReached || imageAssetStorageLimitReached;
  const coverImageButtonLabel = !canGenerateCoverImage
    ? "当前套餐仅提供文本配图建议"
    : coverImageLimitReached
      ? "今日封面图额度已用尽"
      : imageAssetStorageLimitReached
        ? "图片资产空间不足"
      : generatingCover
        ? "封面图生成中…"
        : "生成 16:9 封面图";
  const nodeVisualSuggestions = useMemo(
    () =>
      nodes
        .filter((node) => node.title.trim())
        .slice(0, 4)
        .map((node) => ({
          id: node.id,
          title: node.title,
          prompt: buildNodeVisualSuggestion({
            articleTitle: title,
            nodeTitle: node.title,
            nodeDescription: node.description,
            fragments: node.fragments,
            authoringContext,
          }),
        })),
    [authoringContext, nodes, title],
  );

  useEffect(() => {
    setKnowledgeCardItems(knowledgeCards);
    setExpandedKnowledgeCardId((current) => current ?? knowledgeCards[0]?.id ?? null);
  }, [knowledgeCards]);

  useEffect(() => {
    setFragmentPool(initialFragments);
  }, [initialFragments]);

  useEffect(() => {
    setWechatConnections(initialConnections);
  }, [initialConnections]);

  useEffect(() => {
    setCoverImageCandidates(initialCoverImageCandidates);
  }, [initialCoverImageCandidates]);

  useEffect(() => {
    setImagePrompts(initialImagePrompts);
  }, [initialImagePrompts]);

  useEffect(() => {
    setStageArtifacts(initialStageArtifacts);
  }, [initialStageArtifacts]);

  useEffect(() => {
    setArticleOutcomeBundle(initialOutcomeBundle);
  }, [initialOutcomeBundle]);

  useEffect(() => {
    setSelectedOutcomeWindowCode(initialOutcomeBundle.nextWindowCode ?? "24h");
  }, [initialOutcomeBundle]);

  useEffect(() => {
    setOutcomeTargetPackage(currentArticleOutcome?.targetPackage ?? "");
    setOutcomeHitStatus(currentArticleOutcome?.hitStatus ?? "pending");
    setOutcomeReviewSummary(currentArticleOutcome?.reviewSummary ?? "");
    setOutcomeNextAction(currentArticleOutcome?.nextAction ?? "");
    setOutcomePlaybookTagsInput(currentArticleOutcome?.playbookTags.join("，") ?? "");
  }, [currentArticleOutcome]);

  useEffect(() => {
    setSeriesPlaybook(currentSeriesPlaybook);
  }, [currentSeriesPlaybook]);

  useEffect(() => {
    if (!seriesId) {
      setSeriesPlaybook(null);
      setLoadingSeriesPlaybook(false);
      return;
    }
    if (seriesId === article.seriesId) {
      setSeriesPlaybook(currentSeriesPlaybook);
      setLoadingSeriesPlaybook(false);
      return;
    }

    let cancelled = false;
    setLoadingSeriesPlaybook(true);
    void (async () => {
      try {
        const response = await fetch(`/api/playbooks?seriesId=${seriesId}`, { cache: "no-store" });
        const payload = await parseResponsePayload(response);
        if (cancelled) {
          return;
        }
        setLoadingSeriesPlaybook(false);
        if (!response.ok) {
          setSeriesPlaybook(null);
          return;
        }
        setSeriesPlaybook((payload.data ?? null) as ReviewSeriesPlaybook | null);
      } catch {
        if (cancelled) {
          return;
        }
        setLoadingSeriesPlaybook(false);
        setSeriesPlaybook(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSeriesPlaybook, article.seriesId, seriesId]);

  useEffect(() => {
    setOutcomeReadCount(String(currentOutcomeSnapshot?.readCount ?? 0));
    setOutcomeShareCount(String(currentOutcomeSnapshot?.shareCount ?? 0));
    setOutcomeLikeCount(String(currentOutcomeSnapshot?.likeCount ?? 0));
    setOutcomeNotes(currentOutcomeSnapshot?.notes ?? "");
  }, [currentOutcomeSnapshot]);

  useEffect(() => {
    setNodes(initialNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: initialNodes,
          }
        : current,
    );
    setOutlineMaterialNodeId((current) => {
      if (current && initialNodes.some((node) => String(node.id) === current)) {
        return current;
      }
      return initialNodes[0]?.id ? String(initialNodes[0].id) : "";
    });
  }, [initialNodes]);

  useEffect(() => {
    const fallbackIntent = readPendingPublishIntent(article.id);
    const nextIntent = initialWorkflow.pendingPublishIntent ?? fallbackIntent;
    setPendingPublishIntent(nextIntent);
    if (!initialWorkflow.pendingPublishIntent && fallbackIntent) {
      void persistPendingPublishIntent(fallbackIntent, { silent: true });
    }
  }, [article.id, initialWorkflow.pendingPublishIntent]);

  useEffect(() => {
    setRecentFactCheckEvidenceIssues(
      readExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(article.id), "fact-check-evidence", article.id),
    );
  }, [article.id]);

  useEffect(() => {
    if (currentStage?.code !== "audienceAnalysis") {
      return;
    }
    setAudienceSelectionDraft(hydrateAudienceSelectionDraft(currentStageArtifact?.payload, currentAudienceSelection));
  }, [currentAudienceSelection, currentStage?.code, currentStageArtifact?.payload]);

  useEffect(() => {
    if (currentStage?.code !== "outlinePlanning") {
      return;
    }
    setOutlineSelectionDraft(hydrateOutlineSelectionDraft(currentStageArtifact?.payload, currentOutlineSelection));
  }, [currentOutlineSelection, currentStage?.code, currentStageArtifact?.payload]);

  useEffect(() => {
    if (currentStage?.code !== "factCheck") {
      return;
    }
    setFactCheckSelectionDraft(currentFactCheckSelection);
  }, [currentFactCheckSelection, currentStage?.code]);

  useEffect(() => {
    if (currentStage?.code !== "outlinePlanning" || outlineMaterials || loadingOutlineMaterials) {
      return;
    }
    void loadOutlineMaterials();
  }, [currentStage?.code, loadingOutlineMaterials, outlineMaterials]);

  useEffect(() => {
    if (!canUseHistoryReferences || currentStage?.code !== "deepWriting" || loadingHistoryReferences) {
      return;
    }
    if (historyReferenceSuggestions.length > 0 || selectedHistoryReferences.length > 0) {
      return;
    }
    void loadHistoryReferences();
  }, [canUseHistoryReferences, currentStage?.code, historyReferenceSuggestions.length, loadingHistoryReferences, selectedHistoryReferences.length]);

  useEffect(() => {
    setSelectedConnectionId((current) => {
      if (current && wechatConnections.some((connection) => String(connection.id) === current)) {
        return current;
      }
      const preferred = wechatConnections.find((connection) => connection.isDefault) ?? wechatConnections[0];
      return preferred?.id ? String(preferred.id) : "";
    });
  }, [wechatConnections]);

  async function loadOutlineMaterials(force = false) {
    if (!force && loadingOutlineMaterials) {
      return;
    }
    setLoadingOutlineMaterials(true);
    try {
      const response = await fetch(`/api/articles/${article.id}/outline-materials`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材加载失败");
      }
      const nextNodes: OutlineMaterialNodeItem[] = Array.isArray(json.data?.nodes)
        ? json.data.nodes.map(normalizeOutlineMaterialNode)
        : [];
      const nextViewpoints = Array.from(
        { length: 3 },
        (_, index) => String(json.data?.supplementalViewpoints?.[index] || "").trim(),
      );
      setOutlineMaterials({
        supplementalViewpoints: nextViewpoints.filter(Boolean),
        nodes: nextNodes,
      });
      setSupplementalViewpointsDraft(nextViewpoints);
      setOutlineMaterialNodeId((current) => {
        if (current && nextNodes.some((node) => String(node.id) === current)) {
          return current;
        }
        return nextNodes[0]?.id ? String(nextNodes[0].id) : "";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材加载失败");
    } finally {
      setLoadingOutlineMaterials(false);
    }
  }

  async function saveSupplementalViewpoints() {
    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/outline-materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplementalViewpoints: supplementalViewpointsDraft
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 3),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补充观点保存失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      setOutlineMaterials((current) =>
        current
          ? {
              ...current,
              supplementalViewpoints: supplementalViewpointsDraft.map((item) => item.trim()).filter(Boolean).slice(0, 3),
            }
          : current,
      );
      setMessage("补充观点已保存到大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补充观点保存失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  function handleOutlineMaterialScreenshotFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setOutlineMaterialImageDataUrl(null);
      setOutlineMaterialScreenshotFileName("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setOutlineMaterialImageDataUrl(reader.result);
        setOutlineMaterialScreenshotFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function submitOutlineMaterial(action: "attachExisting" | "createManual" | "createUrl" | "createScreenshot") {
    const nodeId = Number(outlineMaterialNodeId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      setMessage("先选择一个大纲节点。");
      return;
    }
    if (action === "attachExisting" && !outlineMaterialFragmentId) {
      setMessage("先选择要挂载的素材。");
      return;
    }
    if (action === "createManual" && !outlineMaterialContent.trim()) {
      setMessage("手动素材内容不能为空。");
      return;
    }
    if (action === "createUrl" && !outlineMaterialUrl.trim()) {
      setMessage("链接素材不能为空。");
      return;
    }
    if (action === "createScreenshot" && !outlineMaterialImageDataUrl) {
      setMessage("先上传一张截图。");
      return;
    }

    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/outline-materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "attachExisting"
            ? {
                action,
                nodeId,
                fragmentId: Number(outlineMaterialFragmentId),
                usageMode: outlineMaterialUsageMode,
              }
            : action === "createManual"
              ? {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  content: outlineMaterialContent.trim(),
                  usageMode: "rewrite",
                }
              : {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  ...(action === "createUrl"
                    ? {
                        url: outlineMaterialUrl.trim(),
                        usageMode: "rewrite",
                      }
                    : {
                        imageDataUrl: outlineMaterialImageDataUrl,
                        note: outlineMaterialContent.trim(),
                      }),
                },
        ),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材更新失败");
      }
      const nextNodes = Array.isArray(json.data)
        ? json.data.map(normalizeOutlineMaterialNode)
        : [];
      setNodes(nextNodes);
      setOutlineMaterials((current) => ({
        supplementalViewpoints: current?.supplementalViewpoints ?? [],
        nodes: nextNodes,
      }));
      setOutlineMaterialFragmentId("");
      setOutlineMaterialTitle("");
      setOutlineMaterialContent("");
      setOutlineMaterialUrl("");
      setOutlineMaterialImageDataUrl(null);
      setOutlineMaterialScreenshotFileName("");
      if (outlineMaterialScreenshotInputRef.current) {
        outlineMaterialScreenshotInputRef.current.value = "";
      }
      setMessage(action === "attachExisting" ? "素材已挂到大纲节点。" : "素材已创建并挂到大纲节点。");
      await reloadArticleMeta();
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材更新失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  async function loadHistoryReferences(force = false) {
    if (!canUseHistoryReferences) {
      setMessage(`${displayPlanName}暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    if (!force && loadingHistoryReferences) {
      return;
    }
    setLoadingHistoryReferences(true);
    try {
      const response = await fetch(`/api/articles/${article.id}/history-references/suggest`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章建议加载失败");
      }
      const suggestions = Array.isArray(json.data?.suggestions)
        ? (json.data.suggestions as HistoryReferenceSuggestionItem[])
        : [];
      const saved = Array.isArray(json.data?.saved)
        ? (json.data.saved as HistoryReferenceSelectionItem[])
        : [];
      setHistoryReferenceSuggestions(suggestions);
      setSelectedHistoryReferences(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章建议加载失败");
    } finally {
      setLoadingHistoryReferences(false);
    }
  }

  function toggleHistoryReferenceSelection(item: HistoryReferenceSuggestionItem) {
    setSelectedHistoryReferences((current) => {
      const exists = current.some((reference) => reference.referencedArticleId === item.referencedArticleId);
      if (exists) {
        return current.filter((reference) => reference.referencedArticleId !== item.referencedArticleId);
      }
      if (current.length >= 2) {
        setMessage("历史文章自然引用最多保留 2 篇。");
        return current;
      }
      return [
        ...current,
        {
          referencedArticleId: item.referencedArticleId,
          title: item.title,
          relationReason: item.relationReason ?? null,
          bridgeSentence: item.bridgeSentence ?? null,
        },
      ];
    });
  }

  function updateHistoryReferenceField(
    referencedArticleId: number,
    field: "relationReason" | "bridgeSentence",
    value: string,
  ) {
    setSelectedHistoryReferences((current) =>
      current.map((item) =>
        item.referencedArticleId === referencedArticleId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  async function saveHistoryReferenceSelection() {
    if (!canUseHistoryReferences) {
      setMessage(`${displayPlanName}暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    setSavingHistoryReferences(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/history-references/selection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references: selectedHistoryReferences.slice(0, 2).map((item) => ({
            referencedArticleId: item.referencedArticleId,
            relationReason: item.relationReason?.trim() || null,
            bridgeSentence: item.bridgeSentence?.trim() || null,
          })),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章自然引用保存失败");
      }
      const saved = Array.isArray(json.data)
        ? (json.data as HistoryReferenceSelectionItem[])
        : [];
      setSelectedHistoryReferences(saved);
      setMessage(saved.length > 0 ? "历史文章自然引用已保存。" : "已清空历史文章自然引用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章自然引用保存失败");
    } finally {
      setSavingHistoryReferences(false);
    }
  }

  async function reloadArticleMeta() {
    const [articleResponse, nodesResponse] = await Promise.all([
      fetch(`/api/articles/${article.id}/runtime`),
      fetch(`/api/articles/${article.id}/nodes`),
    ]);
    if (!articleResponse.ok || !nodesResponse.ok) {
      return;
    }
    const articleJson = await articleResponse.json();
    const nodesJson = await nodesResponse.json();
    if (!articleJson.success || !nodesJson.success) {
      return;
    }
    setHtmlPreview(articleJson.data.htmlContent || "");
    setStatus(articleJson.data.status);
    setSeriesId(articleJson.data.seriesId ?? null);
    setWechatTemplateId(articleJson.data.wechatTemplateId ?? null);
    setSnapshots(articleJson.data.snapshots);
    if (articleJson.data.workflow) {
      setWorkflow(articleJson.data.workflow);
    }
    if (Array.isArray(articleJson.data.stageArtifacts)) {
      setStageArtifacts(articleJson.data.stageArtifacts);
    }
    const nextNodes = nodesJson.data.map(normalizeOutlineMaterialNode);
    setNodes(nextNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: nextNodes,
          }
        : current,
    );
    lastSavedRef.current = {
      title: articleJson.data.title,
      markdown: articleJson.data.markdownContent,
      status: articleJson.data.status,
      seriesId: articleJson.data.seriesId ?? null,
      wechatTemplateId: articleJson.data.wechatTemplateId ?? null,
    };
  }

  async function saveStrategyCard() {
    await persistStrategyCardDraft(strategyCardDraft);
  }

  function buildStrategyCardSavePayload(nextDraft: StrategyCardItem) {
    return {
      targetReader: nextDraft.targetReader,
      coreAssertion: nextDraft.coreAssertion,
      whyNow: nextDraft.whyNow,
      researchHypothesis: nextDraft.researchHypothesis,
      marketPositionInsight: nextDraft.marketPositionInsight,
      historicalTurningPoint: nextDraft.historicalTurningPoint,
      targetPackage: nextDraft.targetPackage,
      publishWindow: nextDraft.publishWindow,
      endingAction: nextDraft.endingAction,
      firstHandObservation: nextDraft.firstHandObservation,
      feltMoment: nextDraft.feltMoment,
      whyThisHitMe: nextDraft.whyThisHitMe,
      realSceneOrDialogue: nextDraft.realSceneOrDialogue,
      wantToComplain: nextDraft.wantToComplain,
      nonDelegableTruth: nextDraft.nonDelegableTruth,
    };
  }

  function syncStrategyCardDraftFields(nextDraft: StrategyCardItem) {
    setStrategyTargetReader(nextDraft.targetReader ?? "");
    setStrategyCoreAssertion(nextDraft.coreAssertion ?? "");
    setStrategyWhyNow(nextDraft.whyNow ?? "");
    setStrategyResearchHypothesis(nextDraft.researchHypothesis ?? "");
    setStrategyMarketPositionInsight(nextDraft.marketPositionInsight ?? "");
    setStrategyHistoricalTurningPoint(nextDraft.historicalTurningPoint ?? "");
    setStrategyTargetPackage(nextDraft.targetPackage ?? "");
    setStrategyPublishWindow(nextDraft.publishWindow ?? "");
    setStrategyEndingAction(nextDraft.endingAction ?? "");
    setStrategyFirstHandObservation(nextDraft.firstHandObservation ?? "");
    setStrategyFeltMoment(nextDraft.feltMoment ?? "");
    setStrategyWhyThisHitMe(nextDraft.whyThisHitMe ?? "");
    setStrategyRealSceneOrDialogue(nextDraft.realSceneOrDialogue ?? "");
    setStrategyWantToComplain(nextDraft.wantToComplain ?? "");
    setStrategyNonDelegableTruth(nextDraft.nonDelegableTruth ?? "");
  }

  async function persistStrategyCardDraft(
    nextDraft: StrategyCardItem,
    options?: {
      successMessage?: string;
      incompleteMessage?: string;
    },
  ) {
    setSavingStrategyCard(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/strategy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStrategyCardSavePayload(nextDraft)),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "策略卡保存失败");
      }
      const savedStrategyCard = buildStrategyCardItem({
        base: {
          ...(json.data as Partial<StrategyCardItem>),
          whyNowHints: strategyCard.whyNowHints,
        },
        targetReader: json.data?.targetReader ?? "",
        coreAssertion: json.data?.coreAssertion ?? "",
        whyNow: json.data?.whyNow ?? "",
        researchHypothesis: json.data?.researchHypothesis ?? "",
        marketPositionInsight: json.data?.marketPositionInsight ?? "",
        historicalTurningPoint: json.data?.historicalTurningPoint ?? "",
        targetPackage: json.data?.targetPackage ?? "",
        publishWindow: json.data?.publishWindow ?? "",
        endingAction: json.data?.endingAction ?? "",
        firstHandObservation: json.data?.firstHandObservation ?? "",
        feltMoment: json.data?.feltMoment ?? "",
        whyThisHitMe: json.data?.whyThisHitMe ?? "",
        realSceneOrDialogue: json.data?.realSceneOrDialogue ?? "",
        wantToComplain: json.data?.wantToComplain ?? "",
        nonDelegableTruth: json.data?.nonDelegableTruth ?? "",
        whyNowHints: strategyCard.whyNowHints,
      });
      const nextMissingFields = getStrategyCardMissingFields(savedStrategyCard);
      syncStrategyCardDraftFields(savedStrategyCard);
      setStrategyCard(savedStrategyCard);
      if (!outcomeTargetPackage.trim() && savedStrategyCard.targetPackage) {
        setOutcomeTargetPackage(savedStrategyCard.targetPackage);
      }
      setPublishPreview(null);
      setMessage(
        nextMissingFields.length === 0
          ? options?.successMessage || "策略卡已保存。"
          : options?.incompleteMessage || "策略卡已保存，仍可继续补齐剩余字段。",
      );
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "策略卡保存失败");
    } finally {
      setSavingStrategyCard(false);
    }
  }

  async function applyResearchWritebackToStrategyCard() {
    setSavingStrategyCard(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/strategy/apply-research`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "研究写回策略卡失败");
      }
      const savedStrategySource = json.data?.strategyCard ?? {};
      const savedStrategyCard = buildStrategyCardItem({
        base: savedStrategySource,
        targetReader: String(savedStrategySource.targetReader || ""),
        coreAssertion: String(savedStrategySource.coreAssertion || ""),
        whyNow: String(savedStrategySource.whyNow || ""),
        researchHypothesis: String(savedStrategySource.researchHypothesis || ""),
        marketPositionInsight: String(savedStrategySource.marketPositionInsight || ""),
        historicalTurningPoint: String(savedStrategySource.historicalTurningPoint || ""),
        targetPackage: String(savedStrategySource.targetPackage || ""),
        publishWindow: String(savedStrategySource.publishWindow || ""),
        endingAction: String(savedStrategySource.endingAction || ""),
        firstHandObservation: String(savedStrategySource.firstHandObservation || ""),
        feltMoment: String(savedStrategySource.feltMoment || ""),
        whyThisHitMe: String(savedStrategySource.whyThisHitMe || ""),
        realSceneOrDialogue: String(savedStrategySource.realSceneOrDialogue || ""),
        wantToComplain: String(savedStrategySource.wantToComplain || ""),
        nonDelegableTruth: String(savedStrategySource.nonDelegableTruth || ""),
        whyNowHints: strategyCard.whyNowHints,
      });
      const nextMissingFields = getStrategyCardMissingFields(savedStrategyCard);
      syncStrategyCardDraftFields(savedStrategyCard);
      setStrategyCard(savedStrategyCard);
      if (!outcomeTargetPackage.trim() && savedStrategyCard.targetPackage) {
        setOutcomeTargetPackage(savedStrategyCard.targetPackage);
      }
      setPublishPreview(null);
      setMessage(
        nextMissingFields.length === 0
          ? "已把研究结论写回并保存到策略卡。"
          : "已把研究结论写回策略卡，但仍可继续补齐其余字段。",
      );
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "研究写回策略卡失败");
    } finally {
      setSavingStrategyCard(false);
    }
  }

  function toggleEvidenceDraftItem(item: EvidenceItem) {
    const signature = buildEvidenceItemSignature(item);
    setEvidenceDraftItems((current) => {
      const exists = current.some((entry) => buildEvidenceItemSignature(entry) === signature);
      if (exists) {
        return current.filter((entry) => buildEvidenceItemSignature(entry) !== signature).map((entry, index) => ({ ...entry, sortOrder: index + 1 }));
      }
      return [
        ...current,
        {
          ...item,
          id: item.id > 0 ? item.id : 0,
          sortOrder: current.length + 1,
        },
      ];
    });
  }

  function buildEvidenceSavePayload(nextItems: EvidenceItem[]) {
    return {
      items: nextItems.map((item) => ({
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
      })),
    };
  }

  async function persistEvidenceItems(
    nextItems: EvidenceItem[],
    options?: {
      successMessage?: string;
      incompleteMessage?: string;
    },
  ) {
    setSavingEvidenceItems(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/evidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEvidenceSavePayload(nextItems)),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "证据包保存失败");
      }
      const savedItems = Array.isArray(json.data) ? (json.data as EvidenceItem[]) : [];
      setEvidenceItems(savedItems);
      setEvidenceDraftItems(savedItems);
      setPublishPreview(null);
      const nextStats = getArticleEvidenceStats(savedItems);
      setMessage(
        nextStats.ready
          ? options?.successMessage || "证据包已保存。"
          : options?.incompleteMessage || "证据包已保存，但还没达到发布标准。",
      );
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "证据包保存失败");
    } finally {
      setSavingEvidenceItems(false);
    }
  }

  async function applyResearchSuggestedEvidence() {
    setSavingEvidenceItems(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/evidence/apply-research`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "研究导向证据写回失败");
      }
      const savedItems = Array.isArray(json.data?.items) ? (json.data.items as EvidenceItem[]) : [];
      setEvidenceItems(savedItems);
      setEvidenceDraftItems(savedItems);
      setPublishPreview(null);
      const nextStats = getArticleEvidenceStats(savedItems);
      const appendedCount = Number(json.data?.appendedCount || 0);
      const counterEvidenceCount = Number(json.data?.counterEvidenceCount || 0);
      setMessage(
        nextStats.ready
          ? appendedCount > 0
            ? counterEvidenceCount > 0
              ? `已把 ${appendedCount} 条研究导向证据写回证据包，其中含 ${counterEvidenceCount} 条反证/反例。`
              : `已把 ${appendedCount} 条研究导向证据写回证据包。`
            : "已把当前研究导向证据写回证据包。"
          : appendedCount > 0
            ? counterEvidenceCount > 0
              ? `研究导向证据已写回证据包，其中含 ${counterEvidenceCount} 条反证/反例，但当前仍未达到发布标准。`
              : "研究导向证据已写回证据包，但当前仍未达到发布标准。"
            : "当前研究导向证据已写回证据包，但还没达到发布标准。",
      );
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "研究导向证据写回失败");
    } finally {
      setSavingEvidenceItems(false);
    }
  }

  async function saveEvidenceItems() {
    await persistEvidenceItems(evidenceDraftItems);
  }

  async function saveOutcomeSnapshot() {
    if (status !== "published") {
      setMessage("请先完成发布，再录入结果回流。");
      return;
    }
    setSavingOutcomeSnapshot(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/outcomes/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowCode: selectedOutcomeWindowCode,
          readCount: Number(outcomeReadCount || 0),
          shareCount: Number(outcomeShareCount || 0),
          likeCount: Number(outcomeLikeCount || 0),
          notes: outcomeNotes,
          targetPackage: outcomeTargetPackage,
          hitStatus: outcomeHitStatus,
          reviewSummary: outcomeReviewSummary,
          nextAction: outcomeNextAction,
          playbookTags: outcomePlaybookTagsInput
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "结果快照保存失败");
      }
      const bundle = json.data as ArticleOutcomeBundleItem;
      setArticleOutcomeBundle(bundle);
      if (bundle.nextWindowCode) {
        setSelectedOutcomeWindowCode(bundle.nextWindowCode);
      }
      setMessage(`已保存 ${OUTCOME_WINDOWS.find((item) => item.code === selectedOutcomeWindowCode)?.label || selectedOutcomeWindowCode} 结果快照。`);
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "结果快照保存失败");
    } finally {
      setSavingOutcomeSnapshot(false);
    }
  }

  async function saveArticleDraft(nextStatus?: string, nextMarkdown?: string, silent = false, nextTitle?: string) {
    if (!seriesId) {
      setSaveState("待选择系列");
      if (!silent) {
        setMessage(seriesOptions.length > 0 ? "每篇稿件都必须绑定系列，请先选择一个系列。" : "请先去设置创建至少 1 个系列，再继续写稿。");
      }
      return false;
    }
    const resolvedTitle = nextTitle ?? title;
    const response = await fetch(`/api/articles/${article.id}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resolvedTitle,
        markdownContent: nextMarkdown ?? markdown,
        status: nextStatus || status,
        seriesId,
        wechatTemplateId,
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseResponseMessage(response);
      setSaveState("保存失败");
      setMessage(errorMessage);
      return false;
    }

    const json = await response.json();
    if (json.success) {
      const savedStatus = json.data.status;
      setHtmlPreview(json.data.htmlContent || "");
      setTitle(resolvedTitle);
      setStatus(savedStatus);
      setSeriesId(json.data.seriesId ?? null);
      setWechatTemplateId(json.data.wechatTemplateId ?? null);
      lastSavedRef.current = {
        title: resolvedTitle,
        markdown: nextMarkdown ?? markdown,
        status: savedStatus,
        seriesId: json.data.seriesId ?? null,
        wechatTemplateId: json.data.wechatTemplateId ?? null,
      };
      setSaveState(silent ? "已自动保存" : "已保存");
      if (!silent) {
        setMessage("");
      }
      return true;
    }

    setSaveState("保存失败");
    return false;
  }

  useEffect(() => {
    if (generating) {
      return;
    }
    if (
      title === lastSavedRef.current.title &&
      markdown === lastSavedRef.current.markdown &&
      seriesId === lastSavedRef.current.seriesId &&
      wechatTemplateId === lastSavedRef.current.wechatTemplateId
    ) {
      return;
    }

    setSaveState("自动保存中…");
    const timer = window.setTimeout(() => {
      void saveArticleDraft(undefined, undefined, true);
    }, ARTICLE_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [generating, markdown, seriesId, title, wechatTemplateId]);

  function jumpToEditorialAnnotation(anchorId: string) {
    const target = editorialPreviewRef.current?.querySelector<HTMLElement>(`#${anchorId}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }

  useEffect(() => {
    setPublishPreview(null);
  }, [title, markdown, wechatTemplateId]);

  async function createSnapshot() {
    const note = snapshotNote.trim() || "手动快照";
    const saved = await saveArticleDraft();
    if (!saved) {
      return;
    }
    const response = await fetch(`/api/articles/${article.id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setSnapshotNote("");
    setMessage("已创建快照");
    await reloadArticleMeta();
  }

  async function restoreSnapshot(snapshotId: number) {
    const response = await fetch(`/api/articles/${article.id}/snapshot/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    await reloadArticleMeta();
    refreshRouter(router);
  }

  async function loadDiff(snapshotId: number) {
    setLoadingDiffId(snapshotId);
    const response = await fetch(`/api/articles/${article.id}/diff?snapshotId=${snapshotId}`);
    setLoadingDiffId(null);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    const json = await response.json();
    if (json.success) {
      setDiffState({
        snapshotId: json.data.snapshot.id,
        snapshotNote: json.data.snapshot.snapshotNote,
        createdAt: json.data.snapshot.createdAt,
        summary: json.data.summary,
        lines: json.data.lines,
      });
    }
  }

  async function generate() {
    if (generateBlockedByResearch) {
      setMessage(generateBlockedMessage || "研究层信源覆盖仍不足，请先补研究简报。");
      return;
    }
    const requestedPrototypeCode = String(deepWritingPrototypeOverride || "").trim() || null;
    const requestedStateVariantCode = String(deepWritingStateVariantOverride || "").trim() || null;
    const currentPrototypeCode = String(deepWritingArtifact?.payload?.articlePrototype || "").trim() || null;
    const currentStateVariantCode = String(deepWritingArtifact?.payload?.stateVariantCode || "").trim() || null;
    const pendingPrototypeOverride = Boolean(requestedPrototypeCode && requestedPrototypeCode !== currentPrototypeCode);
    const pendingStateVariantOverride = Boolean(requestedStateVariantCode && requestedStateVariantCode !== currentStateVariantCode);
    if (pendingPrototypeOverride || pendingStateVariantOverride) {
      const prototypeLabel =
        pendingPrototypeOverride
          ? String(
              getPayloadRecordArray(deepWritingArtifact?.payload, "prototypeOptions").find(
                (item) => String(item.code || "").trim() === requestedPrototypeCode,
              )?.label || requestedPrototypeCode,
            ).trim()
          : null;
      const stateVariantLabel =
        pendingStateVariantOverride
          ? String(
              getPayloadRecordArray(deepWritingArtifact?.payload, "stateOptions").find(
                (item) => String(item.code || "").trim() === requestedStateVariantCode,
              )?.label || requestedStateVariantCode,
            ).trim()
          : null;
      setMessage("检测到当前已切换文章原型或写作状态，但执行卡还没刷新。系统先重生写作执行卡，再开始正文生成。");
      const refreshed = await generateStageArtifact("deepWriting", {
        articlePrototypeCode: pendingPrototypeOverride ? requestedPrototypeCode : null,
        articlePrototypeLabel: prototypeLabel,
        stateVariantCode: pendingStateVariantOverride ? requestedStateVariantCode : null,
        stateVariantLabel,
      });
      if (!refreshed) {
        return;
      }
    }
    await updateWorkflow("deepWriting", "set");
    setGenerating(true);
    setMessage("");
    setStatus("generating");
    setSaveState("流式生成中…");
    setView("edit");

    const response = await fetch(`/api/articles/${article.id}/generate/stream`);
    if (!response.ok || !response.body) {
      setGenerating(false);
      setStatus(lastSavedRef.current.status);
      setMessage(await parseResponseMessage(response));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    setMarkdown("");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as { status: string; delta?: string };
        if (payload.status === "writing" && payload.delta) {
          assembled += payload.delta;
          setMarkdown(assembled);
        }
      }
    }

    const saved = await saveArticleDraft("ready", assembled, false);
    setGenerating(false);
    if (saved) {
      await updateWorkflow("factCheck", "set");
      setMessage("生成完成");
      await reloadArticleMeta();
    }
  }

  async function publish() {
    if (!canShowWechatControls) {
      setMessage(`${displayPlanName}暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true, "missing_connection");
      setMessage("当前还没有可用公众号连接，已保留待发布状态。补录公众号 AppID / AppSecret 后会自动恢复发布。");
      return;
    }
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function requestPublishPreview(options?: { silent?: boolean; setLoading?: boolean }) {
    if (options?.setLoading ?? true) {
      setLoadingPublishPreview(true);
    }
    if (!options?.silent) {
      setMessage("");
    }
    try {
      const response = await fetch(`/api/articles/${article.id}/publish-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdownContent: markdown,
          templateId: wechatTemplateId,
          wechatConnectionId: selectedConnectionId ? Number(selectedConnectionId) : null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "发布前预览生成失败");
      }
      return json.data as PublishPreviewState;
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "发布前预览生成失败");
      }
      return null;
    } finally {
      if (options?.setLoading ?? true) {
        setLoadingPublishPreview(false);
      }
    }
  }

  async function loadPublishPreview() {
    const nextPreview = await requestPublishPreview();
    if (!nextPreview) {
      return;
    }
    setPublishPreview(nextPreview);
    setView("preview");
    setMessage(
      !nextPreview.publishGuard.canPublish
        ? `发布前检查未通过：${nextPreview.publishGuard.blockers[0] || "请先处理拦截项。"}`
        : nextPreview.isConsistentWithSavedHtml
          ? "发布前最终预览已更新，当前保存版与微信最终渲染一致。"
          : "发布前最终预览已更新。检测到保存版与最终发布效果存在差异，请先刷新。",
    );
  }

  async function refreshPublishPreviewRender() {
    setRefreshingPublishPreview(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (!nextPreview) {
        throw new Error("刷新最终发布效果失败");
      }
      setPublishPreview(nextPreview);
      setHtmlPreview(nextPreview.finalHtml || "");
      setView("preview");
      setMessage("已刷新为最终发布效果，当前 HTML 预览与微信发布渲染一致。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新最终发布效果失败");
    } finally {
      setRefreshingPublishPreview(false);
    }
  }

  function resetWechatConnectDraft() {
    setWechatConnectAccountName("");
    setWechatConnectOriginalId("");
    setWechatConnectAppId("");
    setWechatConnectAppSecret("");
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
  }

  function closeWechatConnectModal() {
    if (wechatConnectSubmitting) {
      return;
    }
    setShowWechatConnectModal(false);
    setContinuePublishAfterWechatConnect(false);
    resetWechatConnectDraft();
  }

  async function persistPendingPublishIntent(intentOverride?: PendingPublishIntent, options?: { silent?: boolean }) {
    const nextIntent = intentOverride ?? {
      articleId: article.id,
      createdAt: new Date().toISOString(),
      templateId: wechatTemplateId,
      reason: "missing_connection",
    } satisfies PendingPublishIntent;
    setPendingPublishIntent(nextIntent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(nextIntent));
    }
    try {
      const response = await fetch(`/api/articles/${article.id}/publish-intent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextIntent),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "待恢复发布意图保存失败");
      }
      const serverIntent = json.data?.pendingPublishIntent as PendingPublishIntent | null | undefined;
      if (serverIntent) {
        setPendingPublishIntent(serverIntent);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(serverIntent));
        }
      }
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "待恢复发布意图保存失败");
      }
    }
    return nextIntent;
  }

  async function clearPendingPublishIntent() {
    setPendingPublishIntent(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    }
    try {
      await fetch(`/api/articles/${article.id}/publish-intent`, {
        method: "DELETE",
      });
    } catch {}
  }

  async function openWechatConnectModal(
    continuePublish = false,
    reason: PendingPublishIntent["reason"] = "missing_connection",
  ) {
    if (!canShowWechatControls) {
      setMessage(`${displayPlanName}暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (continuePublish) {
      await persistPendingPublishIntent(
        {
          articleId: article.id,
          createdAt: new Date().toISOString(),
          templateId: wechatTemplateId,
          reason,
        },
        { silent: true },
      );
    }
    setContinuePublishAfterWechatConnect(continuePublish);
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
    setShowWechatConnectModal(true);
  }

  async function resumePendingPublishIntent() {
    if (!pendingPublishIntent) {
      setMessage("当前没有待恢复的发布意图。");
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true, pendingPublishIntent.reason);
      return;
    }
    setMessage("正在恢复上次中断的发布流程。");
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function reloadWechatConnections() {
    const nextConnections = await listWechatConnectionsAction() as WechatConnectionItem[];
    setWechatConnections(nextConnections);
    return nextConnections;
  }

  async function reloadSyncLogs() {
    const nextLogs = await listWechatSyncLogsAction(article.id) as RecentSyncLogItem[];
    setSyncLogs(nextLogs.slice(0, 3));
    return nextLogs;
  }

  async function continuePublishWithConnection(connectionId: number) {
    setPublishing(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return false;
      }
      const response = await fetch(`/api/articles/${article.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wechatConnectionId: connectionId,
          templateId: wechatTemplateId,
        }),
      });
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        if (payload.data && typeof payload.data === "object" && "publishGuard" in payload.data) {
          const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
          if (nextPreview) {
            setPublishPreview(nextPreview);
            setView("preview");
          }
        }
        const errorCode = payload.data && typeof payload.data.code === "string" ? payload.data.code : "";
        if (errorCode === "auth_failed") {
          await persistPendingPublishIntent({
            articleId: article.id,
            createdAt: new Date().toISOString(),
            templateId: wechatTemplateId,
            reason: "auth_failed",
          }, { silent: true });
          setContinuePublishAfterWechatConnect(true);
          setWechatConnectAccountName(selectedConnection?.accountName || "");
          setWechatConnectOriginalId(selectedConnection?.originalId || "");
          setWechatConnectAppId("");
          setWechatConnectAppSecret("");
          setWechatConnectIsDefault(Boolean(selectedConnection?.isDefault) || wechatConnections.length === 0);
          setWechatConnectMessage("当前公众号凭证不可用。补录公众号 AppID / AppSecret 后，系统会自动继续本次发布。");
          setShowWechatConnectModal(true);
          setMessage("公众号凭证不可用，已保留待发布状态。补录凭证后会自动恢复发布。");
          return false;
        }
        throw new Error(payload.message);
      }
      const json = await response.json().catch(() => null);
      await clearPendingPublishIntent();
      setStatus("published");
      setView("preview");
      await reloadArticleMeta();
      await reloadSyncLogs();
      refreshRouter(router);
      setMessage(
        json?.success && json?.data?.mediaId
          ? `已推送到微信草稿箱，媒体 ID：${json.data.mediaId}。当前页已刷新为发布后的稿件状态。`
          : "已推送到微信草稿箱，当前页已刷新为发布后的稿件状态。",
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "推送微信草稿箱失败");
      return false;
    } finally {
      setPublishing(false);
    }
  }

  async function retryLatestPublish() {
    if (!selectedConnectionId) {
      setMessage("请先选择一个公众号连接再重试。");
      return;
    }
    setRetryingPublish(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      const response = await fetch(`/api/articles/${article.id}/publish/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wechatConnectionId: Number(selectedConnectionId),
          templateId: wechatTemplateId,
        }),
      });
      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
        if (nextPreview) {
          setPublishPreview(nextPreview);
          setView("preview");
        }
        throw new Error(payload.message);
      }
      await clearPendingPublishIntent();
      await reloadArticleMeta();
      await reloadSyncLogs();
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
      }
      setStatus("published");
      setView("preview");
      setMessage("已按最近失败上下文重新推送到微信草稿箱。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布重试失败");
    } finally {
      setRetryingPublish(false);
    }
  }

  async function submitWechatConnectionFromEditor(event: FormEvent) {
    event.preventDefault();
    setWechatConnectSubmitting(true);
    setWechatConnectMessage("");
    try {
      await upsertWechatConnectionAction({
        accountName: wechatConnectAccountName,
        originalId: wechatConnectOriginalId,
        appId: wechatConnectAppId,
        appSecret: wechatConnectAppSecret,
        isDefault: wechatConnectIsDefault,
      });
      const nextConnections = await reloadWechatConnections();
      const preferredConnection =
        nextConnections.find((connection) => connection.isDefault) ??
        nextConnections.find((connection) => connection.accountName === wechatConnectAccountName.trim()) ??
        nextConnections[0];
      if (!preferredConnection) {
        throw new Error("公众号连接已创建，但未能获取到连接信息");
      }
      setSelectedConnectionId(String(preferredConnection.id));
      setShowWechatConnectModal(false);
      resetWechatConnectDraft();
      if (continuePublishAfterWechatConnect) {
        setContinuePublishAfterWechatConnect(false);
        setMessage("公众号已连接，继续推送到微信草稿箱。");
        await continuePublishWithConnection(preferredConnection.id);
        return;
      }
      setMessage("公众号连接已创建，可直接继续发布。");
    } catch (error) {
      setWechatConnectMessage(error instanceof Error ? error.message : "公众号连接失败");
    } finally {
      setWechatConnectSubmitting(false);
    }
  }

  async function generateCoverImage() {
    await updateWorkflow("coverImage", "set");
    setGeneratingCover(true);
    setMessage("");
    try {
      const data = await generateCoverImageAction({
        articleId: article.id,
        title: title.trim() || article.title,
        referenceImageDataUrl: canUseCoverImageReference ? coverImageReferenceDataUrl : null,
      });
      setCoverImageCandidates(
        Array.isArray(data.candidates)
          ? data.candidates.map((item: { id: number; variantLabel: string; imageUrl: string; prompt: string }) => ({
              id: item.id,
              variantLabel: item.variantLabel,
              imageUrl: item.imageUrl,
              prompt: item.prompt,
              isSelected: false,
              createdAt: data.createdAt || new Date().toISOString(),
            }))
          : [],
      );
      if (data.quota) {
        setCoverImageQuota(data.quota);
      }
      if (data.storageQuota) {
        setImageAssetQuota(data.storageQuota);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "封面图生成失败");
    } finally {
      setGeneratingCover(false);
    }
  }

  async function selectCoverCandidate(candidateId: number) {
    setSelectingCoverCandidateId(candidateId);
    setMessage("");
    try {
      const data = await selectCoverCandidateAction(candidateId);
      setCoverImage({
        imageUrl: data.imageUrl,
        prompt: data.prompt,
        createdAt: data.createdAt || new Date().toISOString(),
      });
      setCoverImageCandidates((current) =>
        current.map((item) => ({
          ...item,
          isSelected: item.id === candidateId,
        })),
      );
      if (workflow.currentStageCode === "coverImage") {
        await updateWorkflow("coverImage", "complete", true);
        setMessage("封面图已选入稿件资产，已自动进入一键排版。");
      } else {
        setMessage("封面图已选入稿件资产");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择封面图失败");
    } finally {
      setSelectingCoverCandidateId(null);
    }
  }

  async function saveImagePromptAssets() {
    setSavingImagePrompts(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/image-prompts`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存配图提示词失败");
      }
      setImagePrompts(json.data);
      setMessage("段落配图提示词已保存到稿件资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配图提示词失败");
    } finally {
      setSavingImagePrompts(false);
    }
  }

  function handleCoverReferenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setCoverImageReferenceDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverImageReferenceDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage("Markdown 已复制到剪贴板");
    } catch {
      setMessage("复制 Markdown 失败");
    }
  }

  async function refreshKnowledgeCard(cardId: number) {
    setRefreshingKnowledgeId(cardId);
    setMessage("");
    try {
      const detail = await refreshKnowledgeCardAction(cardId);
      setKnowledgeCardItems((current) =>
        reorderKnowledgeCards(
          upsertKnowledgeCard(
            current,
            buildHighlightedKnowledgeCard(detail, current.find((card) => card.id === cardId) ?? null),
          ),
          cardId,
        ),
      );
      setExpandedKnowledgeCardId(cardId);
      setHighlightedKnowledgeCardId(cardId);
      setMessage("背景卡已刷新");
    } catch {
      setMessage("背景卡刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  async function addFactCheckEvidenceSource(urlOverride?: string) {
    const url = (urlOverride ?? factCheckEvidenceUrl).trim();
    if (!url) {
      setMessage("先输入要补证的文章链接。");
      return;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setAddingFactCheckEvidence(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/fact-check-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: `${title || article.title} 补证链接`,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补证链接抓取失败");
      }
      setFactCheckEvidenceUrl("");
      if (json.data?.artifact) {
        setStageArtifacts((current) => upsertStageArtifact(current, json.data.artifact));
      }
      const refreshedKnowledgeCards = Array.isArray(json.data?.knowledgeCards) ? json.data.knowledgeCards : null;
      const refreshedKnowledgeCardId = typeof json.data?.compiledKnowledgeCard?.id === "number" ? json.data.compiledKnowledgeCard.id : null;
      if (refreshedKnowledgeCards) {
        setKnowledgeCardItems((current) => {
          const cards =
            refreshedKnowledgeCardId && json.data?.compiledKnowledgeCard
              ? upsertKnowledgeCard(
                  refreshedKnowledgeCards,
                  buildHighlightedKnowledgeCard(
                    json.data.compiledKnowledgeCard,
                    refreshedKnowledgeCards.find((card: KnowledgeCardPanelItem) => card.id === refreshedKnowledgeCardId) ??
                      current.find((card) => card.id === refreshedKnowledgeCardId) ??
                      null,
                  ),
                )
              : refreshedKnowledgeCards;
          return reorderKnowledgeCards(cards, refreshedKnowledgeCardId);
        });
      } else if (refreshedKnowledgeCardId && json.data?.compiledKnowledgeCard) {
        setKnowledgeCardItems((current) =>
          reorderKnowledgeCards(
            upsertKnowledgeCard(
              current,
              buildHighlightedKnowledgeCard(
                json.data.compiledKnowledgeCard,
                current.find((card) => card.id === refreshedKnowledgeCardId) ?? null,
              ),
            ),
            refreshedKnowledgeCardId,
          ),
        );
      }
      if (refreshedKnowledgeCardId) {
        setExpandedKnowledgeCardId(refreshedKnowledgeCardId);
        setHighlightedKnowledgeCardId(refreshedKnowledgeCardId);
      }
      await reloadArticleMeta();
      if (json.data?.degradedReason) {
        const nextIssues = prependExternalFetchIssue(recentFactCheckEvidenceIssues, {
          articleId: article.id,
          context: "fact-check-evidence",
          title: `${title || article.title} 补证链接`,
          url,
          degradedReason: json.data.degradedReason,
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
        setRecentFactCheckEvidenceIssues(nextIssues);
        writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(article.id), nextIssues);
        setFactCheckEvidenceIssue({
          url,
          degradedReason: json.data.degradedReason,
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
      } else {
        const recovered = markExternalFetchIssueRecovered(recentFactCheckEvidenceIssues, {
          context: "fact-check-evidence",
          url,
        });
        if (recovered.recovered) {
          setRecentFactCheckEvidenceIssues(recovered.issues);
          writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(article.id), recovered.issues);
        }
        setFactCheckEvidenceIssue(null);
      }
      setMessage(
        json.data?.degradedReason
          ? `补证链接已入稿并刷新相关背景卡，但抓取存在降级：${json.data.degradedReason}`
          : "补证链接已入稿，事实核查与相关背景卡已刷新。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补证链接抓取失败");
    } finally {
      setAddingFactCheckEvidence(false);
    }
  }

  function dismissFactCheckEvidenceIssue(issueId: string) {
    const nextIssues = removeExternalFetchIssue(recentFactCheckEvidenceIssues, issueId);
    setRecentFactCheckEvidenceIssues(nextIssues);
    writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(article.id), nextIssues);
  }

  async function generateStageArtifact(stageCode: string, options?: {
    articlePrototypeCode?: string | null;
    articlePrototypeLabel?: string | null;
    stateVariantCode?: string | null;
    stateVariantLabel?: string | null;
  }) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      setMessage("当前步骤暂不支持生成结构化洞察卡。");
      return false;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return false;
    }
    setGeneratingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const requestBody =
        options?.articlePrototypeCode || options?.stateVariantCode
          ? {
              ...(options?.articlePrototypeCode ? { articlePrototypeCode: options.articlePrototypeCode } : {}),
              ...(options?.stateVariantCode ? { stateVariantCode: options.stateVariantCode } : {}),
            }
          : null;
      const response = await fetch(`/api/articles/${article.id}/stages/${stageCode}`, {
        method: "POST",
        headers: requestBody ? { "Content-Type": "application/json" } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "阶段产物生成失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      if (workflow.currentStageCode === stageCode) {
        await updateWorkflow(stageCode, "complete", true);
      }
      setMessage(
        stageCode === "deepWriting" && (options?.articlePrototypeCode || options?.stateVariantCode)
          ? `${GENERATABLE_STAGE_ACTIONS[stageCode].label}已完成，当前按「${[
              options.articlePrototypeLabel || options.articlePrototypeCode || "",
              options.stateVariantLabel || options.stateVariantCode || "",
            ].filter(Boolean).join(" / ")}」生成。`
          : `${GENERATABLE_STAGE_ACTIONS[stageCode].label}已完成`,
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "阶段产物生成失败");
      return false;
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function requestDeepWritingOpeningPreview(options: {
    articlePrototypeCode?: string | null;
    stateVariantCode?: string | null;
  }) {
    const response = await fetch(`/api/articles/${article.id}/generate/opening-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articlePrototypeCode: options.articlePrototypeCode || undefined,
        stateVariantCode: options.stateVariantCode || undefined,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "候选开头预览生成失败");
    }
    return String(json.data?.previewMarkdown || "").trim();
  }

  async function loadDeepWritingOpeningPreview(options: {
    previewKey: string;
    articlePrototypeCode?: string | null;
    stateVariantCode?: string | null;
  }) {
    setDeepWritingOpeningPreviewLoadingKey(options.previewKey);
    try {
      const previewMarkdown = await requestDeepWritingOpeningPreview({
        articlePrototypeCode: options.articlePrototypeCode,
        stateVariantCode: options.stateVariantCode,
      });
      setDeepWritingOpeningPreviews((current) => ({
        ...current,
        [options.previewKey]: previewMarkdown,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "候选开头预览生成失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function sampleDeepWritingStateOpenings(input: {
    articlePrototypeCode?: string | null;
    states: Array<{ previewKey: string; stateVariantCode: string | null }>;
  }) {
    setDeepWritingOpeningPreviewLoadingKey("state-batch");
    try {
      const nextEntries: Array<[string, string]> = [];
      for (const item of input.states) {
        const previewMarkdown = await requestDeepWritingOpeningPreview({
          articlePrototypeCode: input.articlePrototypeCode,
          stateVariantCode: item.stateVariantCode,
        });
        nextEntries.push([item.previewKey, previewMarkdown]);
      }
      if (nextEntries.length > 0) {
        setDeepWritingOpeningPreviews((current) => ({
          ...current,
          ...Object.fromEntries(nextEntries),
        }));
        setMessage(`已生成 ${nextEntries.length} 个状态开头样稿，可直接横向比较。`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "多状态开头采样失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function sampleDeepWritingPrototypeOpenings(input: {
    stateVariantCode?: string | null;
    prototypes: Array<{ previewKey: string; articlePrototypeCode: string | null }>;
  }) {
    setDeepWritingOpeningPreviewLoadingKey("prototype-batch");
    try {
      const nextEntries: Array<[string, string]> = [];
      for (const item of input.prototypes) {
        const previewMarkdown = await requestDeepWritingOpeningPreview({
          articlePrototypeCode: item.articlePrototypeCode,
          stateVariantCode: input.stateVariantCode,
        });
        nextEntries.push([item.previewKey, previewMarkdown]);
      }
      if (nextEntries.length > 0) {
        setDeepWritingOpeningPreviews((current) => ({
          ...current,
          ...Object.fromEntries(nextEntries),
        }));
        setMessage(`已生成 ${nextEntries.length} 个原型开头样稿，可直接横向比较。`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "多原型开头采样失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function prefetchStageArtifact(stageCode: string) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      return false;
    }
    setGeneratingStageArtifactCode(stageCode);
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/${stageCode}`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return false;
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      return true;
    } catch {
      return false;
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function applyStageArtifact(stageCode: string) {
    const action = GENERATABLE_STAGE_ACTIONS[stageCode];
    if (!action) {
      setMessage("当前步骤暂不支持把洞察卡应用到正文。");
      return;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setApplyingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/${stageCode}/apply`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "应用阶段产物失败");
      }
      const appliedTitle = String(json.data.title || "").trim() || title;
      setTitle(appliedTitle);
      setMarkdown(json.data.markdownContent || "");
      setHtmlPreview(json.data.htmlContent || "");
      setStatus(normalizeArticleStatus(json.data.status));
      setView("edit");
      lastSavedRef.current = {
        title: appliedTitle,
        markdown: json.data.markdownContent || "",
        status: normalizeArticleStatus(json.data.status),
        seriesId,
        wechatTemplateId,
      };
      setSaveState("已应用到正文");
      if (stageCode === "factCheck") {
        await updateWorkflow("prosePolish", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入文笔润色。`);
      } else if (stageCode === "prosePolish") {
        await updateWorkflow("layout", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入一键排版。`);
      } else {
        setMessage(`${action.label}已写回正文`);
      }
      await reloadArticleMeta();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "应用阶段产物失败");
    } finally {
      setApplyingStageArtifactCode(null);
    }
  }

  async function syncOutlineArtifactToNodes() {
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setSyncingOutlineArtifact(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/outlinePlanning/sync-outline`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "同步大纲树失败");
      }
      setNodes(json.data);
      await reloadArticleMeta();
      setMessage("大纲规划已同步到左侧大纲树");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步大纲树失败");
    } finally {
      setSyncingOutlineArtifact(false);
    }
  }

  async function saveAudienceSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "audienceAnalysis") {
      setMessage("当前没有可保存的受众确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/audienceAnalysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedReaderLabel: audienceSelectionDraft.selectedReaderLabel || null,
              selectedLanguageGuidance: audienceSelectionDraft.selectedLanguageGuidance || null,
              selectedBackgroundAwareness: audienceSelectionDraft.selectedBackgroundAwareness || null,
              selectedReadabilityLevel: audienceSelectionDraft.selectedReadabilityLevel || null,
              selectedCallToAction: audienceSelectionDraft.selectedCallToAction.trim() || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存受众确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("outlinePlanning", "set", true);
      const prepared = await prefetchStageArtifact("outlinePlanning");
      setMessage(prepared ? "受众分析已确认，已自动进入大纲规划并生成首版大纲。" : "受众分析已确认，已自动进入大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存受众确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function saveOutlineSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "outlinePlanning") {
      setMessage("当前没有可保存的大纲确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/outlinePlanning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedTitle: outlineSelectionDraft.selectedTitle || null,
              selectedTitleStyle: outlineSelectionDraft.selectedTitleStyle || null,
              selectedOpeningHook: outlineSelectionDraft.selectedOpeningHook || null,
              selectedTargetEmotion: outlineSelectionDraft.selectedTargetEmotion || null,
              selectedEndingStrategy: outlineSelectionDraft.selectedEndingStrategy || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存大纲确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      const confirmedTitle = outlineSelectionDraft.selectedTitle.trim();
      if (confirmedTitle) {
        const saved = await saveArticleDraft(undefined, undefined, true, confirmedTitle);
        if (!saved) {
          throw new Error("大纲确认已保存，但同步稿件标题失败");
        }
      }
      await updateWorkflow("deepWriting", "set", true);
      const prepared = await prefetchStageArtifact("deepWriting");
      setMessage(prepared ? "大纲规划已确认，已自动进入深度写作并生成写作执行卡。" : "大纲规划已确认，已自动进入深度写作。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存大纲确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  function updateFactCheckDecision(claim: string, status: string, patch: Partial<FactCheckClaimDecision>) {
    const normalizedClaim = String(claim || "").trim();
    if (!normalizedClaim) {
      return;
    }
    setFactCheckSelectionDraft((current) => {
      const existing = getFactCheckDecision(current, normalizedClaim, status);
      const nextDecision = {
        ...existing,
        ...patch,
        claim: normalizedClaim,
      } satisfies FactCheckClaimDecision;
      const others = current.claimDecisions.filter((item) => item.claim !== normalizedClaim);
      return {
        claimDecisions: [...others, nextDecision],
      };
    });
  }

  async function saveFactCheckSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "factCheck") {
      setMessage("当前没有可保存的核查处置结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${article.id}/stages/factCheck`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              claimDecisions: factCheckSelectionDraft.claimDecisions.map((item) => ({
                claim: item.claim,
                action: item.action,
                note: item.note.trim() || null,
              })),
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存核查处置失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("prosePolish", "set", true);
      const prepared = await prefetchStageArtifact("prosePolish");
      setMessage(prepared ? "事实核查处置已确认，已自动进入文笔润色并生成首版润色建议。" : "事实核查处置已确认，已自动进入文笔润色。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存核查处置失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function applyLayoutTemplate() {
    setApplyingLayout(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      setView("preview");
      await updateWorkflow("layout", "complete", true);
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
        setHtmlPreview(nextPreview.finalHtml || "");
      }
      await reloadArticleMeta();
      setMessage(
        selectedTemplate
          ? `已应用模板「${selectedTemplate.name}」，并自动生成发布最终预览。`
          : "已应用默认排版样式，并自动生成发布最终预览。",
      );
    } finally {
      setApplyingLayout(false);
    }
  }

  async function updateWorkflow(stageCode: string, action: "set" | "complete" | "fail" = "set", silent = false) {
    setUpdatingWorkflowCode(stageCode);
    try {
      const response = await fetch(`/api/articles/${article.id}/workflow/runtime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageCode, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "稿件步骤更新失败");
      }
      setWorkflow(json.data);
      if (action === "set" || action === "complete") {
        setView(getDefaultWorkspaceViewForStageCode(stageCode));
      }
    } catch (error) {
      if (!silent) {
        setMessage(error instanceof Error ? error.message : "稿件步骤更新失败");
      }
    } finally {
      setUpdatingWorkflowCode(null);
    }
  }

  useEffect(() => {
    if (!requestedMainStepCode) {
      return;
    }
    const requestKey = `${article.id}:${requestedMainStepCode}`;
    if (requestedMainStepHandledRef.current === requestKey) {
      return;
    }
    const targetStep = ARTICLE_MAIN_STEPS.find((step) => step.code === requestedMainStepCode);
    if (!targetStep) {
      requestedMainStepHandledRef.current = requestKey;
      return;
    }
    if (currentArticleMainStep.code === requestedMainStepCode) {
      requestedMainStepHandledRef.current = requestKey;
      return;
    }
    requestedMainStepHandledRef.current = requestKey;
    void updateWorkflow(targetStep.primaryStageCode, "set", true);
    setMessage(`已切换到「${targetStep.title}」步骤。`);
  }, [currentArticleMainStep.code, article.id, requestedMainStepCode]);

  useEffect(() => {
    if (!pathname) {
      return;
    }
    const nextParams = new URLSearchParams(currentSearchParams);
    if (nextParams.get("step") === currentArticleMainStep.code) {
      return;
    }
    nextParams.set("step", currentArticleMainStep.code);
    const nextQuery = nextParams.toString();
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const currentHref = currentSearchParams ? `${pathname}?${currentSearchParams}` : pathname;
    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [currentArticleMainStep.code, currentSearchParams, pathname, router]);

  function renderResearchWorkspacePanel() {
    const researchAction = GENERATABLE_STAGE_ACTIONS.researchBrief;
    const researchSourceCoverage = getPayloadRecord(researchArtifact?.payload, "sourceCoverage");
    const researchStrategyWriteback = getPayloadRecord(researchArtifact?.payload, "strategyWriteback");
    const researchTimelineCards = getPayloadRecordArray(researchArtifact?.payload, "timelineCards");
    const researchComparisonCards = getPayloadRecordArray(researchArtifact?.payload, "comparisonCards");
    const researchIntersectionInsights = getPayloadRecordArray(researchArtifact?.payload, "intersectionInsights");
    const researchMustCoverAngles = getPayloadStringArray(researchArtifact?.payload, "mustCoverAngles");
    const researchHypothesesToVerify = getPayloadStringArray(researchArtifact?.payload, "hypothesesToVerify");
    const researchForbiddenConclusions = getPayloadStringArray(researchArtifact?.payload, "forbiddenConclusions");
    const researchCoverageSufficiency = String(researchSourceCoverage?.sufficiency || "").trim();
    const researchCoverageTone = researchCoverageSufficiency === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : researchCoverageSufficiency === "limited"
        ? "border-warning/40 bg-surfaceWarning text-warning"
        : "border-danger/30 bg-surface text-danger";
    const researchCoverageItems = [
      { key: "official", label: "官方源" },
      { key: "industry", label: "行业源" },
      { key: "comparison", label: "同类源" },
      { key: "userVoice", label: "用户源" },
      { key: "timeline", label: "时间源" },
    ].map((item) => {
      const signals = getPayloadStringArray(researchSourceCoverage, item.key);
      return {
        ...item,
        signals,
      };
    });
    const researchCoverageMissing = getPayloadStringArray(researchSourceCoverage, "missingCategories");
    const strategyWritebackFields = [
      {
        key: "targetReader",
        label: "目标读者",
        value: String(researchStrategyWriteback?.targetReader || "").trim(),
        currentValue: strategyTargetReader.trim(),
      },
      {
        key: "coreAssertion",
        label: "主判断",
        value: String(researchStrategyWriteback?.coreAssertion || "").trim(),
        currentValue: strategyCoreAssertion.trim(),
      },
      {
        key: "whyNow",
        label: "Why Now",
        value: String(researchStrategyWriteback?.whyNow || "").trim(),
        currentValue: strategyWhyNow.trim(),
      },
      {
        key: "researchHypothesis",
        label: "研究假设",
        value: String(researchStrategyWriteback?.researchHypothesis || "").trim(),
        currentValue: strategyResearchHypothesis.trim(),
      },
      {
        key: "marketPositionInsight",
        label: "位置洞察",
        value: String(researchStrategyWriteback?.marketPositionInsight || "").trim(),
        currentValue: strategyMarketPositionInsight.trim(),
      },
      {
        key: "historicalTurningPoint",
        label: "历史转折点",
        value: String(researchStrategyWriteback?.historicalTurningPoint || "").trim(),
        currentValue: strategyHistoricalTurningPoint.trim(),
      },
    ].filter((item) => item.value);
    const renderResearchSourceReferences = (sources: Record<string, unknown>[]) => {
      if (sources.length === 0) {
        return null;
      }
      return (
        <div className="mt-3 space-y-2">
          <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">来源追溯</div>
          <div className="space-y-2">
            {sources.map((source, index) => {
              const label = String(source.label || `来源 ${index + 1}`).trim();
              const sourceType = String(source.sourceType || "").trim();
              const detail = String(source.detail || "").trim();
              const sourceUrl = String(source.sourceUrl || "").trim();
              return (
                <div key={`${label}-${sourceType}-${sourceUrl || index}`} className="border border-lineStrong/60 bg-surface px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-ink">{label}</div>
                    {sourceType ? (
                      <span className="border border-lineStrong px-2 py-1 text-[11px] text-inkMuted">
                        {formatResearchSourceTraceLabel(sourceType)}
                      </span>
                    ) : null}
                  </div>
                  {detail ? <div className="mt-2 text-xs leading-6 text-inkMuted">{detail}</div> : null}
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank" rel="noreferrer"
                      className="mt-2 inline-block text-xs text-cinnabar underline"
                    >
                      打开原始来源
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Research Workspace</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">hv-analysis 轻量研究面板</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              先把时间脉络、横向比较和交汇洞察补齐，再让策略卡、大纲和正文判断吃到这层研究底座。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {researchArtifact?.updatedAt ? (
              <div className="text-xs leading-6 text-inkMuted">
                更新于 {new Date(researchArtifact.updatedAt).toLocaleString("zh-CN")}
              </div>
            ) : null}
            <Button
              type="button"
              onClick={() => generateStageArtifact("researchBrief")}
              disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
              variant="primary"
              size="sm"
            >
              {generatingStageArtifactCode === "researchBrief"
                ? "生成中…"
                : researchArtifact
                  ? "刷新研究简报"
                  : researchAction.label}
            </Button>
          </div>
        </div>

        {researchArtifact ? (
          <>
            {researchArtifact.summary ? (
              <div className="border border-lineStrong/60 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                {researchArtifact.summary}
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">Research Brief</div>
                <div className="mt-3 space-y-3 text-sm leading-7 text-inkSoft">
                  {String(researchArtifact.payload?.researchObject || "").trim() ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">研究对象</div>
                      <div className="mt-1">{String(researchArtifact.payload?.researchObject)}</div>
                    </div>
                  ) : null}
                  {String(researchArtifact.payload?.coreQuestion || "").trim() ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">核心研究问题</div>
                      <div className="mt-1">{String(researchArtifact.payload?.coreQuestion)}</div>
                    </div>
                  ) : null}
                  {String(researchArtifact.payload?.authorHypothesis || "").trim() ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">待验证假设</div>
                      <div className="mt-1">{String(researchArtifact.payload?.authorHypothesis)}</div>
                    </div>
                  ) : null}
                  {String(researchArtifact.payload?.targetReader || "").trim() ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">默认读者</div>
                      <div className="mt-1">{String(researchArtifact.payload?.targetReader)}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={`border px-4 py-4 ${researchCoverageTone}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em]">Source Sufficiency</div>
                    <div className="mt-2 font-serifCn text-2xl text-balance">{formatResearchCoverageSufficiencyLabel(researchCoverageSufficiency)}</div>
                  </div>
                  <div className="text-xs leading-6">
                    {researchCoverageItems.filter((item) => item.signals.length > 0).length} / {researchCoverageItems.length} 类来源已覆盖
                  </div>
                </div>
                {String(researchSourceCoverage?.note || "").trim() ? (
                  <div className="mt-2 text-sm leading-7">{String(researchSourceCoverage?.note)}</div>
                ) : null}
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {researchCoverageItems.map((item) => (
                    <div key={item.key} className="border border-current/20 bg-surface/60 px-3 py-3 text-sm leading-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-ink">{item.label}</div>
                        <div className="text-xs">{item.signals.length > 0 ? "已覆盖" : "待补"}</div>
                      </div>
                      <div className="mt-2 text-xs">
                        {item.signals.length > 0 ? item.signals.slice(0, 2).join("；") : "当前还没有命中这一类信号。"}
                      </div>
                    </div>
                  ))}
                </div>
                {researchCoverageMissing.length > 0 ? (
                  <div className="mt-3 text-xs leading-6">
                    当前缺口：{researchCoverageMissing.join("、")}
                  </div>
                ) : null}
              </div>
            </div>

            {(researchMustCoverAngles.length > 0 || researchHypothesesToVerify.length > 0 || researchForbiddenConclusions.length > 0) ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {researchMustCoverAngles.length > 0 ? (
                  <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">必查维度</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                      {researchMustCoverAngles.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {researchHypothesesToVerify.length > 0 ? (
                  <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">重点验证</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                      {researchHypothesesToVerify.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {researchForbiddenConclusions.length > 0 ? (
                  <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">禁止先下结论</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                      {researchForbiddenConclusions.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">时间脉络</div>
                  <div className="text-xs text-inkMuted">{researchTimelineCards.length} 张卡</div>
                </div>
                {researchTimelineCards.length > 0 ? (
                  researchTimelineCards.map((item, index) => (
                    <div key={`${String(item.title || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {String(item.phase || "").trim() ? (
                          <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-[11px] text-inkSoft">
                            {String(item.phase)}
                          </span>
                        ) : null}
                        <div className="font-medium text-ink">{String(item.title || `阶段 ${index + 1}`)}</div>
                      </div>
                      {String(item.summary || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.summary)}</div>
                      ) : null}
                      {getPayloadStringArray(item, "signals").length > 0 ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          线索：{getPayloadStringArray(item, "signals").join("；")}
                        </div>
                      ) : null}
                      {renderResearchSourceReferences(getPayloadRecordArray(item, "sources"))}
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                    还没有时间脉络卡。没有这层，文章会更容易只写“现在发生了什么”。
                  </div>
                )}
              </div>

              <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">横向对比</div>
                  <div className="text-xs text-inkMuted">{researchComparisonCards.length} 张卡</div>
                </div>
                {researchComparisonCards.length > 0 ? (
                  researchComparisonCards.map((item, index) => (
                    <div key={`${String(item.subject || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                      <div className="font-medium text-ink">{String(item.subject || `对比对象 ${index + 1}`)}</div>
                      {String(item.position || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.position)}</div>
                      ) : null}
                      {getPayloadStringArray(item, "differences").length > 0 ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          关键差异：{getPayloadStringArray(item, "differences").join("；")}
                        </div>
                      ) : null}
                      {getPayloadStringArray(item, "userVoices").length > 0 ? (
                        <div className="mt-1 text-xs leading-6 text-inkMuted">
                          用户反馈：{getPayloadStringArray(item, "userVoices").join("；")}
                        </div>
                      ) : null}
                      {(getPayloadStringArray(item, "opportunities").length > 0 || getPayloadStringArray(item, "risks").length > 0) ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {getPayloadStringArray(item, "opportunities").length > 0 ? (
                            <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-6 text-emerald-700">
                              机会：{getPayloadStringArray(item, "opportunities").join("；")}
                            </div>
                          ) : null}
                          {getPayloadStringArray(item, "risks").length > 0 ? (
                            <div className="border border-danger/30 bg-surface px-3 py-2 text-xs leading-6 text-danger">
                              风险：{getPayloadStringArray(item, "risks").join("；")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {renderResearchSourceReferences(getPayloadRecordArray(item, "sources"))}
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                    还没有横向比较卡。没有同类或替代路径，后续判断更容易写成单点观察。
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">交汇洞察</div>
                  <div className="text-xs text-inkMuted">{researchIntersectionInsights.length} 条</div>
                </div>
                {researchIntersectionInsights.length > 0 ? (
                  researchIntersectionInsights.map((item, index) => (
                    <div key={`${String(item.insight || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                      <div className="font-medium text-ink">{String(item.insight || `洞察 ${index + 1}`)}</div>
                      {String(item.whyNow || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">Why now：{String(item.whyNow)}</div>
                      ) : null}
                      {getPayloadStringArray(item, "support").length > 0 ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          支撑线索：{getPayloadStringArray(item, "support").join("；")}
                        </div>
                      ) : null}
                      {String(item.caution || "").trim() ? (
                        <div className="mt-2 border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                          注意：{String(item.caution)}
                        </div>
                      ) : null}
                      {renderResearchSourceReferences(getPayloadRecordArray(item, "sources"))}
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                    还没有交汇洞察。时间脉络和横向比较没有合流前，正文主判断最好保持克制。
                  </div>
                )}
              </div>

              <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">策略写回</div>
                    <div className="mt-1 text-xs text-inkMuted">
                      {currentArticleMainStep.code === "strategy" ? "可直接回填策略卡" : "会继续喂给大纲与正文"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentArticleMainStep.code === "strategy" && strategyWritebackFields.length > 0 ? (
                      <Button
                        type="button"
                        onClick={() => void applyResearchWritebackToStrategyCard()}
                        disabled={savingStrategyCard}
                        variant="secondary"
                        size="sm"
                        className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                      >
                        {savingStrategyCard ? "写回中…" : "一键写回策略卡"}
                      </Button>
                    ) : null}
                    {currentArticleMainStep.code === "evidence" && suggestedEvidenceItems.length > 0 ? (
                      <Button
                        type="button"
                        onClick={() => void applyResearchSuggestedEvidence()}
                        disabled={savingEvidenceItems}
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                      >
                        {savingEvidenceItems ? "写回中…" : "一键写回证据包"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {strategyWritebackFields.length > 0 ? (
                  strategyWritebackFields.map((item) => {
                    const synced = item.currentValue && item.currentValue === item.value;
                    return (
                      <div key={item.key} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">{item.label}</div>
                          {item.currentValue ? (
                            <div className={`text-xs ${synced ? "text-emerald-700" : "text-warning"}`}>
                              {synced ? "已与当前策略一致" : "可用于补当前策略"}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{item.value}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                    当前研究简报还没有产出可写回的策略字段。
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
            当前还没有研究简报。建议先生成一版，把时间脉络、同类对比和交汇洞察补齐后，再继续策略确认或证据整理。
          </div>
        )}
      </div>
    );
  }

  function renderStrategyCardPanel() {
    const strategyStatusTone = !strategyCardIsComplete
      ? "border-danger/30 bg-surface text-danger"
      : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
        ? "border-warning/40 bg-surfaceWarning text-warning"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
    const strategyStatusText = !strategyCardIsComplete
      ? `还缺 ${strategyCardMissingFields.length} 个必填项`
      : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
        ? "已补齐，待确认保存"
        : "已确认保存";
    const strategyFields: Array<{
      key: keyof typeof ARTICLE_STRATEGY_FIELD_LABELS;
      value: string;
      setValue: (value: string) => void;
      placeholder: string;
      suggestion: string;
      multiline?: boolean;
    }> = [
      {
        key: "targetReader",
        value: strategyTargetReader,
        setValue: setStrategyTargetReader,
        placeholder: "这篇真正写给谁看，别写成泛用户。",
        suggestion: strategySuggestedValues.targetReader,
        multiline: true,
      },
      {
        key: "coreAssertion",
        value: strategyCoreAssertion,
        setValue: setStrategyCoreAssertion,
        placeholder: "这篇文章最想成立的判断是什么。",
        suggestion: strategySuggestedValues.coreAssertion,
        multiline: true,
      },
      {
        key: "whyNow",
        value: strategyWhyNow,
        setValue: setStrategyWhyNow,
        placeholder: "为什么这周值得写，而不是以后再说。",
        suggestion: strategySuggestedValues.whyNow,
        multiline: true,
      },
      {
        key: "targetPackage",
        value: strategyTargetPackage,
        setValue: setStrategyTargetPackage,
        placeholder: "例如：5k / 10w+ / 高转发讨论。",
        suggestion: strategySuggestedValues.targetPackage,
      },
      {
        key: "publishWindow",
        value: strategyPublishWindow,
        setValue: setStrategyPublishWindow,
        placeholder: "例如：周二早高峰 / 财报发布后 24 小时内。",
        suggestion: strategySuggestedValues.publishWindow,
      },
      {
        key: "endingAction",
        value: strategyEndingAction,
        setValue: setStrategyEndingAction,
        placeholder: "希望读者读完后采取什么动作。",
        suggestion: strategySuggestedValues.endingAction,
        multiline: true,
      },
    ];
    const strategyResearchFields: Array<{
      key: "researchHypothesis" | "marketPositionInsight" | "historicalTurningPoint";
      label: string;
      value: string;
      setValue: (value: string) => void;
      placeholder: string;
    }> = [
      {
        key: "researchHypothesis",
        label: "研究假设",
        value: strategyResearchHypothesis,
        setValue: setStrategyResearchHypothesis,
        placeholder: "这篇判断在研究层最需要验证的假设，不要直接写成已证实结论。",
      },
      {
        key: "marketPositionInsight",
        label: "位置洞察",
        value: strategyMarketPositionInsight,
        setValue: setStrategyMarketPositionInsight,
        placeholder: "真正决定差异的位置、组织能力或用户结构判断。",
      },
      {
        key: "historicalTurningPoint",
        label: "历史转折点",
        value: strategyHistoricalTurningPoint,
        setValue: setStrategyHistoricalTurningPoint,
        placeholder: "最适合开场、也最能解释今天处境的那个历史节点。",
      },
    ];
    const humanSignalFields: Array<{
      key: keyof typeof ARTICLE_HUMAN_SIGNAL_FIELD_LABELS;
      value: string;
      setValue: (value: string) => void;
      placeholder: string;
    }> = [
      {
        key: "firstHandObservation",
        value: strategyFirstHandObservation,
        setValue: setStrategyFirstHandObservation,
        placeholder: "这篇里你亲眼看到、亲手试过或亲自经历的具体观察。",
      },
      {
        key: "feltMoment",
        value: strategyFeltMoment,
        setValue: setStrategyFeltMoment,
        placeholder: "哪个瞬间最有体感，比如愣住、上头、别扭、兴奋。",
      },
      {
        key: "whyThisHitMe",
        value: strategyWhyThisHitMe,
        setValue: setStrategyWhyThisHitMe,
        placeholder: "为什么这件事会打到你，而不是只是一条信息。",
      },
      {
        key: "realSceneOrDialogue",
        value: strategyRealSceneOrDialogue,
        setValue: setStrategyRealSceneOrDialogue,
        placeholder: "一个真实场景、原话或你记得的细节片段。",
      },
      {
        key: "wantToComplain",
        value: strategyWantToComplain,
        setValue: setStrategyWantToComplain,
        placeholder: "这篇里你最想吐槽、反驳或拆掉的点。",
      },
      {
        key: "nonDelegableTruth",
        value: strategyNonDelegableTruth,
        setValue: setStrategyNonDelegableTruth,
        placeholder: "一条不能交给 AI 编的真话，宁可不漂亮也要真。",
      },
    ];
    const humanSignalTone = strategyCardDraft.humanSignalScore >= 3
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : strategyCardDraft.humanSignalScore >= 2
        ? "border-warning/40 bg-surfaceWarning text-warning"
        : "border-danger/30 bg-surface text-danger";

    return (
      <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Strategy Card</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">发布前必须确认的策略卡</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这六项会直接进入发布守门。系统会先按受众分析、大纲和系列洞察给你预填建议，但只有手动保存后才算正式确认。
            </div>
          </div>
          <div className={`border px-3 py-2 text-xs ${strategyStatusTone}`}>{strategyStatusText}</div>
        </div>

        <div className={`border px-4 py-3 text-sm leading-7 ${strategyStatusTone}`}>
          {!strategyCardIsComplete
            ? `当前还缺：${strategyCardMissingFields.join("、")}。`
            : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
              ? "草稿字段已经补齐，但还没确认保存，发布守门仍会阻断。"
              : "策略卡已经保存，后续可以围绕它继续补证据、写执行卡和发布。"}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {strategyFields.map((field) => {
            const suggestion = field.suggestion.trim();
            const isConfirmed = strategyCardDraft.completion[field.key];
            return (
              <label key={field.key} className="block border border-lineStrong bg-surface px-4 py-4 text-sm text-inkSoft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{ARTICLE_STRATEGY_FIELD_LABELS[field.key]}</div>
                  <div className={`text-xs ${isConfirmed ? "text-emerald-700" : "text-danger"}`}>
                    {isConfirmed ? "已填写" : "必填"}
                  </div>
                </div>
                {field.multiline ? (
                  <Textarea
                    aria-label={ARTICLE_STRATEGY_FIELD_LABELS[field.key]}
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    placeholder={field.placeholder}
                    className="mt-3 min-h-[104px] px-3 py-2"
                  />
                ) : (
                  <Input
                    aria-label={ARTICLE_STRATEGY_FIELD_LABELS[field.key]}
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    placeholder={field.placeholder}
                    className="mt-3 px-3 py-2"
                  />
                )}
                {suggestion ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs leading-6 text-inkMuted">建议来源：{suggestion}</div>
                    {field.value.trim() !== suggestion ? (
                      <Button
                        type="button"
                        onClick={() => field.setValue(suggestion)}
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                      >
                        用建议填入
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">研究写回字段</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                这三项不参与发布必填，但会把 research brief 的判断链正式沉到策略卡里，后续深写、事实核查和复盘都能继续引用。
              </div>
            </div>
            <div className="text-xs text-inkMuted">
              {strategyResearchFields.filter((field) => field.value.trim()).length} / {strategyResearchFields.length} 已补
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {strategyResearchFields.map((field) => (
              <label key={field.key} className="block border border-lineStrong bg-surfaceWarm px-4 py-4 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{field.label}</div>
                <Textarea
                  aria-label={field.label}
                  value={field.value}
                  onChange={(event) => field.setValue(event.target.value)}
                  placeholder={field.placeholder}
                  className="mt-3 min-h-[120px] px-3 py-2"
                />
              </label>
            ))}
          </div>
        </div>

        {strategyCardDraft.whyNowHints.length > 0 ? (
          <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">系列给出的 Why Now 线索</div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-inkSoft">
                {strategyCardDraft.whyNowHints.map((item) => (
                <Button
                  key={item}
                  type="button"
                  onClick={() =>
                    setStrategyWhyNow((current) => {
                      const currentValue = current.trim();
                      return currentValue ? `${currentValue}；${item}` : item;
                    })
                  }
                  variant="secondary"
                  size="sm"
                  className="bg-paperStrong text-left text-sm"
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">完成度</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
            {(Object.entries(ARTICLE_STRATEGY_FIELD_LABELS) as Array<[keyof typeof ARTICLE_STRATEGY_FIELD_LABELS, string]>).map(([key, label]) => (
              <span
                key={key}
                className={`border px-3 py-2 ${
                  strategyCardDraft.completion[key]
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-danger/30 bg-surface text-danger"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">Human Only Signals</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                这里填的是 AI 不该替你编的东西。没有这些信号，系统最多只能给你一篇结构正确的稿，给不了真正像人的稿。
              </div>
            </div>
            <div className={`border px-3 py-2 text-xs ${humanSignalTone}`}>
              已补 {strategyCardDraft.humanSignalScore} / 6
            </div>
          </div>
          <div className={`border px-4 py-3 text-sm leading-7 ${humanSignalTone}`}>
            {strategyCardDraft.humanSignalScore >= 3
              ? "人类信号充足，生成时会优先按你的观察、体感和真实场景落笔。"
              : strategyCardDraft.humanSignalScore >= 2
                ? "人类信号达到最低建议线，但还可以继续补，让正文更像你自己。"
                : "当前人类信号偏少。系统仍能生成，但更容易写成结构正确、呼吸感不足的稿子。"}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {humanSignalFields.map((field) => {
              const isConfirmed = strategyCardDraft.humanSignalCompletion[field.key];
              return (
                <label key={field.key} className="block border border-lineStrong bg-surfaceWarm px-4 py-4 text-sm text-inkSoft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{ARTICLE_HUMAN_SIGNAL_FIELD_LABELS[field.key]}</div>
                    <div className={`text-xs ${isConfirmed ? "text-emerald-700" : "text-inkMuted"}`}>
                      {isConfirmed ? "已填写" : "建议填写"}
                    </div>
                  </div>
                  <Textarea
                    aria-label={ARTICLE_HUMAN_SIGNAL_FIELD_LABELS[field.key]}
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    placeholder={field.placeholder}
                    className="mt-3 min-h-[104px] px-3 py-2"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={saveStrategyCard}
            disabled={savingStrategyCard}
            variant="primary"
          >
            {savingStrategyCard ? "保存中…" : "确认并保存策略卡"}
          </Button>
          <div className="text-xs leading-6 text-inkMuted">
            保存后，发布预检和正式推送都会按这张卡判断是否放行。
          </div>
        </div>
      </div>
    );
  }

  function renderEvidencePackagePanel() {
    const evidenceStatusTone = !evidenceDraftStats.ready
      ? "border-danger/30 bg-surface text-danger"
      : !savedEvidenceStats.ready || evidenceHasUnsavedChanges
        ? "border-warning/40 bg-surfaceWarning text-warning"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
    const selectedKeys = new Set(evidenceDraftItems.map(buildEvidenceItemSignature));
    const availableSuggestedItems = suggestedEvidenceItems.filter((item) => !selectedKeys.has(buildEvidenceItemSignature(item)));

    return (
      <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Evidence Package</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">发布前必须确认的证据包</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              证据步骤不再只看素材挂载数量。这里需要明确保存一组真正用于发布守门的证据条目，至少 3 条，且至少 1 条外部来源或截图证据。
            </div>
          </div>
          <div className={`border px-3 py-2 text-xs ${evidenceStatusTone}`}>
            {!evidenceDraftStats.ready
              ? "未达最低标准"
              : !savedEvidenceStats.ready || evidenceHasUnsavedChanges
                ? "待确认保存"
                : "已确认保存"}
          </div>
        </div>

        <div className={`border px-4 py-3 text-sm leading-7 ${evidenceStatusTone}`}>
          {!evidenceDraftStats.ready
            ? `当前证据包还缺：${evidenceDraftStats.flags.join("、")}。`
            : !savedEvidenceStats.ready || evidenceHasUnsavedChanges
              ? "证据包草稿已达到最低标准，但还没保存，发布守门仍会阻断。"
              : "证据包已经保存，后续可继续处理事实核查和发布准备。"}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">已选证据</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{evidenceDraftStats.itemCount}</div>
          </div>
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">外部来源</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{evidenceDraftStats.externalEvidenceCount}</div>
          </div>
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">截图证据</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{evidenceDraftStats.screenshotEvidenceCount}</div>
          </div>
          <div className="border border-lineStrong bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">来源类型</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{evidenceDraftStats.uniqueSourceTypeCount}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">当前已选证据</div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => setEvidenceDraftItems(suggestedEvidenceItems.map((item, index) => ({ ...item, sortOrder: index + 1 })))}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                采用当前建议包
              </Button>
              <Button
                type="button"
                onClick={() => setEvidenceDraftItems([])}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                清空草稿
              </Button>
            </div>
          </div>
          {evidenceDraftItems.length > 0 ? (
            <div className="space-y-3">
              {evidenceDraftItems.map((item, index) => (
                <div key={`${buildEvidenceItemSignature(item)}-${index}`} className="border border-lineStrong bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{item.title || `证据 ${index + 1}`}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-inkMuted">
                        <span>{formatFragmentSourceType(item.sourceType)}</span>
                        <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">{formatEvidenceRoleLabel(item.evidenceRole)}</span>
                        {formatEvidenceResearchTagLabel(item.researchTag) ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">{formatEvidenceResearchTagLabel(item.researchTag)}</span>
                        ) : null}
                        {item.claim ? <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">支撑判断：{item.claim}</span> : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => toggleEvidenceDraftItem(item)}
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                    >
                      移出证据包
                    </Button>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt}</div>
                  {item.rationale ? <div className="mt-2 text-xs leading-6 text-inkMuted">{item.rationale}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                    {item.fragmentId ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">素材 #{item.fragmentId}</span> : null}
                    {item.nodeId ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">节点 #{item.nodeId}</span> : null}
                    {item.screenshotPath ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">截图证据</span> : null}
                  </div>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank" rel="noreferrer"
                      className="mt-3 inline-block border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft"
                    >
                      打开原始链接
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
              当前还没有选入证据包的条目。你可以先采用建议包，再手动删减到真正要守门的证据。
            </div>
          )}
        </div>

        {availableSuggestedItems.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">可追加的建议证据</div>
            <div className="space-y-3">
              {availableSuggestedItems.slice(0, 8).map((item, index) => (
                <div key={`${buildEvidenceItemSignature(item)}-suggested-${index}`} className="border border-lineStrong/60 bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{item.title || `建议证据 ${index + 1}`}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-inkMuted">
                        <span>{formatFragmentSourceType(item.sourceType)}</span>
                        <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">{formatEvidenceRoleLabel(item.evidenceRole)}</span>
                        {formatEvidenceResearchTagLabel(item.researchTag) ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">{formatEvidenceResearchTagLabel(item.researchTag)}</span>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => toggleEvidenceDraftItem(item)}
                      variant="secondary"
                      size="sm"
                      className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      加入证据包
                    </Button>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt}</div>
                  {item.rationale ? <div className="mt-2 text-xs leading-6 text-inkMuted">{item.rationale}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={saveEvidenceItems}
            disabled={savingEvidenceItems}
            variant="primary"
          >
            {savingEvidenceItems ? "保存中…" : "确认并保存证据包"}
          </Button>
          <div className="text-xs leading-6 text-inkMuted">
            发布预检只看已保存的证据包，不看临时草稿。
          </div>
        </div>
      </div>
    );
  }

  function renderOutcomeWorkspace() {
    if (status !== "published") {
      return (
        <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          稿件还没正式发布，结果阶段暂不可录入。发布完成后，这里会接管 24h / 72h / 7d 快照、命中判定和复盘建议。
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="border border-lineStrong bg-surfaceWarm p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">结果回流</div>
          <div className="mt-2 grid gap-3 md:grid-cols-4">
            <div className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前判定</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{formatOutcomeHitStatus(currentArticleOutcome?.hitStatus ?? "pending")}</div>
            </div>
            <div className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">目标包</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{currentArticleOutcome?.targetPackage || "未填写"}</div>
            </div>
            <div className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">预测分</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {articleScorecardSummary?.predictedScore != null ? `${Math.round(articleScorecardSummary.predictedScore)} / 100` : "暂未接入"}
              </div>
            </div>
            <div className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">已补快照</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {articleOutcomeBundle.completedWindowCodes.length > 0 ? articleOutcomeBundle.completedWindowCodes.join(" / ") : "暂无"}
              </div>
            </div>
          </div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">
            {articleOutcomeBundle.missingWindowCodes.length > 0
              ? `当前还缺 ${articleOutcomeBundle.missingWindowCodes.join(" / ")} 快照。`
              : "24h / 72h / 7d 快照已补齐，可以专注写命中判定与复盘动作。"}
          </div>
          <div className="mt-4 border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">写作状态回流</div>
            {currentOutcomeSnapshot?.writingStateFeedback ? (
              <>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐原型</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.recommendedPrototypeLabel || currentOutcomeSnapshot.writingStateFeedback.recommendedPrototypeCode || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">采用原型</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.adoptedPrototypeLabel || currentOutcomeSnapshot.writingStateFeedback.adoptedPrototypeCode || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">原型是否跟随推荐</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.followedPrototypeRecommendation === null
                        ? "未记录"
                        : currentOutcomeSnapshot.writingStateFeedback.followedPrototypeRecommendation
                          ? "跟随推荐"
                          : "覆盖推荐"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐状态</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.recommendedVariantLabel || currentOutcomeSnapshot.writingStateFeedback.recommendedVariantCode || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">采用状态</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.adoptedVariantLabel || currentOutcomeSnapshot.writingStateFeedback.adoptedVariantCode || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">状态是否跟随推荐</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.followedRecommendation === null
                        ? "未记录"
                        : currentOutcomeSnapshot.writingStateFeedback.followedRecommendation
                          ? "跟随推荐"
                          : "覆盖推荐"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐写法呼吸</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {[
                        currentOutcomeSnapshot.writingStateFeedback.recommendedOpeningPatternLabel,
                        currentOutcomeSnapshot.writingStateFeedback.recommendedSyntaxPatternLabel,
                        currentOutcomeSnapshot.writingStateFeedback.recommendedEndingPatternLabel,
                      ].filter(Boolean).join(" / ") || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">实际写法呼吸</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {[
                        currentOutcomeSnapshot.writingStateFeedback.adoptedOpeningPatternLabel,
                        currentOutcomeSnapshot.writingStateFeedback.adoptedSyntaxPatternLabel,
                        currentOutcomeSnapshot.writingStateFeedback.adoptedEndingPatternLabel,
                      ].filter(Boolean).join(" / ") || "未记录"}
                    </div>
                  </div>
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">模式是否跟随推荐</div>
                    <div className="mt-2 text-sm leading-7 text-ink">
                      {currentOutcomeSnapshot.writingStateFeedback.followedPatternRecommendation === null
                        ? "未记录"
                        : currentOutcomeSnapshot.writingStateFeedback.followedPatternRecommendation
                          ? "跟随推荐"
                          : "覆盖推荐"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs leading-6 text-inkMuted">
                  本次回流记录覆盖 {currentOutcomeSnapshot.writingStateFeedback.availableVariantCount} 个候选状态，
                  其中纳入 {currentOutcomeSnapshot.writingStateFeedback.comparisonSampleCount} 个对比样本。
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm leading-7 text-inkMuted">
                这个时间窗还没有写作回流。保存结果快照时，系统会自动记录当时采用的是不是推荐原型、推荐状态和推荐写法呼吸。
              </div>
            )}
            {currentOutcomeSnapshot?.writingStateFeedback?.recommendationReason ? (
              <div className="mt-3 text-xs leading-6 text-inkMuted">
                推荐理由：{currentOutcomeSnapshot.writingStateFeedback.recommendationReason}
              </div>
            ) : null}
            {currentOutcomeSnapshot?.writingStateFeedback?.adoptedReason ? (
              <div className="mt-1 text-xs leading-6 text-inkMuted">
                实际采用原因：{currentOutcomeSnapshot.writingStateFeedback.adoptedReason}
              </div>
            ) : null}
          </div>
          {articleScorecardSummary ? (
            <div className="mt-4 border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前文章分数卡</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">质量分</div>
                  <div className="mt-2 text-lg text-ink">
                    {articleScorecardSummary.qualityScore != null ? Math.round(articleScorecardSummary.qualityScore) : "--"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">爆款分</div>
                  <div className="mt-2 text-lg text-ink">
                    {articleScorecardSummary.viralScore != null ? Math.round(articleScorecardSummary.viralScore) : "--"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">风险扣分</div>
                  <div className="mt-2 text-lg text-cinnabar">
                    {articleScorecardSummary.riskPenalty != null ? Math.round(articleScorecardSummary.riskPenalty) : "--"}
                  </div>
                </div>
              </div>
              {articleScorecardSummary.summary ? (
                <div className="mt-3 text-sm leading-7 text-inkSoft">{articleScorecardSummary.summary}</div>
              ) : null}
              {articleScorecardSummary.blockers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {articleScorecardSummary.blockers.map((item) => (
                    <span key={item} className="border border-cinnabar/20 bg-surfaceWarning px-2 py-1 text-xs text-cinnabar">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {articleScorecardSummary.aiNoiseScore != null || articleScorecardSummary.aiNoiseLevel ? (
                <div className="mt-3 text-xs leading-6 text-inkMuted">
                  AI 噪声 {articleScorecardSummary.aiNoiseScore != null ? Math.round(articleScorecardSummary.aiNoiseScore) : "--"} ·{" "}
                  {articleScorecardSummary.aiNoiseLevel || "unknown"}
                </div>
              ) : null}
            </div>
          ) : null}
          {latestSyncLog ? (
            <div className="mt-2 text-xs leading-6 text-inkMuted">
              最近发布记录：{new Date(latestSyncLog.createdAt).toLocaleString("zh-CN")} · {latestSyncLog.connectionName || "未命名公众号"}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-lineStrong bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结果快照</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {OUTCOME_WINDOWS.map((windowItem) => {
                const snapshot = articleOutcomeBundle.snapshots.find((item) => item.windowCode === windowItem.code) ?? null;
                const isActive = selectedOutcomeWindowCode === windowItem.code;
                return (
                  <Button
                    key={windowItem.code}
                    type="button"
                    onClick={() => setSelectedOutcomeWindowCode(windowItem.code)}
                    variant="secondary"
                    fullWidth
                    className={`h-full whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                      isActive
                        ? "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning"
                        : snapshot
                          ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                          : "border-lineStrong/60 bg-surface"
                    }`}
                  >
                    <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">{windowItem.label}</span>
                    <span className="mt-2 text-sm leading-7 text-inkSoft">
                      {snapshot
                        ? `阅读 ${snapshot.readCount} · 分享 ${snapshot.shareCount} · 在看 ${snapshot.likeCount}`
                        : "尚未录入"}
                    </span>
                    <span className="mt-2 text-xs leading-6 text-inkMuted">
                      {snapshot?.updatedAt ? `更新于 ${new Date(snapshot.updatedAt).toLocaleString("zh-CN")}` : "点击后可开始录入"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-lineStrong bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">命中复盘</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-inkSoft">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">复盘结论</div>
                  <div className="mt-1">{currentArticleOutcome?.reviewSummary || "还没有复盘结论。先补数据，再写本次命中或失手的关键原因。"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">下一步动作</div>
                  <div className="mt-1">{currentArticleOutcome?.nextAction || "还没有下一步动作。建议明确下一篇继续复用或立刻停用的打法。"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">打法标签</div>
                  <div className="mt-1">
                    {currentArticleOutcome?.playbookTags.length ? currentArticleOutcome.playbookTags.join(" / ") : "还没有沉淀打法标签。"}
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-lineStrong bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前系列推荐打法</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {selectedSeries
                  ? `当前稿件归属「${selectedSeries.name}」，绑定人设为 ${selectedSeries.personaName}。`
                  : "当前稿件还没有绑定系列，请先完成系列绑定，再沉淀可复用打法。"}
              </div>
              {loadingSeriesPlaybook ? (
                <div className="mt-4 border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  正在刷新当前系列的推荐打法...
                </div>
              ) : seriesPlaybook ? (
                <>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-inkSoft">
                    <span className="border border-lineStrong bg-paperStrong px-3 py-1">
                      命中 {seriesPlaybook.hitCount} 篇
                    </span>
                    <span className="border border-lineStrong bg-paperStrong px-3 py-1">
                      差一点 {seriesPlaybook.nearMissCount} 篇
                    </span>
                    <span className="border border-lineStrong bg-paperStrong px-3 py-1">
                      已沉淀 {seriesPlaybook.articleCount} 篇
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {seriesPlaybook.topLabels.slice(0, 3).map((item) => (
                      <div key={item.label} className="border border-lineStrong/60 bg-surfaceWarm px-3 py-3 text-sm leading-7 text-inkSoft">
                        <div className="font-medium text-ink">{item.label}</div>
                        <div className="mt-1 text-xs leading-6 text-inkMuted">
                          命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇 · 最近出现在
                          {item.latestArticleTitle ? `《${item.latestArticleTitle}》` : "结果样本中"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-xs leading-6 text-inkMuted">
                    {seriesPlaybook.latestArticleTitle
                      ? `最近一次系列沉淀来自《${seriesPlaybook.latestArticleTitle}》。`
                      : "当前系列已有结果样本，但还缺最近命中标题。"}
                  </div>
                </>
              ) : (
                <div className="mt-4 border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前系列还没有足够的真实回流样本。先补 24h / 72h / 7d 快照，并给结果写清楚打法标签。
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border border-lineStrong bg-surface p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">录入结果</div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">时间窗</div>
                <Select aria-label="结果时间窗"
                  value={selectedOutcomeWindowCode}
                  onChange={(event) => setSelectedOutcomeWindowCode(event.target.value as "24h" | "72h" | "7d")}
                  className="px-3 py-2"
                >
                  {OUTCOME_WINDOWS.map((windowItem) => (
                    <option key={windowItem.code} value={windowItem.code}>{windowItem.label}</option>
                  ))}
                </Select>
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm text-inkSoft">
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">阅读</div>
                  <Input aria-label="阅读数" value={outcomeReadCount} onChange={(event) => setOutcomeReadCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
                </label>
                <label className="block text-sm text-inkSoft">
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">分享</div>
                  <Input aria-label="分享数" value={outcomeShareCount} onChange={(event) => setOutcomeShareCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
                </label>
                <label className="block text-sm text-inkSoft">
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">在看 / 点赞</div>
                  <Input aria-label="在看或点赞数" value={outcomeLikeCount} onChange={(event) => setOutcomeLikeCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
                </label>
              </div>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">快照备注</div>
                <Textarea aria-label="结果快照备注" value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} className="min-h-[96px] px-3 py-2" />
              </label>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">目标包</div>
                <Input aria-label="例如：5k / 10w+" value={outcomeTargetPackage} onChange={(event) => setOutcomeTargetPackage(event.target.value)} placeholder="例如：5k / 10w+" className="px-3 py-2" />
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">命中判定</div>
                <Select aria-label="命中判定"
                  value={outcomeHitStatus}
                  onChange={(event) => setOutcomeHitStatus(event.target.value as "pending" | "hit" | "near_miss" | "miss")}
                  className="px-3 py-2"
                >
                  <option value="pending">待判定</option>
                  <option value="hit">已命中</option>
                  <option value="near_miss">差一点命中</option>
                  <option value="miss">未命中</option>
                </Select>
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">复盘结论</div>
                <Textarea aria-label="复盘结论" value={outcomeReviewSummary} onChange={(event) => setOutcomeReviewSummary(event.target.value)} className="min-h-[96px] px-3 py-2" />
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">下一步动作</div>
                <Textarea aria-label="下一步动作" value={outcomeNextAction} onChange={(event) => setOutcomeNextAction(event.target.value)} className="min-h-[96px] px-3 py-2" />
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">打法标签</div>
                <Input aria-label="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束" value={outcomePlaybookTagsInput} onChange={(event) => setOutcomePlaybookTagsInput(event.target.value)} placeholder="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束" className="px-3 py-2" />
              </label>
              <Button
                type="button"
                onClick={saveOutcomeSnapshot}
                disabled={savingOutcomeSnapshot}
                variant="primary"
              >
                {savingOutcomeSnapshot ? "保存中…" : "保存结果快照"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCurrentStageArtifact() {
    if (currentArticleMainStep.code === "result") {
      return (
        <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          结果阶段不再生成结构化阶段产物。这里的重点已经切到真实回流、命中判定和下一篇可复用的打法。
        </div>
      );
    }
    if (!currentStage) {
      return (
        <AuthoringBlankSlate
          eyebrow={workspaceBlankSlate.eyebrow}
          title="先把当前链路走到一个明确步骤"
          detail="阶段工作台会跟着六步链路展示对应产物。只要当前步骤尚未落定，这里就不该强行塞一张空卡片。"
          prompts={["先在右侧链路里确认当前步骤", "研究与写作会映射到不同工作台", "步骤明确后，这里会自动切到对应结构化产物"]}
        />
      );
    }
    const currentStageAction = GENERATABLE_STAGE_ACTIONS[currentStage.code];
    if (currentStage.code === "deepWriting") {
      const selectedReferenceIds = new Set(selectedHistoryReferences.map((item) => item.referencedArticleId));
      const deepWritingSections = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "sectionBlueprint") : [];
      const deepWritingPrototypeOptions = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "prototypeOptions") : [];
      const deepWritingPrototypeComparisons = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "prototypeComparisons") : [];
      const deepWritingStateOptions = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "stateOptions") : [];
      const deepWritingStateComparisons = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "stateComparisons") : [];
      const deepWritingStateChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "stateChecklist") : [];
      const deepWritingProgressiveRevealSteps = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "progressiveRevealSteps") : [];
      const deepWritingDiversitySummary = String(currentStageArtifact?.payload?.diversitySummary || "").trim();
      const deepWritingDiversityIssues = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "diversityIssues") : [];
      const deepWritingDiversitySuggestions = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "diversitySuggestions") : [];
      const deepWritingOpeningPatternLabel = String(currentStageArtifact?.payload?.openingPatternLabel || "").trim();
      const deepWritingSyntaxPatternLabel = String(currentStageArtifact?.payload?.syntaxPatternLabel || "").trim();
      const deepWritingEndingPatternLabel = String(currentStageArtifact?.payload?.endingPatternLabel || "").trim();
      const deepWritingVoiceChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "voiceChecklist") : [];
      const deepWritingMustUseFacts = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "mustUseFacts") : [];
      const deepWritingResearchFocus = String(currentStageArtifact?.payload?.researchFocus || "").trim();
      const deepWritingResearchLens = String(currentStageArtifact?.payload?.researchLens || "").trim();
      const deepWritingBannedWatchlist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "bannedWordWatchlist") : [];
      const deepWritingSeriesChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "seriesChecklist") : [];
      const deepWritingSeriesInsight = currentStageArtifact ? getPayloadRecord(currentStageArtifact.payload, "seriesInsight") : null;
      const deepWritingFinalChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "finalChecklist") : [];
      const deepWritingHistoryPlans = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "historyReferencePlan") : [];
      const deepWritingPrototypeHistorySignal = currentStageArtifact ? getPayloadRecord(currentStageArtifact.payload, "prototypeHistorySignal") : null;
      const deepWritingStateHistorySignal = currentStageArtifact ? getPayloadRecord(currentStageArtifact.payload, "stateHistorySignal") : null;
      const deepWritingCurrentPrototypeCode = String(currentStageArtifact?.payload?.articlePrototype || "").trim();
      const deepWritingCurrentPrototypeLabel = String(currentStageArtifact?.payload?.articlePrototypeLabel || "").trim();
      const deepWritingCurrentVariantCode = String(currentStageArtifact?.payload?.stateVariantCode || "").trim();
      const deepWritingCurrentVariantLabel = String(currentStageArtifact?.payload?.stateVariantLabel || "").trim();
      const deepWritingSelectedPrototypeOption = deepWritingPrototypeOptions.find(
        (item) => String(item.code || "").trim() === deepWritingPrototypeOverride,
      );
      const deepWritingSelectedVariantOption = deepWritingStateOptions.find(
        (item) => String(item.code || "").trim() === deepWritingStateVariantOverride,
      );
      return (
        <div className="mt-4 space-y-4">
          <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            <div className="font-medium text-ink">{currentStageAction?.label || "生成写作执行卡"}</div>
            <div className="mt-2">
              深度写作继续沿用中间栏的 Markdown 编辑与流式生成。这里会先把标题、论点、段落推进、文风约束和关键事实整理成执行卡，再驱动正文生成。
            </div>
          </div>
          {deepWritingPrototypeOptions.length > 0 ? (
            <div className="border border-warning/30 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-inkSoft">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">文章原型切换</div>
              <div className="mt-2">
                先定这篇到底按哪种推进骨架写，再决定具体声部。默认按系统推荐原型生成；如果你想主动换掉题型骨架，可以先切原型再重生执行卡。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setDeepWritingPrototypeOverride(null)}
                  variant={!deepWritingPrototypeOverride ? "primary" : "secondary"}
                  size="sm"
                  className="text-xs"
                >
                  自动推荐
                </Button>
                {deepWritingPrototypeOptions.map((item, index) => {
                  const optionCode = String(item.code || "").trim();
                  const optionLabel = String(item.label || optionCode || `原型 ${index + 1}`);
                  return (
                    <Button
                      key={`deep-writing-prototype-${optionCode || index}`}
                      type="button"
                      onClick={() => setDeepWritingPrototypeOverride(optionCode || null)}
                      variant={deepWritingPrototypeOverride === optionCode ? "primary" : "secondary"}
                      size="sm"
                      className="text-xs"
                    >
                      {optionLabel}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-3 text-xs leading-6 text-inkMuted">
                {!deepWritingPrototypeOverride
                  ? `当前保持自动推荐${deepWritingCurrentPrototypeLabel ? `，最近一次执行卡采用的是「${deepWritingCurrentPrototypeLabel}」` : ""}。`
                  : `下次重生会强制切到「${String(deepWritingSelectedPrototypeOption?.label || deepWritingPrototypeOverride)}」。`}
              </div>
            </div>
          ) : null}
          {deepWritingPrototypeComparisons.length > 0 ? (
            <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">原型对比预览</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    先看 2-3 个可用题型骨架的差异，再决定这篇更适合调查、体验、解读还是方法论。第一张默认就是当前推荐。
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    sampleDeepWritingPrototypeOpenings({
                      stateVariantCode: deepWritingCurrentVariantCode || null,
                      prototypes: deepWritingPrototypeComparisons
                        .slice(0, 3)
                        .map((item, index) => ({
                          previewKey: `prototype:${String(item.code || "").trim() || index}`,
                          articlePrototypeCode: String(item.code || "").trim() || null,
                        }))
                        .filter((item) => item.articlePrototypeCode),
                    })
                  }
                  disabled={Boolean(deepWritingOpeningPreviewLoadingKey) || Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode)}
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                >
                  {deepWritingOpeningPreviewLoadingKey === "prototype-batch" ? "采样中…" : "一键采样 3 个原型开头"}
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {deepWritingPrototypeComparisons.map((item, index) => {
                  const comparisonCode = String(item.code || "").trim();
                  const comparisonLabel = String(item.label || comparisonCode || `原型 ${index + 1}`);
                  const previewKey = `prototype:${comparisonCode || index}`;
                  const isCurrent = comparisonCode === deepWritingCurrentPrototypeCode;
                  const isSelected = deepWritingPrototypeOverride === comparisonCode;
                  const isRecommended = Boolean(item.isRecommended);
                  return (
                    <div
                      key={`deep-writing-prototype-comparison-${comparisonCode || index}`}
                      className={`border px-4 py-4 ${
                        isCurrent || isRecommended
                          ? "border-warning/30 bg-surfaceWarning"
                          : "border-lineStrong/60 bg-paperStrong"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                        <span className="font-medium text-ink">{comparisonLabel}</span>
                        {isCurrent ? <span className="border border-lineStrong bg-surface px-2 py-1">当前执行卡</span> : null}
                        {!isCurrent && isRecommended ? <span className="border border-lineStrong bg-surface px-2 py-1">系统推荐</span> : null}
                      </div>
                      {String(item.suitableWhen || "").trim() ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">适用：{String(item.suitableWhen)}</div>
                      ) : null}
                      {String(item.reason || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.reason)}</div>
                      ) : null}
                      <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                        {String(item.recommendedStateVariantLabel || "").trim() ? <div>默认状态：{String(item.recommendedStateVariantLabel)}</div> : null}
                        {String(item.openingPatternLabel || "").trim() ? <div>开头模式：{String(item.openingPatternLabel)}</div> : null}
                        {String(item.syntaxPatternLabel || "").trim() ? <div>句法模式：{String(item.syntaxPatternLabel)}</div> : null}
                        {String(item.endingPatternLabel || "").trim() ? <div>结尾模式：{String(item.endingPatternLabel)}</div> : null}
                        {String(item.progressiveRevealLabel || "").trim() ? <div>节奏插件：{String(item.progressiveRevealLabel)}</div> : null}
                        {getDeepWritingHistorySignalSummary(getPayloadRecord(item, "historySignal")) ? (
                          <div>历史验证：{getDeepWritingHistorySignalSummary(getPayloadRecord(item, "historySignal"))}</div>
                        ) : null}
                      </div>
                      {String(item.diversitySummary || "").trim() ? (
                        <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                          {String(item.diversitySummary)}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => setDeepWritingPrototypeOverride(comparisonCode || null)}
                          variant={isSelected ? "primary" : "secondary"}
                          size="sm"
                          className="text-xs"
                        >
                          {isSelected ? "已选中" : "选这个原型"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            generateStageArtifact("deepWriting", {
                              articlePrototypeCode: comparisonCode || null,
                              articlePrototypeLabel: comparisonLabel,
                            })
                          }
                          disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                        >
                          直接按此重生
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            loadDeepWritingOpeningPreview({
                              previewKey,
                              articlePrototypeCode: comparisonCode || null,
                              stateVariantCode: deepWritingCurrentVariantCode || null,
                            })
                          }
                          disabled={Boolean(deepWritingOpeningPreviewLoadingKey) || Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode)}
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                        >
                          {deepWritingOpeningPreviewLoadingKey === previewKey ? "生成中…" : "看开头预览"}
                        </Button>
                      </div>
                      {String(deepWritingOpeningPreviews[previewKey] || "").trim() ? (
                        <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft whitespace-pre-wrap">
                          {String(deepWritingOpeningPreviews[previewKey])}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {deepWritingStateOptions.length > 0 ? (
            <div className="border border-warning/30 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-inkSoft">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">风格变体切换</div>
              <div className="mt-2">
                默认按系统推荐状态生成；如果你想避免同一篇总写成一个声部，可以强制切到别的写作状态后重生执行卡。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setDeepWritingStateVariantOverride(null)}
                  variant={!deepWritingStateVariantOverride ? "primary" : "secondary"}
                  size="sm"
                  className="text-xs"
                >
                  自动推荐
                </Button>
                {deepWritingStateOptions.map((item, index) => {
                  const optionCode = String(item.code || "").trim();
                  const optionLabel = String(item.label || optionCode || `状态 ${index + 1}`);
                  return (
                    <Button
                      key={`deep-writing-variant-${optionCode || index}`}
                      type="button"
                      onClick={() => setDeepWritingStateVariantOverride(optionCode || null)}
                      variant={deepWritingStateVariantOverride === optionCode ? "primary" : "secondary"}
                      size="sm"
                      className="text-xs"
                    >
                      {optionLabel}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-3 text-xs leading-6 text-inkMuted">
                {!deepWritingStateVariantOverride
                  ? `当前保持自动推荐${deepWritingCurrentVariantLabel ? `，最近一次执行卡采用的是「${deepWritingCurrentVariantLabel}」` : ""}。`
                  : `下次重生会强制切到「${String(deepWritingSelectedVariantOption?.label || deepWritingStateVariantOverride)}」。`}
              </div>
            </div>
          ) : null}
          {deepWritingStateComparisons.length > 0 ? (
            <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">状态对比预览</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    先看 2-3 个可用声部的差异，再决定是否切状态重生执行卡。第一张默认就是当前推荐。
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    sampleDeepWritingStateOpenings({
                      articlePrototypeCode: deepWritingCurrentPrototypeCode || null,
                      states: deepWritingStateComparisons
                        .slice(0, 3)
                        .map((item, index) => ({
                          previewKey: `state:${String(item.code || "").trim() || index}`,
                          stateVariantCode: String(item.code || "").trim() || null,
                        }))
                        .filter((item) => item.stateVariantCode),
                    })
                  }
                  disabled={Boolean(deepWritingOpeningPreviewLoadingKey) || Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode)}
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                >
                  {deepWritingOpeningPreviewLoadingKey === "state-batch" ? "采样中…" : "一键采样 3 个状态开头"}
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {deepWritingStateComparisons.map((item, index) => {
                  const comparisonCode = String(item.code || "").trim();
                  const comparisonLabel = String(item.label || comparisonCode || `状态 ${index + 1}`);
                  const previewKey = `state:${comparisonCode || index}`;
                  const isCurrent = comparisonCode === deepWritingCurrentVariantCode;
                  const isSelected = deepWritingStateVariantOverride === comparisonCode;
                  const isRecommended = Boolean(item.isRecommended);
                  return (
                    <div
                      key={`deep-writing-comparison-${comparisonCode || index}`}
                      className={`border px-4 py-4 ${
                        isCurrent || isRecommended
                          ? "border-warning/30 bg-surfaceWarning"
                          : "border-lineStrong/60 bg-paperStrong"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                        <span className="font-medium text-ink">{comparisonLabel}</span>
                        {isCurrent ? <span className="border border-lineStrong bg-surface px-2 py-1">当前执行卡</span> : null}
                        {!isCurrent && isRecommended ? <span className="border border-lineStrong bg-surface px-2 py-1">系统推荐</span> : null}
                      </div>
                      {String(item.suitableWhen || "").trim() ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">适用：{String(item.suitableWhen)}</div>
                      ) : null}
                      {String(item.reason || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.reason)}</div>
                      ) : null}
                      <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                        {String(item.openingPatternLabel || "").trim() ? <div>开头模式：{String(item.openingPatternLabel)}</div> : null}
                        {String(item.syntaxPatternLabel || "").trim() ? <div>句法模式：{String(item.syntaxPatternLabel)}</div> : null}
                        {String(item.endingPatternLabel || "").trim() ? <div>结尾模式：{String(item.endingPatternLabel)}</div> : null}
                        {String(item.progressiveRevealLabel || "").trim() ? <div>节奏插件：{String(item.progressiveRevealLabel)}</div> : null}
                        {getDeepWritingHistorySignalSummary(getPayloadRecord(item, "historySignal")) ? (
                          <div>历史验证：{getDeepWritingHistorySignalSummary(getPayloadRecord(item, "historySignal"))}</div>
                        ) : null}
                      </div>
                      {String(item.diversitySummary || "").trim() ? (
                        <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                          {String(item.diversitySummary)}
                        </div>
                      ) : null}
                      {getPayloadStringArray(item, "diversitySuggestions").length > 0 ? (
                        <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                          {getPayloadStringArray(item, "diversitySuggestions").map((suggestion) => (
                            <div key={suggestion}>- {suggestion}</div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => setDeepWritingStateVariantOverride(comparisonCode || null)}
                          variant={isSelected ? "primary" : "secondary"}
                          size="sm"
                          className="text-xs"
                        >
                          {isSelected ? "已选中" : "选这个状态"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            generateStageArtifact("deepWriting", {
                              articlePrototypeCode: deepWritingPrototypeOverride,
                              articlePrototypeLabel: String(deepWritingSelectedPrototypeOption?.label || "").trim() || null,
                              stateVariantCode: comparisonCode || null,
                              stateVariantLabel: comparisonLabel,
                            })
                          }
                          disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                        >
                          直接按此重生
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            loadDeepWritingOpeningPreview({
                              previewKey,
                              articlePrototypeCode: deepWritingCurrentPrototypeCode || null,
                              stateVariantCode: comparisonCode || null,
                            })
                          }
                          disabled={Boolean(deepWritingOpeningPreviewLoadingKey) || Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode)}
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                        >
                          {deepWritingOpeningPreviewLoadingKey === previewKey ? "生成中…" : "看开头预览"}
                        </Button>
                      </div>
                      {String(deepWritingOpeningPreviews[previewKey] || "").trim() ? (
                        <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft whitespace-pre-wrap">
                          {String(deepWritingOpeningPreviews[previewKey])}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className={`border px-4 py-4 text-sm leading-7 ${
            editorDiversityReport.status === "needs_attention"
              ? "border-warning/30 bg-surfaceWarning text-inkSoft"
              : "border-lineStrong/60 bg-paperStrong text-inkSoft"
          }`}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">长期去重监控</div>
            <div className="mt-2">{editorDiversityReport.summary}</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
              <span className="border border-lineStrong bg-surface px-3 py-2">当前原型：{editorDiversityReport.currentPrototypeLabel || "未记录"}</span>
              <span className="border border-lineStrong bg-surface px-3 py-2">当前状态：{editorDiversityReport.currentStateVariantLabel || "未记录"}</span>
              <span className="border border-lineStrong bg-surface px-3 py-2">当前开头：{editorDiversityReport.currentOpeningPatternLabel}</span>
              <span className="border border-lineStrong bg-surface px-3 py-2">当前句法：{editorDiversityReport.currentSyntaxPatternLabel}</span>
              <span className="border border-lineStrong bg-surface px-3 py-2">当前结尾：{editorDiversityReport.currentEndingPatternLabel}</span>
            </div>
            {editorDiversityReport.issues.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                {editorDiversityReport.issues.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            ) : null}
            {editorDiversityReport.suggestions.length > 0 ? (
              <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                {editorDiversityReport.suggestions[0]}
              </div>
            ) : null}
          </div>
          <Button
            onClick={() =>
              generateStageArtifact("deepWriting", {
                articlePrototypeCode: deepWritingPrototypeOverride,
                articlePrototypeLabel: String(deepWritingSelectedPrototypeOption?.label || "").trim() || null,
                stateVariantCode: deepWritingStateVariantOverride,
                stateVariantLabel: String(deepWritingSelectedVariantOption?.label || "").trim() || null,
              })
            }
            disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
            variant="primary"
          >
            {generatingStageArtifactCode === "deepWriting"
              ? "生成中…"
              : deepWritingPrototypeOverride || deepWritingStateVariantOverride
                ? `按「${[
                    String(deepWritingSelectedPrototypeOption?.label || deepWritingPrototypeOverride || "").trim(),
                    String(deepWritingSelectedVariantOption?.label || deepWritingStateVariantOverride || "").trim(),
                  ].filter(Boolean).join(" / ")}」重生写作执行卡`
                : currentStageArtifact
                  ? "刷新写作执行卡"
                  : "生成写作执行卡"}
          </Button>
          {currentStageArtifact ? (
            <div className="space-y-4 border border-lineStrong bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-serifCn text-2xl text-ink text-balance">{currentStageArtifact.title}</div>
                  <div className="mt-1 text-xs text-inkMuted">
                    {currentStageArtifact.updatedAt ? `更新于 ${new Date(currentStageArtifact.updatedAt).toLocaleString("zh-CN")}` : "暂无更新时间"}
                  </div>
                </div>
                <div className="text-xs text-inkMuted">
                  {currentStageArtifact.provider || "local"}
                  {currentStageArtifact.model ? ` / ${currentStageArtifact.model}` : ""}
                </div>
              </div>
              {currentStageArtifact.summary ? (
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                  {currentStageArtifact.summary}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {String(currentStageArtifact.payload?.selectedTitle || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">采用标题</div>
                    <div className="mt-2 font-medium text-ink">{String(currentStageArtifact.payload?.selectedTitle)}</div>
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.writingAngle || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">写作角度</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.writingAngle)}</div>
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.articlePrototypeLabel || currentStageArtifact.payload?.articlePrototype || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">文章原型</div>
                    <div className="mt-2 font-medium text-ink">
                      {String(currentStageArtifact.payload?.articlePrototypeLabel || currentStageArtifact.payload?.articlePrototype)}
                    </div>
                    {String(currentStageArtifact.payload?.articlePrototypeReason || "").trim() ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">{String(currentStageArtifact.payload?.articlePrototypeReason)}</div>
                    ) : null}
                    {getDeepWritingHistorySignalSummary(deepWritingPrototypeHistorySignal) ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        历史验证：{getDeepWritingHistorySignalSummary(deepWritingPrototypeHistorySignal)}
                      </div>
                    ) : null}
                    {String(currentStageArtifact.payload?.sectionRhythm || "").trim() ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">{String(currentStageArtifact.payload?.sectionRhythm)}</div>
                    ) : null}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.stateVariantLabel || "").trim() ? (
                  <div className="border border-warning/30 bg-surfaceWarning px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前状态</div>
                    <div className="mt-2 font-medium text-ink">{String(currentStageArtifact.payload?.stateVariantLabel)}</div>
                    {String(currentStageArtifact.payload?.stateVariantReason || "").trim() ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">{String(currentStageArtifact.payload?.stateVariantReason)}</div>
                    ) : null}
                    {getDeepWritingHistorySignalSummary(deepWritingStateHistorySignal) ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        历史验证：{getDeepWritingHistorySignalSummary(deepWritingStateHistorySignal)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.openingStrategy || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头策略</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.openingStrategy)}</div>
                    {String(currentStageArtifact.payload?.openingMove || "").trim() ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">{String(currentStageArtifact.payload?.openingMove)}</div>
                    ) : null}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.endingStrategy || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾策略</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.endingStrategy)}</div>
                  </div>
                ) : null}
              </div>
              {String(currentStageArtifact.payload?.centralThesis || "").trim() ? (
                <div className="text-sm leading-7 text-inkSoft">核心观点：{String(currentStageArtifact.payload?.centralThesis)}</div>
              ) : null}
              {String(currentStageArtifact.payload?.targetEmotion || "").trim() ? (
                <div className="text-sm leading-7 text-inkSoft">目标情绪：{String(currentStageArtifact.payload?.targetEmotion)}</div>
              ) : null}
              {(deepWritingOpeningPatternLabel || deepWritingSyntaxPatternLabel || deepWritingEndingPatternLabel) ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {deepWritingOpeningPatternLabel ? (
                    <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头模式</div>
                      <div className="mt-2 text-ink">{deepWritingOpeningPatternLabel}</div>
                    </div>
                  ) : null}
                  {deepWritingSyntaxPatternLabel ? (
                    <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">句法模式</div>
                      <div className="mt-2 text-ink">{deepWritingSyntaxPatternLabel}</div>
                    </div>
                  ) : null}
                  {deepWritingEndingPatternLabel ? (
                    <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾模式</div>
                      <div className="mt-2 text-ink">{deepWritingEndingPatternLabel}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {String(currentStageArtifact.payload?.evidenceMode || "").trim() ? (
                <div className="text-sm leading-7 text-inkSoft">证据组织：{String(currentStageArtifact.payload?.evidenceMode)}</div>
              ) : null}
              {(deepWritingResearchFocus || deepWritingResearchLens || String(currentStageArtifact.payload?.openingMove || "").trim()) ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {deepWritingResearchFocus ? (
                    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究焦点</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{deepWritingResearchFocus}</div>
                    </div>
                  ) : null}
                  {deepWritingResearchLens ? (
                    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究镜头</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{deepWritingResearchLens}</div>
                    </div>
                  ) : null}
                  {String(currentStageArtifact.payload?.openingMove || "").trim() ? (
                    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究驱动起手</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{String(currentStageArtifact.payload?.openingMove)}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(String(currentStageArtifact.payload?.progressiveRevealLabel || "").trim() || deepWritingProgressiveRevealSteps.length > 0) ? (
                <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">节奏插件</div>
                  {String(currentStageArtifact.payload?.progressiveRevealLabel || "").trim() ? (
                    <div className="mt-2 font-medium text-ink">{String(currentStageArtifact.payload?.progressiveRevealLabel)}</div>
                  ) : null}
                  {String(currentStageArtifact.payload?.progressiveRevealReason || "").trim() ? (
                    <div className="mt-2 text-sm leading-7 text-inkSoft">{String(currentStageArtifact.payload?.progressiveRevealReason)}</div>
                  ) : null}
                  {String(currentStageArtifact.payload?.climaxPlacement || "").trim() ? (
                    <div className="mt-2 text-xs leading-6 text-inkMuted">高潮位置：{String(currentStageArtifact.payload?.climaxPlacement)}</div>
                  ) : null}
                  {String(currentStageArtifact.payload?.escalationRule || "").trim() ? (
                    <div className="mt-1 text-xs leading-6 text-inkMuted">升番规则：{String(currentStageArtifact.payload?.escalationRule)}</div>
                  ) : null}
                  {deepWritingProgressiveRevealSteps.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                      {deepWritingProgressiveRevealSteps.map((item, index) => (
                        <div key={`${String(item.label || index)}`}>
                          <span className="font-medium text-ink">{String(item.label || `步骤 ${index + 1}`)}</span>
                          <span>：{String(item.instruction || "")}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(deepWritingStateChecklist.length > 0 || deepWritingStateOptions.length > 0) ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {deepWritingStateChecklist.length > 0 ? (
                    <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">状态自检</div>
                      <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                        {deepWritingStateChecklist.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deepWritingStateOptions.length > 0 ? (
                    <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">状态候选</div>
                      <div className="mt-2 space-y-3 text-sm leading-7 text-inkSoft">
                        {deepWritingStateOptions.map((item, index) => (
                          <div key={`${String(item.label || item.code || index)}`}>
                            <div className="font-medium text-ink">
                              {String(item.code || "").trim() === deepWritingCurrentVariantCode
                                ? "当前采用："
                                : index === 0
                                  ? "系统推荐："
                                : "备选："}
                              {String(item.label || item.code || `状态 ${index + 1}`)}
                            </div>
                            {String(item.suitableWhen || "").trim() ? (
                              <div className="text-xs leading-6 text-inkMuted">适用：{String(item.suitableWhen)}</div>
                            ) : null}
                            {String(item.triggerReason || "").trim() ? (
                              <div className="text-xs leading-6 text-inkMuted">触发：{String(item.triggerReason)}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(deepWritingDiversitySummary || deepWritingDiversityIssues.length > 0 || deepWritingDiversitySuggestions.length > 0) ? (
                <div
                  className={`border px-4 py-4 ${
                    deepWritingDiversityIssues.length > 0
                      ? "border-warning/30 bg-surfaceWarning"
                      : "border-lineStrong/60 bg-paperStrong"
                  }`}
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">执行卡去重约束</div>
                  {deepWritingDiversitySummary ? (
                    <div className="mt-2 text-sm leading-7 text-inkSoft">{deepWritingDiversitySummary}</div>
                  ) : null}
                  {deepWritingDiversityIssues.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                      {deepWritingDiversityIssues.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  ) : null}
                  {deepWritingDiversitySuggestions.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                      {deepWritingDiversitySuggestions.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(seriesInsight || deepWritingSeriesInsight) ? (
                <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前文章所属系列</div>
                  <div className="mt-2 font-medium text-ink">
                    {String((deepWritingSeriesInsight?.label as string | undefined) || seriesInsight?.label || "连续观察主题")}
                  </div>
                  {String((deepWritingSeriesInsight?.reason as string | undefined) || seriesInsight?.reason || "").trim() ? (
                    <div className="mt-2 text-sm leading-7 text-inkSoft">
                      {String((deepWritingSeriesInsight?.reason as string | undefined) || seriesInsight?.reason || "")}
                    </div>
                  ) : null}
                  {((Array.isArray(deepWritingSeriesInsight?.commonTerms) ? deepWritingSeriesInsight?.commonTerms : seriesInsight?.commonTerms) ?? []).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
                      {((Array.isArray(deepWritingSeriesInsight?.commonTerms) ? deepWritingSeriesInsight?.commonTerms : seriesInsight?.commonTerms) ?? []).map((item) => (
                        <span key={`series-term-${item}`} className="border border-lineStrong bg-surface px-3 py-2">{item}</span>
                      ))}
                    </div>
                  ) : null}
                  {deepWritingSeriesChecklist.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                      {deepWritingSeriesChecklist.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {deepWritingSections.length > 0 ? (
                <div className="space-y-3">
                  {deepWritingSections.map((section, index) => (
                    <div key={`${section.heading || index}`} className="border border-lineStrong/60 px-4 py-4">
                      <div className="font-medium text-ink">{index + 1}. {String(section.heading || `章节 ${index + 1}`)}</div>
                      {String(section.revealRole || "").trim() ? (
                        <div className="mt-2 inline-flex border border-warning/30 bg-surfaceWarning px-2 py-1 text-xs text-inkSoft">
                          节奏角色：{String(section.revealRole)}
                        </div>
                      ) : null}
                      {String(section.goal || "").trim() ? <div className="mt-2 text-sm leading-7 text-inkSoft">目标：{String(section.goal)}</div> : null}
                      {String(section.paragraphMission || "").trim() ? <div className="mt-1 text-sm leading-7 text-inkSoft">段落任务：{String(section.paragraphMission)}</div> : null}
                      {getPayloadStringArray(section, "evidenceHints").length > 0 ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          证据提示：{getPayloadStringArray(section, "evidenceHints").join("；")}
                        </div>
                      ) : null}
                      {String(section.transition || "").trim() ? (
                        <div className="mt-1 text-xs leading-6 text-inkMuted">衔接：{String(section.transition)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {deepWritingMustUseFacts.length > 0 ? (
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">必须吃透的事实</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkSoft">
                    {deepWritingMustUseFacts.map((item) => (
                      <span key={item} className="border border-lineStrong bg-surface px-3 py-2">{item}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {(deepWritingVoiceChecklist.length > 0 || deepWritingBannedWatchlist.length > 0 || deepWritingFinalChecklist.length > 0) ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {deepWritingVoiceChecklist.length > 0 ? (
                    <div className="border border-lineStrong/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">表达约束</div>
                      <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                        {deepWritingVoiceChecklist.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deepWritingBannedWatchlist.length > 0 ? (
                    <div className="border border-lineStrong/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">重点避开</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkSoft">
                        {deepWritingBannedWatchlist.map((item) => (
                          <span key={item} className="border border-danger/30 bg-surface px-3 py-2 text-danger">{item}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deepWritingFinalChecklist.length > 0 ? (
                    <div className="border border-lineStrong/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">终稿自检</div>
                      <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                        {deepWritingFinalChecklist.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {deepWritingHistoryPlans.length > 0 ? (
                <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">旧文自然引用计划</div>
                  <div className="mt-2 space-y-3 text-sm leading-7 text-inkSoft">
                    {deepWritingHistoryPlans.map((item, index) => (
                      <div key={`${item.title || index}`}>
                        <div className="font-medium text-ink">《{String(item.title || `旧文 ${index + 1}`)}》</div>
                        {String(item.useWhen || "").trim() ? <div>使用时机：{String(item.useWhen)}</div> : null}
                        {String(item.bridgeSentence || "").trim() ? <div>桥接句：{String(item.bridgeSentence)}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentStageArtifact.errorMessage ? (
                <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
                  本次结果使用了降级产物：{currentStageArtifact.errorMessage}
                </div>
              ) : null}
            </div>
          ) : null}
          {!canUseHistoryReferences ? (
            <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
              {displayPlanName}当前不支持历史文章自然引用。升级到 Pro 或更高套餐后，才可推荐、选择并保存最多 2 篇旧文作为正文内自然承接。
            </div>
          ) : null}
          {canUseHistoryReferences ? (
          <div className="border border-lineStrong bg-surface px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">历史文章自然引用</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">建议优先引用与你当前主题连续、判断互补的旧文。引用只作为自然上下文回带，不喧宾夺主。</div>
              </div>
              <Button
                type="button"
                onClick={() => loadHistoryReferences(true)}
                disabled={loadingHistoryReferences || savingHistoryReferences}
                variant="secondary"
                size="sm"
              >
                {loadingHistoryReferences ? "刷新中…" : "刷新建议"}
              </Button>
            </div>
            {selectedHistoryReferences.length > 0 ? (
              <div className="mt-4 space-y-3">
                {selectedHistoryReferences.map((item) => (
                  <div key={item.referencedArticleId} className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-ink">《{item.title}》</div>
                      <Button
                        type="button"
                        onClick={() =>
                          setSelectedHistoryReferences((current) =>
                            current.filter((reference) => reference.referencedArticleId !== item.referencedArticleId),
                          )
                        }
                        variant="link"
                        size="sm"
                        className="min-h-0 text-xs text-inkMuted hover:text-ink"
                      >
                        移除
                      </Button>
                    </div>
                    <Textarea aria-label="这篇旧文和当前文章的关系，例如：之前谈过供给端，这次补需求端。"
                      value={item.relationReason || ""}
                      onChange={(event) => updateHistoryReferenceField(item.referencedArticleId, "relationReason", event.target.value)}
                      placeholder="这篇旧文和当前文章的关系，例如：之前谈过供给端，这次补需求端。"
                      className="mt-3 min-h-[72px] px-3 py-2"
                    />
                    <Textarea aria-label="可选：给 AI 一个更自然的衔接句"
                      value={item.bridgeSentence || ""}
                      onChange={(event) => updateHistoryReferenceField(item.referencedArticleId, "bridgeSentence", event.target.value)}
                      placeholder="可选：给 AI 一个更自然的衔接句"
                      className="mt-3 min-h-[72px] px-3 py-2"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  onClick={saveHistoryReferenceSelection}
                  disabled={savingHistoryReferences}
                  variant="secondary"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {savingHistoryReferences ? "保存中…" : "保存自然引用设置"}
                </Button>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {loadingHistoryReferences ? (
                <div className="text-sm text-inkMuted">正在加载历史文章建议…</div>
              ) : historyReferenceSuggestions.length > 0 ? (
                historyReferenceSuggestions.map((item) => {
                  const selected = selectedReferenceIds.has(item.referencedArticleId);
                  return (
                    <div key={item.referencedArticleId} className="border border-lineStrong/60 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-ink">《{item.title}》</div>
                          {item.seriesLabel ? <div className="mt-1 text-xs text-inkMuted">{item.seriesLabel}</div> : null}
                        </div>
                        <Button
                          type="button"
                          onClick={() => toggleHistoryReferenceSelection(item)}
                          disabled={!selected && selectedHistoryReferences.length >= 2}
                          variant={selected ? "primary" : "secondary"}
                          size="sm"
                        >
                          {selected ? "已选中" : "加入引用"}
                        </Button>
                      </div>
                      {item.relationReason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.relationReason}</div> : null}
                      {item.consistencyHint ? <div className="mt-2 text-xs leading-6 text-warning">{item.consistencyHint}</div> : null}
                      {item.bridgeSentence ? <div className="mt-2 text-xs leading-6 text-inkMuted">桥接句建议：{item.bridgeSentence}</div> : null}
                    </div>
                  );
                })
              ) : (
                <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前没有可用的已发布旧文建议。先发布过往文章后，这里才会出现自然回带候选。
                </div>
              )}
            </div>
          </div>
          ) : null}
          <Button onClick={generate} disabled={generating || generateBlockedByResearch} variant="primary">
            {generating ? "生成中…" : generateBlockedByResearch ? "先补研究信源" : "开始深度写作"}
          </Button>
        </div>
      );
    }
    if (currentStage.code === "layout") {
      return (
        <div className="mt-4 space-y-3">
          <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            当前排版会把所选模板直接应用到 HTML 预览、导出 HTML 与后续微信稿箱渲染，尽量保持三者一致。
          </div>
          {selectedTemplate ? (
            <div className="border border-lineStrong bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                {selectedTemplate.meta || "模板"} · {selectedTemplate.version} · {formatTemplateAssetOwner(selectedTemplate)}
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedTemplate.name}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{selectedTemplate.description || "当前模板未填写说明。"} </div>
              <div className="mt-2 text-xs leading-6 text-inkMuted">来源：{formatTemplateSourceSummary(selectedTemplate)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {formatTemplateConfigSummary(selectedTemplate).map((item) => (
                  <span key={`${selectedTemplate.id}-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
              当前未显式选择模板，应用排版时会使用默认微信渲染样式。
            </div>
          )}
          <Button onClick={applyLayoutTemplate} disabled={applyingLayout} variant="primary">
            {applyingLayout ? "应用中…" : "应用排版并查看 HTML"}
          </Button>
        </div>
      );
    }
    if (!currentStageAction) {
      return (
        <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          当前步骤暂时没有可生成的结构化洞察卡。你仍可通过右侧其他模块继续配图、排版和发布。
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
          <div className="font-medium text-ink">{currentStageAction.label}</div>
          <div className="mt-2">{currentStageAction.helper}</div>
        </div>
        <Button
          onClick={() => generateStageArtifact(currentStage.code)}
          disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
          variant="primary"
        >
          {generatingStageArtifactCode === currentStage.code ? "生成中…" : currentStageArtifact ? "刷新阶段产物" : currentStageAction.label}
        </Button>
        {currentArticleMainStep.code === "strategy" || currentArticleMainStep.code === "evidence" ? renderResearchWorkspacePanel() : null}
        {currentArticleMainStep.code === "strategy" ? renderStrategyCardPanel() : null}
        {currentArticleMainStep.code === "evidence" ? renderEvidencePackagePanel() : null}
        {currentStageArtifact ? (
          <div className="space-y-4 border border-lineStrong bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-serifCn text-2xl text-ink text-balance">{currentStageArtifact.title}</div>
                <div className="mt-1 text-xs text-inkMuted">
                  {currentStageArtifact.updatedAt ? `更新于 ${new Date(currentStageArtifact.updatedAt).toLocaleString("zh-CN")}` : "暂无更新时间"}
                </div>
              </div>
              <div className="text-xs text-inkMuted">
                {currentStageArtifact.provider || "local"}
                {currentStageArtifact.model ? ` / ${currentStageArtifact.model}` : ""}
              </div>
            </div>

            {currentStageArtifact.summary ? (
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                {currentStageArtifact.summary}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => applyStageArtifact(currentStage.code)}
                disabled={Boolean(applyingStageArtifactCode) || Boolean(generatingStageArtifactCode)}
                variant="secondary"
                className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
              >
                {applyingStageArtifactCode === currentStage.code ? "应用中…" : getStageApplyButtonLabel(currentStage.code)}
              </Button>
              {currentStage.code === "outlinePlanning" ? (
                <Button
                  type="button"
                  onClick={syncOutlineArtifactToNodes}
                  disabled={syncingOutlineArtifact || Boolean(generatingStageArtifactCode) || Boolean(applyingStageArtifactCode)}
                  variant="secondary"
                >
                  {syncingOutlineArtifact ? "同步中…" : "同步到大纲树"}
                </Button>
              ) : null}
            </div>

            {currentStage.code === "audienceAnalysis" ? (
              <>
                {String(currentStageArtifact.payload?.coreReaderLabel || "").trim() ? (
                  <div className="text-sm text-inkSoft">核心受众：{String(currentStageArtifact.payload?.coreReaderLabel)}</div>
                ) : null}
                {audienceReaderSegments.length > 0 ? (
                  <div className="space-y-3">
                    {audienceReaderSegments.map((segment, index) => (
                      <div key={`${segment.label || index}`} className="border border-lineStrong/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-ink">{String(segment.label || `人群 ${index + 1}`)}</div>
                          <Button
                            type="button"
                            onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedReaderLabel: String(segment.label || "").trim() }))}
                            variant={audienceSelectionDraft.selectedReaderLabel === String(segment.label || "").trim() ? "primary" : "secondary"}
                            size="sm"
                            className="min-h-0 px-3 py-1 text-xs"
                          >
                            {audienceSelectionDraft.selectedReaderLabel === String(segment.label || "").trim() ? "已选中" : "设为目标读者"}
                          </Button>
                        </div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">痛点：{String(segment.painPoint || "暂无")}</div>
                        <div className="mt-1 text-sm leading-7 text-inkSoft">动机：{String(segment.motivation || "暂无")}</div>
                        <div className="mt-1 text-sm leading-7 text-inkSoft">推荐语气：{String(segment.preferredTone || "暂无")}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {audienceLanguageGuidance.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">表达建议确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceLanguageGuidance.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedLanguageGuidance: item }))}
                          variant={audienceSelectionDraft.selectedLanguageGuidance === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-left"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {audienceBackgroundAwarenessOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">背景预设确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceBackgroundAwarenessOptions.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedBackgroundAwareness: item }))}
                          variant={audienceSelectionDraft.selectedBackgroundAwareness === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-left"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {audienceReadabilityOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">语言通俗度确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceReadabilityOptions.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedReadabilityLevel: item }))}
                          variant={audienceSelectionDraft.selectedReadabilityLevel === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-left"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾动作确认</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {audienceCallToActionOptions.map((item) => (
                      <Button
                        key={item}
                        type="button"
                        onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedCallToAction: item }))}
                        variant={audienceSelectionDraft.selectedCallToAction === item ? "primary" : "secondary"}
                        size="sm"
                        className="text-left"
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    aria-label="也可以手动补充你希望文末收束成什么动作"
                    value={audienceSelectionDraft.selectedCallToAction}
                    onChange={(event) => setAudienceSelectionDraft((current) => ({ ...current, selectedCallToAction: event.target.value }))}
                    placeholder="也可以手动补充你希望文末收束成什么动作"
                    className="mt-3 min-h-[88px] px-3 py-2"
                  />
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                  <div>已确认目标读者：{audienceSelectionDraft.selectedReaderLabel || "未确认"}</div>
                  <div className="mt-1">已确认表达方式：{audienceSelectionDraft.selectedLanguageGuidance || "未确认"}</div>
                  <div className="mt-1">已确认背景预设：{audienceSelectionDraft.selectedBackgroundAwareness || "未确认"}</div>
                  <div className="mt-1">已确认语言通俗度：{audienceSelectionDraft.selectedReadabilityLevel || "未确认"}</div>
                  <div className="mt-1">已确认结尾动作：{audienceSelectionDraft.selectedCallToAction || "未确认"}</div>
                </div>
                <Button
                  type="button"
                  onClick={saveAudienceSelection}
                  disabled={savingAudienceSelection}
                  variant="secondary"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {savingAudienceSelection ? "保存中…" : "确认这组受众选择"}
                </Button>
                {getPayloadStringArray(currentStageArtifact.payload, "contentWarnings").length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">注意事项</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                      {getPayloadStringArray(currentStageArtifact.payload, "contentWarnings").map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "outlinePlanning" ? (
              <>
                <div className="space-y-4 border border-lineStrong/60 bg-paperStrong px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">补充观点与素材注入</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        这里的“用户观点”只作为补充校正，不会覆盖整篇文章的主判断。素材可以是可改写文字，也可以是必须原样插入的截图。
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => loadOutlineMaterials(true)}
                      disabled={loadingOutlineMaterials || savingOutlineMaterials}
                      variant="secondary"
                      size="sm"
                    >
                      {loadingOutlineMaterials ? "刷新中…" : "刷新素材面板"}
                    </Button>
                  </div>
                  <div
                    className={`border px-4 py-4 text-sm leading-7 ${
                      outlineMaterialReadiness.status === "passed"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : outlineMaterialReadiness.status === "warning"
                          ? "border-warning/40 bg-surfaceWarning text-warning"
                          : "border-danger/30 bg-surface text-danger"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.18em]">素材可用性评分</div>
                    <div className="mt-2 font-serifCn text-2xl text-balance">{outlineMaterialReadiness.score}</div>
                    <div className="mt-2">{outlineMaterialReadiness.detail}</div>
                    <div className="mt-2 text-xs">
                      挂载素材 {outlineMaterialReadiness.fragmentCount} 条 · 来源类型 {outlineMaterialReadiness.sourceTypeCount} 类 · 截图证据 {outlineMaterialReadiness.screenshotCount} 条
                    </div>
                    {outlineMaterialReadiness.flags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {outlineMaterialReadiness.flags.map((flag) => (
                          <span key={flag} className="border border-current/30 px-2 py-1">
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="grid gap-3">
                      {knowledgeCardItems.slice(0, 2).map((card) => (
                        <div key={`outline-knowledge-${card.id}`} className="border border-lineStrong bg-surface px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-ink">{card.title}</div>
                            <span className="border border-lineStrong px-2 py-1 text-[11px] text-inkMuted">
                              置信度 {Math.round(card.confidenceScore * 100)}%
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-7 text-inkSoft">{card.summary || "暂无主题摘要"}</div>
                          {card.latestChangeSummary ? (
                            <div className="mt-2 border border-warning/30 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-inkSoft">
                              最近变化：{card.latestChangeSummary}
                            </div>
                          ) : null}
                          {card.conflictFlags.length > 0 ? (
                            <div className="mt-2 border border-danger/30 bg-surface px-3 py-2 text-xs leading-6 text-danger">
                              冲突提醒：{card.conflictFlags.join("；")}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="border border-lineStrong bg-surface px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">背景卡摘要侧栏</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        大纲阶段优先参考当前命中的背景卡，先判断这次新增变量修正了什么旧结论，再决定章节顺序和证据挂载。
                      </div>
                      {knowledgeCardItems.length > 0 ? (
                        <div className="mt-3 space-y-2 text-xs leading-6 text-inkMuted">
                          {knowledgeCardItems.slice(0, 3).map((card) => (
                            <div key={`outline-side-${card.id}`}>
                              {card.title}
                              {card.overturnedJudgements.length > 0 ? ` · 旧判断受影响 ${card.overturnedJudgements[0]}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs leading-6 text-inkMuted">当前还没有命中的背景卡，先补素材后再刷新。</div>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Textarea aria-label={`补充观点 ${index + 1}`}
                        key={`viewpoint-${index}`}
                        value={supplementalViewpointsDraft[index] || ""}
                        onChange={(event) =>
                          setSupplementalViewpointsDraft((current) =>
                            Array.from({ length: 3 }, (_, draftIndex) =>
                              draftIndex === index ? event.target.value : current[draftIndex] || "",
                            ),
                          )
                        }
                        placeholder={`补充观点 ${index + 1}，例如：这篇不要只讲结论，要补清楚代价落在谁身上`}
                        className="min-h-[72px] bg-surface px-3 py-2"
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={saveSupplementalViewpoints}
                    disabled={savingOutlineMaterials}
                    variant="primary"
                  >
                    {savingOutlineMaterials ? "保存中…" : "保存补充观点"}
                  </Button>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border border-lineStrong bg-surface px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">挂载已有素材</div>
                      <Select aria-label="大纲节点"
                        value={outlineMaterialNodeId}
                        onChange={(event) => setOutlineMaterialNodeId(event.target.value)}
                        className="mt-3 bg-paperStrong px-3 py-2"
                      >
                        <option value="">选择大纲节点</option>
                        {(outlineMaterials?.nodes ?? nodes).map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.title}
                          </option>
                        ))}
                      </Select>
                      <Select aria-label="素材挂载方式"
                        value={outlineMaterialUsageMode}
                        onChange={(event) => setOutlineMaterialUsageMode(event.target.value === "image" ? "image" : "rewrite")}
                        className="mt-3 bg-paperStrong px-3 py-2"
                      >
                        <option value="rewrite">作为可改写素材</option>
                        <option value="image">作为原样截图插入</option>
                      </Select>
                      <Select aria-label="已有素材"
                        value={outlineMaterialFragmentId}
                        onChange={(event) => setOutlineMaterialFragmentId(event.target.value)}
                        className="mt-3 bg-paperStrong px-3 py-2"
                      >
                        <option value="">选择已有素材</option>
                        {fragmentPool
                          .filter((fragment) => {
                            const selectedNode = (outlineMaterials?.nodes ?? nodes).find((node) => String(node.id) === outlineMaterialNodeId);
                            return !selectedNode?.fragments.some((item) => item.id === fragment.id);
                          })
                          .map((fragment) => (
                            <option key={fragment.id} value={fragment.id}>
                              {fragment.title ? `${fragment.title} · ` : ""}
                              {formatFragmentSourceType(fragment.sourceType)} · {fragment.distilledContent.slice(0, 28)}
                            </option>
                          ))}
                      </Select>
                      <div className="mt-2 text-xs leading-6 text-inkMuted">如果截图已经在素材库里，可直接在这里选择“原样截图插入”；也可以在右侧直接上传新截图。</div>
                      <Button
                        type="button"
                        onClick={() => submitOutlineMaterial("attachExisting")}
                        disabled={savingOutlineMaterials}
                        variant="primary"
                        className="mt-3"
                      >
                        {savingOutlineMaterials ? "处理中…" : "挂到当前节点"}
                      </Button>
                    </div>
                    <div className="border border-lineStrong bg-surface px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("manual")}
                          variant={outlineMaterialCreateMode === "manual" ? "primary" : "secondary"}
                          size="sm"
                          className="flex-1"
                        >
                          新建文字素材
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("url")}
                          variant={outlineMaterialCreateMode === "url" ? "primary" : "secondary"}
                          size="sm"
                          className="flex-1"
                        >
                          新建链接素材
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("screenshot")}
                          variant={outlineMaterialCreateMode === "screenshot" ? "primary" : "secondary"}
                          size="sm"
                          className="flex-1"
                        >
                          新建截图素材
                        </Button>
                      </div>
                      <Input aria-label="素材标题，可选"
                        value={outlineMaterialTitle}
                        onChange={(event) => setOutlineMaterialTitle(event.target.value)}
                        placeholder="素材标题，可选"
                        className="mt-3 bg-paperStrong px-3 py-2"
                      />
                      {outlineMaterialCreateMode === "manual" ? (
                        <Textarea aria-label="新建文字素材内容"
                          value={outlineMaterialContent}
                          onChange={(event) => setOutlineMaterialContent(event.target.value)}
                          placeholder="输入要补进大纲的文字片段，系统会提纯后挂到节点。"
                          className="mt-3 min-h-[120px] bg-paperStrong px-3 py-2"
                        />
                      ) : outlineMaterialCreateMode === "url" ? (
                        <Input aria-label="https://…"
                          value={outlineMaterialUrl}
                          onChange={(event) => setOutlineMaterialUrl(event.target.value)}
                          placeholder="https://…"
                          className="mt-3 bg-paperStrong px-3 py-2"
                        />
                      ) : (
                        <div className="mt-3 space-y-3">
                          <input aria-label="input control"
                            ref={outlineMaterialScreenshotInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleOutlineMaterialScreenshotFileChange}
                            className="block w-full text-sm text-inkMuted file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:text-white"
                          />
                          <div className="text-xs leading-6 text-inkMuted">
                            {outlineMaterialScreenshotFileName
                              ? `已选择截图：${outlineMaterialScreenshotFileName}。创建后会自动以“原样截图插入”挂到当前节点。`
                              : "支持 png/jpg/webp，上传后会直接创建截图素材并挂到当前节点。"}
                          </div>
                          <Textarea aria-label="可选：补一句截图上下文，帮助后续视觉理解和节点归位。"
                            value={outlineMaterialContent}
                            onChange={(event) => setOutlineMaterialContent(event.target.value)}
                            placeholder="可选：补一句截图上下文，帮助后续视觉理解和节点归位。"
                            className="min-h-[96px] bg-paperStrong px-3 py-2"
                          />
                        </div>
                      )}
                      <Button
                        type="button"
                        onClick={() =>
                          submitOutlineMaterial(
                            outlineMaterialCreateMode === "manual"
                              ? "createManual"
                              : outlineMaterialCreateMode === "url"
                                ? "createUrl"
                                : "createScreenshot",
                          )
                        }
                        disabled={savingOutlineMaterials}
                        variant="primary"
                        className="mt-3"
                      >
                        {savingOutlineMaterials ? "处理中…" : "创建并挂到节点"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(outlineMaterials?.nodes ?? nodes).map((node) => (
                      <div key={`outline-material-node-${node.id}`} className="border border-lineStrong bg-surface px-4 py-4">
                        <div className="font-medium text-ink">{node.title}</div>
                        {node.fragments.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {node.fragments.map((fragment) => (
                              <span key={`${node.id}-${fragment.id}`} className="border border-lineStrong bg-paperStrong px-3 py-2 text-xs leading-6 text-inkSoft">
                                {fragment.title || `素材 #${fragment.id}`} · {formatFragmentSourceType(fragment.sourceType)} · {formatFragmentUsageMode(fragment.usageMode)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-inkMuted">这个节点还没有挂载素材。</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {outlineTitleOptions.length > 0 ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">标题三选一</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">确认后会同步稿件标题，深度写作默认沿用这个标题。</div>
                    </div>
                    <div className="grid gap-3">
                      {outlineTitleOptions.map((item, index) => {
                        const optionTitle = String(item.title || "").trim();
                        const optionStyle = String(item.styleLabel || "").trim();
                        const optionAngle = String(item.angle || "").trim();
                        const optionReason = String(item.reason || "").trim();
                        const optionRiskHint = String(item.riskHint || "").trim();
                        const isSelected = outlineSelectionDraft.selectedTitle === optionTitle;
                        return (
                          <Button
                            key={`${optionTitle || index}`}
                            type="button"
                            onClick={() =>
                              setOutlineSelectionDraft((current) => ({
                                ...current,
                                selectedTitle: optionTitle,
                                selectedTitleStyle: optionStyle,
                              }))
                            }
                            variant="secondary"
                            fullWidth
                            className={`h-auto whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                              isSelected
                                ? "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning"
                                : "border-lineStrong bg-surface"
                            }`}
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-1 text-xs ${isSelected ? "bg-cinnabar text-white" : "bg-paperStrong text-inkMuted"}`}>
                                {optionStyle || `标题方案 ${index + 1}`}
                              </span>
                              {optionAngle ? <span className="text-xs text-inkMuted">{optionAngle}</span> : null}
                            </span>
                            <span className="mt-3 text-base font-medium leading-7 text-ink">{optionTitle || `标题方案 ${index + 1}`}</span>
                            {optionReason ? <span className="mt-2 text-sm leading-7 text-inkSoft">{optionReason}</span> : null}
                            {optionRiskHint ? (
                              <span className="mt-3 block border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                                风险提示：{optionRiskHint}
                              </span>
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                    {outlineTitleStrategyNotes.length > 0 ? (
                      <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                        {outlineTitleStrategyNotes.join("；")}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.centralThesis || "").trim() ? (
                  <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
                    核心观点：{String(currentStageArtifact.payload?.centralThesis)}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "supplementalViewpoints").length > 0 ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    补充观点：{getPayloadStringArray(currentStageArtifact.payload, "supplementalViewpoints").join("；")}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "viewpointIntegration").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "viewpointIntegration").map((item, index) => (
                      <div key={`${item.viewpoint || index}`} className="border border-lineStrong/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(item.viewpoint || `补充观点 ${index + 1}`)}</div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">
                          处理方式：{formatViewpointAction(String(item.action || ""))}；采纳理由：{String(item.note || "暂无说明")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "materialBundle").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "materialBundle").map((item, index) => (
                      <div key={`${item.fragmentId || index}`} className="border border-lineStrong/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(item.title || `素材 ${index + 1}`)}</div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">
                          {formatFragmentSourceType(String(item.sourceType || ""))} · {formatFragmentUsageMode(String(item.usageMode || ""))}
                        </div>
                        {String(item.summary || "").trim() ? <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.summary)}</div> : null}
                        {String(item.screenshotPath || "").trim() ? <div className="mt-2 text-xs text-inkMuted">截图路径：{String(item.screenshotPath)}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {outlineOpeningHookOptions.length > 0 ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头策略确认</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        {outlineOpeningHookOptions.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedOpeningHook: item }))}
                          variant={outlineSelectionDraft.selectedOpeningHook === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-sm"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {outlineTargetEmotionOptions.length > 0 ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">目标情绪确认</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        {outlineTargetEmotionOptions.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedTargetEmotion: item }))}
                          variant={outlineSelectionDraft.selectedTargetEmotion === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-sm"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(() => {
                  const outlineResearchBackbone = getPayloadRecord(currentStageArtifact.payload, "researchBackbone");
                  const openingTimelineAnchor = String(outlineResearchBackbone?.openingTimelineAnchor || "").trim();
                  const middleComparisonAnchor = String(outlineResearchBackbone?.middleComparisonAnchor || "").trim();
                  const coreInsightAnchor = String(outlineResearchBackbone?.coreInsightAnchor || "").trim();
                  const sequencingNote = String(outlineResearchBackbone?.sequencingNote || "").trim();
                  if (!openingTimelineAnchor && !middleComparisonAnchor && !coreInsightAnchor && !sequencingNote) {
                    return null;
                  }
                  return (
                    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究锚点骨架</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {openingTimelineAnchor ? (
                          <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                            <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">开场历史节点</div>
                            <div className="mt-2">{openingTimelineAnchor}</div>
                          </div>
                        ) : null}
                        {middleComparisonAnchor ? (
                          <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                            <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">中段横向比较</div>
                            <div className="mt-2">{middleComparisonAnchor}</div>
                          </div>
                        ) : null}
                        {coreInsightAnchor ? (
                          <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                            <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">核心交汇洞察</div>
                            <div className="mt-2">{coreInsightAnchor}</div>
                          </div>
                        ) : null}
                      </div>
                      {sequencingNote ? (
                        <div className="mt-3 border border-warning/20 bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
                          排序理由：{sequencingNote}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                {getPayloadRecordArray(currentStageArtifact.payload, "outlineSections").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "outlineSections").map((section, index) => (
                      <div key={`${section.heading || index}`} className="border border-lineStrong/60 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-ink">{String(section.heading || `章节 ${index + 1}`)}</div>
                          {String(section.researchFocus || "").trim() ? (
                            <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-[11px] text-inkSoft">
                              {formatOutlineResearchFocusLabel(String(section.researchFocus))}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">目标：{String(section.goal || "暂无")}</div>
                        {getPayloadStringArray(section, "keyPoints").length > 0 ? (
                          <div className="mt-2 text-sm leading-7 text-inkSoft">
                            关键点：{getPayloadStringArray(section, "keyPoints").join("；")}
                          </div>
                        ) : null}
                        {getPayloadStringArray(section, "evidenceHints").length > 0 ? (
                          <div className="mt-2 text-sm leading-7 text-inkSoft">
                            证据提示：{getPayloadStringArray(section, "evidenceHints").join("；")}
                          </div>
                        ) : null}
                        {Array.isArray(section.materialRefs) && section.materialRefs.length > 0 ? (
                          <div className="mt-2 text-xs leading-6 text-inkMuted">引用素材：{section.materialRefs.join("、")}</div>
                        ) : null}
                        {String(section.researchAnchor || "").trim() ? (
                          <div className="mt-2 border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                            研究锚点：{String(section.researchAnchor)}
                          </div>
                        ) : null}
                        {String(section.transition || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-inkSoft">衔接：{String(section.transition)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "materialGapHints").length > 0 ? (
                  <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
                    {getPayloadStringArray(currentStageArtifact.payload, "materialGapHints").join("；")}
                  </div>
                ) : null}
                {outlineEndingStrategyOptions.length > 0 ? (
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾策略确认</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        {outlineEndingStrategyOptions.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedEndingStrategy: item }))}
                          variant={outlineSelectionDraft.selectedEndingStrategy === item ? "primary" : "secondary"}
                          size="sm"
                          className="text-sm"
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                  <div>已确认标题：{outlineSelectionDraft.selectedTitle || String(currentStageArtifact.payload?.workingTitle || "").trim() || "未确认"}</div>
                  <div className="mt-1">标题风格：{outlineSelectionDraft.selectedTitleStyle || "未确认"}</div>
                  <div>已确认开头策略：{outlineSelectionDraft.selectedOpeningHook || "未确认"}</div>
                  <div className="mt-1">已确认目标情绪：{outlineSelectionDraft.selectedTargetEmotion || "未确认"}</div>
                  <div className="mt-1">已确认结尾策略：{outlineSelectionDraft.selectedEndingStrategy || "未确认"}</div>
                </div>
                <Button
                  type="button"
                  onClick={saveOutlineSelection}
                  disabled={savingAudienceSelection || !outlineSelectionDraft.selectedTitle.trim()}
                  variant="primary"
                >
                  {savingAudienceSelection ? "保存中…" : "确认这组大纲选择"}
                </Button>
                {String(currentStageArtifact.payload?.endingStrategy || "").trim() ? (
                  <div className="text-sm leading-7 text-inkSoft">结尾策略：{String(currentStageArtifact.payload?.endingStrategy)}</div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "factCheck" ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className="border border-lineStrong bg-surface px-2 py-1">{formatFactRiskLabel(String(currentStageArtifact.payload?.overallRisk || ""))}</span>
                  {String(getPayloadRecord(currentStageArtifact.payload, "researchReview")?.summary || "").trim() ? (
                    <span className="border border-lineStrong bg-surface px-2 py-1">研究支撑已复核</span>
                  ) : null}
                  {String(currentStageArtifact.payload?.topicAlignment || "").trim() ? (
                    <span className="border border-lineStrong bg-surface px-2 py-1">主题匹配已评估</span>
                  ) : null}
                  <span className="border border-lineStrong bg-surface px-2 py-1">已确认处置 {factCheckResolvedCount}/{factCheckChecks.length || 0}</span>
                </div>
                {(() => {
                  const researchReview = getPayloadRecord(currentStageArtifact.payload, "researchReview");
                  if (!researchReview) {
                    return null;
                  }
                  const reviewGaps = getPayloadStringArray(researchReview, "gaps");
                  return (
                    <div className={`border px-4 py-4 ${
                      reviewGaps.length > 0 || String(researchReview.sourceCoverage || "").trim() === "blocked"
                        ? "border-warning/40 bg-surfaceWarning"
                        : "border-lineStrong/60 bg-paperStrong"
                    }`}>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究支撑复核</div>
                      {String(researchReview.summary || "").trim() ? (
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{String(researchReview.summary)}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
                        <span className="border border-lineStrong bg-surface px-3 py-2">
                          信源覆盖：{formatResearchCoverageSufficiencyLabel(String(researchReview.sourceCoverage || ""))}
                        </span>
                        <span className="border border-lineStrong bg-surface px-3 py-2">
                          纵向脉络：{formatResearchSupportStatusLabel(String(researchReview.timelineSupport || ""))}
                        </span>
                        <span className="border border-lineStrong bg-surface px-3 py-2">
                          横向比较：{formatResearchSupportStatusLabel(String(researchReview.comparisonSupport || ""))}
                        </span>
                        <span className="border border-lineStrong bg-surface px-3 py-2">
                          交汇洞察：{formatResearchSupportStatusLabel(String(researchReview.intersectionSupport || ""))}
                        </span>
                      </div>
                      {String(researchReview.strongestAnchor || "").trim() ? (
                        <div className="mt-3 text-xs leading-6 text-inkMuted">
                          当前复核锚点：{String(researchReview.strongestAnchor)}
                        </div>
                      ) : null}
                      {reviewGaps.length > 0 ? (
                        <div className="mt-3 space-y-1 text-sm leading-7 text-inkSoft">
                          {reviewGaps.map((item) => (
                            <div key={item}>- {item}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">补充外部证据</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    输入一篇报道、公告或原始资料链接，系统会自动抓取、提纯并挂到当前稿件，再立即刷新事实核查结果。
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="https://…"
                      value={factCheckEvidenceUrl}
                      onChange={(event) => setFactCheckEvidenceUrl(event.target.value)}
                      placeholder="https://…"
                      className="min-w-0 flex-1 min-h-10 px-3 py-2"
                    />
                    <Button
                      type="button"
                      onClick={() => addFactCheckEvidenceSource()}
                      disabled={addingFactCheckEvidence}
                      variant="primary"
                      size="sm"
                    >
                      {addingFactCheckEvidence ? "抓取中…" : "抓取补证并刷新核查"}
                    </Button>
                  </div>
                  {factCheckEvidenceIssue ? (
                    <div className="mt-3 space-y-3 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
                      <div className="text-xs uppercase tracking-[0.18em] text-warning">补证链接降级</div>
                      <div>最近一次补证抓取已降级写入：{factCheckEvidenceIssue.degradedReason}</div>
                      <div className="break-all text-xs leading-6 text-inkMuted">{factCheckEvidenceIssue.url}</div>
                      <div className="flex flex-wrap gap-2">
                        {factCheckEvidenceIssue.retryRecommended ? (
                          <Button
                            type="button"
                            onClick={() => addFactCheckEvidenceSource(factCheckEvidenceIssue.url)}
                            disabled={addingFactCheckEvidence}
                            variant="secondary"
                            size="sm"
                            className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                          >
                            {addingFactCheckEvidence ? "重试中…" : "重试补证抓取"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={() => setFactCheckEvidenceUrl(factCheckEvidenceIssue.url)}
                          variant="secondary"
                          size="sm"
                        >
                          回填链接
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setFactCheckEvidenceIssue(null)}
                          variant="secondary"
                          size="sm"
                        >
                          清除提示
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {recentFactCheckEvidenceIssues.length > 0 ? (
                    <div className="mt-3 space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近补证异常记录</div>
                      <div className="text-xs leading-6 text-inkMuted">
                        来源分类：事实核查补证 · 共 {recentFactCheckEvidenceIssues.length} 条 · 待重试 {factCheckRetryableCount} 条 · 最近恢复成功 {factCheckRecoveredCount} 次
                      </div>
                      {recentFactCheckEvidenceIssues.map((issue) => (
                        <div key={issue.id} className="border border-lineStrong/60 bg-paperStrong px-4 py-4 text-sm leading-7 text-inkSoft">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="font-medium text-ink">{issue.title || "补证链接异常"}</div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                              <span>{new Date(issue.createdAt).toLocaleString("zh-CN")}</span>
                              <span className={`border px-2 py-1 ${issue.resolvedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-warning/40 bg-surfaceWarning text-warning"}`}>
                                {issue.resolvedAt ? "已恢复" : "待处理"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2">{issue.degradedReason}</div>
                          <div className="mt-2 break-all text-xs leading-6 text-inkMuted">{issue.url}</div>
                          {issue.resolvedAt ? (
                            <div className="mt-2 text-xs leading-6 text-emerald-700">
                              最近恢复：{new Date(issue.resolvedAt).toLocaleString("zh-CN")} · 成功恢复 {issue.recoveryCount} 次
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {issue.retryRecommended ? (
                              <Button
                                type="button"
                                onClick={() => addFactCheckEvidenceSource(issue.url)}
                                disabled={addingFactCheckEvidence}
                                variant="secondary"
                                size="sm"
                                className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                              >
                                {addingFactCheckEvidence ? "重试中…" : "再次重试"}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              onClick={() => setFactCheckEvidenceUrl(issue.url)}
                              variant="secondary"
                              size="sm"
                            >
                              回填链接
                            </Button>
                            <Button
                              type="button"
                              onClick={() => dismissFactCheckEvidenceIssue(issue.id)}
                              variant="secondary"
                              size="sm"
                            >
                              删除记录
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                  每条核查项都可以单独指定处理策略。保存后，“精修高风险句子”会按这些策略回写正文，而不是统一保守弱化。
                </div>
                {factCheckChecks.length > 0 ? (
                  <div className="space-y-3">
                    {factCheckChecks.map((check, index) => {
                      const claim = String(check.claim || "").trim();
                      const status = String(check.status || "needs_source").trim();
                      const currentDecision = getFactCheckDecision(factCheckSelectionDraft, claim, status);
                      return (
                        <div key={`${check.claim || index}`} className="border border-lineStrong/60 bg-surface px-4 py-3">
                          <div className="font-medium text-ink">{String(check.claim || `核查项 ${index + 1}`)}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkMuted">
                            <span>状态：{formatFactCheckStatusLabel(status)}</span>
                            <span className="border border-lineStrong bg-surface px-2 py-1">当前处置：{formatFactCheckActionLabel(currentDecision.action)}</span>
                          </div>
                          <div className="mt-2 text-sm leading-7 text-inkSoft">{String(check.suggestion || "暂无建议")}</div>
                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">逐条处置策略</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-sm">
                              {getFactCheckActionOptions(status).map((option) => (
                                <Button
                                  key={`${claim}-${option.value}`}
                                  type="button"
                                  onClick={() => updateFactCheckDecision(claim, status, { action: option.value })}
                                  variant={currentDecision.action === option.value ? "primary" : "secondary"}
                                  size="sm"
                                >
                                  {option.label}
                                </Button>
                              ))}
                            </div>
                            <Textarea
                              aria-label="可选：补充处理备注，例如“等官方公告出来再补数据”"
                              value={currentDecision.note}
                              onChange={(event) => updateFactCheckDecision(claim, status, { note: event.target.value })}
                              placeholder="可选：补充处理备注，例如“等官方公告出来再补数据”"
                              className="mt-3 min-h-[80px] px-3 py-2"
                            />
                          </div>
                          {(() => {
                            const evidenceCard = getPayloadRecordArray(currentStageArtifact.payload, "evidenceCards").find(
                              (item) => String(item.claim || "").trim() === String(check.claim || "").trim(),
                            );
                            const supportingEvidence = getPayloadRecordArray(evidenceCard, "supportingEvidence");
                            const counterEvidence = getPayloadRecordArray(evidenceCard, "counterEvidence");
                            if (!evidenceCard) {
                              return null;
                            }
                            return (
                              <div className="mt-4 border-t border-line pt-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                                  <span className="uppercase tracking-[0.18em]">证据摘要卡</span>
                                  <span className="border border-lineStrong bg-surface px-2 py-1">
                                    {formatEvidenceSupportLevel(String(evidenceCard.supportLevel || ""))}
                                  </span>
                                </div>
                                {supportingEvidence.length > 0 || counterEvidence.length > 0 ? (
                                  <div className="mt-3 space-y-4">
                                    {[{ label: "支持证据", items: supportingEvidence }, { label: "反向证据", items: counterEvidence }]
                                      .filter((group) => group.items.length > 0)
                                      .map((group) => (
                                        <div key={group.label} className="space-y-3">
                                          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{group.label}</div>
                                          {group.items.map((item, evidenceIndex) => (
                                            <div key={`${group.label}-${item.title || evidenceIndex}`} className="border border-lineStrong/60 bg-paperStrong px-3 py-3">
                                              <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="text-sm font-medium text-ink">{String(item.title || `证据 ${evidenceIndex + 1}`)}</div>
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-inkMuted">
                                                  <span>{formatFragmentSourceType(String(item.sourceType || ""))}</span>
                                                  <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                                    {formatEvidenceRoleLabel(String(item.evidenceRole || (group.label === "反向证据" ? "counterEvidence" : "supportingEvidence")))}
                                                  </span>
                                                  {formatEvidenceResearchTagLabel(String(item.researchTag || "")) ? (
                                                    <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                                      {formatEvidenceResearchTagLabel(String(item.researchTag || ""))}
                                                    </span>
                                                  ) : null}
                                                  {String(item.confidenceLabel || "").trim() ? (
                                                    <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                                      {String(item.confidenceLabel)}
                                                    </span>
                                                  ) : null}
                                                </div>
                                              </div>
                                              <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.excerpt || "暂无摘要")}</div>
                                              {String(item.rationale || "").trim() ? (
                                                <div className="mt-2 text-xs leading-6 text-inkMuted">{String(item.rationale)}</div>
                                              ) : null}
                                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                                                {Number(item.fragmentId || 0) > 0 ? (
                                                  <span className="border border-lineStrong bg-surface px-3 py-2">
                                                    原始素材回链 · 素材 #{Number(item.fragmentId)}
                                                  </span>
                                                ) : null}
                                                {String(item.knowledgeTitle || "").trim() ? (
                                                  <Button
                                                    type="button"
                                                    onClick={() => {
                                                      if (Number(item.knowledgeCardId || 0) > 0) {
                                                        setExpandedKnowledgeCardId(Number(item.knowledgeCardId));
                                                        setHighlightedKnowledgeCardId(Number(item.knowledgeCardId));
                                                      }
                                                    }}
                                                    variant="secondary"
                                                    size="sm"
                                                  >
                                                    背景卡回链 · {String(item.knowledgeTitle)}
                                                  </Button>
                                                ) : null}
                                              </div>
                                              {String(item.sourceUrl || "").trim() ? (
                                                <a
                                                  href={String(item.sourceUrl)}
                                                  target="_blank" rel="noreferrer"
                                                  className="mt-3 inline-block border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft"
                                                >
                                                  打开原始链接
                                                </a>
                                              ) : null}
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <div className="mt-3 border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                                    当前没有命中的可核对证据，建议补充原始链接、截图或数据来源。
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {factCheckSelectionDraft.claimDecisions.length > 0 ? (
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                    {factCheckSelectionDraft.claimDecisions.slice(0, 6).map((item) => (
                      <div key={item.claim}>
                        {item.claim}：{formatFactCheckActionLabel(item.action)}{item.note ? `；备注：${item.note}` : ""}
                      </div>
                    ))}
                  </div>
                ) : null}
                <Button
                  type="button"
                  onClick={saveFactCheckSelection}
                  disabled={savingAudienceSelection}
                  variant="secondary"
                  size="sm"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {savingAudienceSelection ? "保存中…" : "确认这组核查处置"}
                </Button>
                {String(currentStageArtifact.payload?.personaAlignment || "").trim() ? (
                  <div className="text-sm leading-7 text-inkSoft">人设匹配：{String(currentStageArtifact.payload?.personaAlignment)}</div>
                ) : null}
                {String(currentStageArtifact.payload?.topicAlignment || "").trim() ? (
                  <div className="text-sm leading-7 text-inkSoft">选题匹配：{String(currentStageArtifact.payload?.topicAlignment)}</div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "prosePolish" ? (
              <>
                {String(currentStageArtifact.payload?.overallDiagnosis || "").trim() ? (
                  <div className="border border-lineStrong/60 bg-surface px-4 py-3 text-sm leading-7 text-inkSoft">
                    诊断：{String(currentStageArtifact.payload?.overallDiagnosis)}
                  </div>
                ) : null}
                <div className="space-y-3 border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                  {(() => {
                    const weakestLayer = getWeakestWritingQualityLayerSummary(editorQualityPanel);
                    if (!weakestLayer) {
                      return null;
                    }
                    return (
                      <div className={`border px-4 py-3 text-sm leading-7 ${
                        weakestLayer.status === "blocked"
                          ? "border-danger/30 bg-surface text-danger"
                          : weakestLayer.status === "needs_attention"
                            ? "border-warning/40 bg-surfaceWarning text-warning"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}>
                        当前优先修复：{weakestLayer.title}。{weakestLayer.suggestion}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">四层质检</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        当前正文会同时看硬规则、风格一致性、内容质量和活人感，不再只盯 AI 噪声。
                      </div>
                    </div>
                    <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                      总分 {editorQualityPanel.overallScore}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {editorQualityPanel.layers.map((layer) => (
                      <div key={layer.code} className="border border-lineStrong bg-surface px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="font-medium text-ink">{layer.title}</div>
                          <div className={`text-xs ${
                            layer.status === "ready" ? "text-emerald-700" : layer.status === "blocked" ? "text-danger" : "text-warning"
                          }`}>
                            {formatWritingQualityStatus(layer.status)} · {layer.score}
                          </div>
                        </div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">{layer.summary}</div>
                        {layer.issues.length > 0 ? (
                          <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                            {layer.issues.map((item) => (
                              <div key={item}>- {item}</div>
                            ))}
                          </div>
                        ) : null}
                        {layer.suggestions.length > 0 ? (
                          <div className="mt-3 border border-lineStrong/60 bg-paperStrong px-3 py-3 text-xs leading-6 text-inkSoft">
                            {layer.suggestions[0]}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                {getPayloadStringArray(currentStageArtifact.payload, "strengths").length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前优点</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                      {getPayloadStringArray(currentStageArtifact.payload, "strengths").map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "issues").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "issues").map((issue, index) => (
                      <div key={`${issue.type || index}`} className="border border-lineStrong/60 bg-surface px-4 py-3">
                        <div className="font-medium text-ink">{String(issue.type || `问题 ${index + 1}`)}</div>
                        {String(issue.example || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-inkSoft">示例：{String(issue.example)}</div>
                        ) : null}
                        <div className="mt-2 text-sm leading-7 text-inkSoft">建议：{String(issue.suggestion || "暂无")}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "languageGuardHits").length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">语言守卫与句式命中</div>
                    {getPayloadRecordArray(currentStageArtifact.payload, "languageGuardHits").map((hit, index) => (
                      <div key={`${hit.ruleId || hit.patternText || index}`} className="border border-danger/30 bg-surface px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-danger">
                          <span className="border border-danger/30 px-2 py-1">
                            {String(hit.ruleKind || "") === "pattern" ? "句式" : "词语"}
                          </span>
                          <span className="border border-danger/30 px-2 py-1">
                            {String(hit.scope || "") === "system" ? "系统默认" : "自定义"}
                          </span>
                          <span className="border border-danger/30 px-2 py-1">命中：{String(hit.matchedText || hit.patternText || "未命名规则")}</span>
                        </div>
                        {String(hit.rewriteHint || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-danger">改写建议：{String(hit.rewriteHint)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.rewrittenLead || "").trim() ? (
                  <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
                    首段改写建议：{String(currentStageArtifact.payload?.rewrittenLead)}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "punchlines").length > 0 ? (
                  <div className="text-sm leading-7 text-inkSoft">金句候选：{getPayloadStringArray(currentStageArtifact.payload, "punchlines").join("；")}</div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "rhythmAdvice").length > 0 ? (
                  <div className="text-sm leading-7 text-inkSoft">节奏建议：{getPayloadStringArray(currentStageArtifact.payload, "rhythmAdvice").join("；")}</div>
                ) : null}
                {getPayloadRecord(currentStageArtifact.payload, "aiNoise") ? (
                  <div className="border border-lineStrong/60 bg-surfaceWarm px-4 py-3 text-sm leading-7 text-inkSoft">
                    <div>AI 噪声分数：{String(getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.score || "0")}</div>
                    <div className="mt-1">噪声等级：{String(getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.level || "unknown")}</div>
                    {Array.isArray(getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.findings) && (getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.findings as unknown[]).length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        {((getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.findings as unknown[]) ?? []).map((item) => String(item || "").trim()).filter(Boolean).join("；")}
                      </div>
                    ) : null}
                    {Array.isArray(getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.reasonDetails)
                      && (getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.reasonDetails as unknown[]).length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {((getPayloadRecord(currentStageArtifact.payload, "aiNoise")?.reasonDetails as unknown[]) ?? [])
                          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
                          .map((item, index) => (
                          <div key={`${item.label || index}`} className="border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                            <div className="font-medium text-ink">
                              {String(item.label || `原因 ${index + 1}`)}
                              {Number(item.count || 0) > 0 ? ` · ${String(item.count)}` : ""}
                            </div>
                            <div className="mt-1">{String(item.reason || "暂无解释")}</div>
                            {String(item.suggestion || "").trim() ? <div className="mt-1 text-inkMuted">建议：{String(item.suggestion)}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {currentStageArtifact.errorMessage ? (
              <div className="border border-warning/40 bg-surfaceWarning px-4 py-3 text-sm leading-7 text-warning">
                本次结果使用了降级产物：{currentStageArtifact.errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <AuthoringBlankSlate
            eyebrow={workspaceBlankSlate.eyebrow}
            title={workspaceBlankSlate.title}
            detail={currentStageAction?.helper || workspaceBlankSlate.detail}
            prompts={workspaceBlankSlate.prompts}
          >
            {currentStageAction ? (
              <Button
                type="button"
                onClick={() => {
                  void generateStageArtifact(currentStage.code);
                }}
                disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
                variant="primary"
              >
                {generatingStageArtifactCode === currentStage.code ? `${currentStageAction.label}中…` : currentStageAction.label}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => setView(currentAuthoringPhase.defaultView)}
              variant="secondary"
            >
              先回到{formatWorkspaceViewLabel(currentAuthoringPhase.defaultView)}
            </Button>
          </AuthoringBlankSlate>
        )}
      </div>
    );
  }

  return (
    <div className={`grid min-w-0 gap-4 transition-all duration-500 ${workspaceGridClass}`}>
      {showLeftWorkspaceRail ? (
        <aside className="min-w-0 space-y-4 border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="border border-lineStrong/50 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">
              {isCollectPhase ? "采集阶段" : "构思阶段"}
            </div>
            <div className="mt-2">
              {isCollectPhase
                ? "先在这里挂素材、整理节点和保存关键快照。当前阶段不强调成稿句子。"
                : "当前优先看节点之间怎么推进、哪些素材该挂到哪一段，不急着追求完整正文。"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">大纲树与素材挂载</div>
            <div className="mt-4">
              <ArticleOutlineClient articleId={article.id} nodes={nodes} fragments={fragmentPool} onChange={reloadArticleMeta} />
            </div>
          </div>
          <div className="border-t border-lineStrong/60 pt-4">
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">快照管理</div>
            <div className="mt-3 flex gap-2">
              <Input aria-label="快照备注"
                value={snapshotNote}
                onChange={(event) => setSnapshotNote(event.target.value)}
                placeholder="快照备注"
                className="min-w-0 flex-1"
              />
              <Button onClick={createSnapshot} variant="primary" size="sm">
                存档
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {snapshots.slice(0, 6).map((snapshot) => (
                <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
                  <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                  <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                  <div className="mt-3 flex gap-2 text-xs">
                    <Button onClick={() => loadDiff(snapshot.id)} variant="secondary" size="sm">
                      {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                    </Button>
                    <Button onClick={() => restoreSnapshot(snapshot.id)} variant="secondary" size="sm">
                      回滚
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      ) : null}

      <section className="min-w-0 border border-lineStrong/40 bg-surface p-6 shadow-ink">
        <div
          data-command-chrome="true"
          className="sticky top-0 z-10 mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface/95 pb-5 backdrop-blur-sm"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-inkMuted">
              <Link href="/articles" className="transition-colors hover:text-ink">
                稿件
              </Link>
              <span>/</span>
              <span className="max-w-[32rem] truncate normal-case tracking-normal text-inkSoft">
                《{currentArticleLabel}》
              </span>
              <span>/</span>
              <span className="text-cinnabar">{currentArticleMainStep.title}</span>
            </div>
            <div className="mt-3 font-serifCn text-2xl text-ink text-balance md:text-3xl">《{currentArticleLabel}》</div>
            <div className="mt-2 max-w-3xl text-sm leading-7 text-inkMuted">
              {currentArticleMainStepDisplay?.detail || "当前步骤说明暂未生成。"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="border border-lineStrong/70 bg-paperStrong px-3 py-2 text-inkMuted">{saveState}</span>
            <Button
              type="button"
              onClick={toggleTheme}
              variant="secondary"
              size="sm"
              className="text-xs"
            >
              {theme === "night" ? "切回日间" : "切到夜读"}
            </Button>
            <Button
              type="button"
              onClick={toggleFocusMode}
              variant={isFocusMode ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              {isFocusMode ? "退出沉浸" : "沉浸模式"}
            </Button>
          </div>
        </div>
        <div data-command-chrome="true" className={`border-b border-line pb-4 ${isFocusMode || isWritePhase || isPolishPhase ? "hidden" : ""}`}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">稿件六步链路</div>
          <div className="mt-3 space-y-3 md:hidden">
            <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">
                    步骤 {String(articleMainSteps.findIndex((step) => step.code === currentArticleMainStep.code) + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-2 font-serifCn text-2xl text-ink">{currentArticleMainStep.title}</div>
                </div>
                <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                  {formatArticleMainStepStatus(currentArticleMainStepDisplay?.statusLabel || "current")}
                </div>
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {currentArticleMainStep.supportLabel}
              </div>
            </div>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
              {articleMainSteps.map((step, index) => (
                <Button
                  key={step.code}
                  type="button"
                  onClick={() => handleArticleMainStepSelect(step)}
                  disabled={updatingWorkflowCode !== null || (step.code === "result" && status !== "published")}
                  variant="secondary"
                  className={`min-w-[220px] shrink-0 snap-start whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                    step.statusLabel === "current"
                      ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                      : step.statusLabel === "completed"
                        ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                        : step.statusLabel === "needs_attention"
                          ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                          : "border-lineStrong/60 bg-surface"
                  } ${step.code === "result" && status !== "published" ? "cursor-default" : ""}`}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                      步骤 {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-xs ${
                        step.statusLabel === "current"
                          ? "text-cinnabar"
                          : step.statusLabel === "completed"
                            ? "text-emerald-700"
                            : step.statusLabel === "needs_attention"
                              ? "text-warning"
                              : "text-inkMuted"
                      }`}
                    >
                      {formatArticleMainStepStatus(step.statusLabel)}
                    </span>
                  </span>
                  <span className="mt-2 font-serifCn text-xl text-ink">{step.title}</span>
                  <span className="mt-2 text-xs leading-6 text-inkMuted">{step.supportLabel}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 hidden gap-3 xl:grid-cols-6 md:grid">
            {articleMainSteps.map((step, index) => (
              <Button
                key={step.code}
                type="button"
                onClick={() => handleArticleMainStepSelect(step)}
                disabled={updatingWorkflowCode !== null || (step.code === "result" && status !== "published")}
                variant="secondary"
                fullWidth
                className={`h-full whitespace-normal px-4 py-3 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  step.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : step.statusLabel === "completed"
                      ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                      : step.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                } ${step.code === "result" && status !== "published" ? "cursor-default" : ""}`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                    步骤 {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-xs ${
                      step.statusLabel === "current"
                        ? "text-cinnabar"
                        : step.statusLabel === "completed"
                          ? "text-emerald-700"
                          : step.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(step.statusLabel)}
                  </span>
                </span>
                <span className="mt-2 font-serifCn text-xl text-ink">{step.title}</span>
                <span className="mt-1 text-xs text-inkMuted">{step.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-3 text-sm leading-7 text-inkMuted">
            当前稿件停留在「{currentArticleMainStep.title}」。底层仍沿用现有执行阶段，但作者视角固定只看这 6 步。
          </div>
          <div className={`mt-4 border px-4 py-4 ${
            researchStepSummary.status === "ready"              ? "border-emerald-200 bg-emerald-50"
              : researchStepSummary.status === "blocked"
                ? "border-danger/30 bg-surface"
                : "border-warning/40 bg-surfaceWarning"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究底座摘要</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="font-medium text-ink">{researchStepSummary.title}</div>
                  <div className={`text-xs ${
                    researchStepSummary.status === "ready"
                      ? "text-emerald-700"
                      : researchStepSummary.status === "blocked"
                        ? "text-danger"
                        : "text-warning"
                  }`}>
                    {formatResearchStepSummaryStatus(researchStepSummary.status)}
                  </div>
                </div>
                <div className={`mt-2 text-sm leading-7 ${researchStepSummary.status === "blocked" ? "text-danger" : researchStepSummary.status === "needs_attention" ? "text-warning" : "text-inkSoft"}`}>{researchStepSummary.detail}</div>
              </div>
              {currentArticleMainStep.code !== "strategy" && currentArticleMainStep.code !== "evidence" ? (
                <Button
                  type="button"
                  onClick={() => void updateWorkflow("researchBrief", "set")}
                  variant="secondary"
                  size="sm"
                >
                  去补研究层
                </Button>
              ) : null}
            </div>
            {researchStepSummary.highlights.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
                {researchStepSummary.highlights.map((item) => (
                  <span key={item} className="border border-current/20 bg-surface/80 px-3 py-2">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {currentArticleMainStep.code === "result" ? renderOutcomeWorkspace() : null}
        <div className="mt-4 border border-lineStrong/60 bg-surfaceWarm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">作者阶段</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                把复杂控制项折叠成写作者真正关心的 4 个阶段，只在当前阶段强调必要动作。
              </div>
            </div>
            <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
              当前：{currentAuthoringPhase.title}
            </div>
          </div>
          <div className="mt-4 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:hidden">
            {authoringPhases.map((phase) => (
              <Button
                key={phase.code}
                type="button"
                onClick={() => {
                  setView(phase.defaultView);
                  void updateWorkflow(phase.targetStageCode as typeof workflow.currentStageCode, "set");
                }}
                disabled={updatingWorkflowCode !== null}
                variant="secondary"
                className={`min-w-[220px] shrink-0 snap-start whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  phase.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : phase.statusLabel === "completed"
                      ? "border-lineStrong bg-surface"
                      : phase.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-serifCn text-xl text-ink">{phase.title}</span>
                  <span
                    className={`text-xs ${
                      phase.statusLabel === "current"
                        ? "text-cinnabar"
                        : phase.statusLabel === "completed"
                          ? "text-emerald-700"
                          : phase.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(phase.statusLabel as ArticleMainStepStatus)}
                  </span>
                </span>
                <span className="mt-2 text-sm leading-7 text-inkSoft">{phase.summary}</span>
                <span className="mt-3 text-xs text-inkMuted">{phase.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-4 hidden gap-3 xl:grid-cols-4 md:grid">
            {authoringPhases.map((phase) => (
              <Button
                key={phase.code}
                type="button"
                onClick={() => {
                  setView(phase.defaultView);
                  void updateWorkflow(phase.targetStageCode as typeof workflow.currentStageCode, "set");
                }}
                disabled={updatingWorkflowCode !== null}
                variant="secondary"
                fullWidth
                className={`h-full whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  phase.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : phase.statusLabel === "completed"
                      ? "border-lineStrong bg-surface"
                      : phase.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-serifCn text-2xl text-ink">{phase.title}</span>
                  <span
                    className={`text-xs ${
                      phase.statusLabel === "current"
                        ? "text-cinnabar"
                        : phase.statusLabel === "completed"
                          ? "text-emerald-700"
                          : phase.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(phase.statusLabel as ArticleMainStepStatus)}
                  </span>
                </span>
                <span className="mt-2 text-sm leading-7 text-inkSoft">{phase.summary}</span>
                <span className="mt-3 text-xs text-inkMuted">{phase.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-4 border border-lineStrong/70 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            {currentAuthoringPhaseHint}
          </div>
        </div>
        <div data-command-chrome="true" className="flex flex-wrap gap-3">
          <Input aria-label="稿件标题" value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-0 flex-1 basis-full md:min-w-[240px] md:basis-auto" />
          <Select aria-label="稿件系列"
            value={seriesId ?? ""}
            onChange={(event) => setSeriesId(event.target.value ? Number(event.target.value) : null)}
            className="min-w-0 basis-full md:min-w-[220px] md:basis-auto"
          >
            <option value="">{seriesOptions.length > 0 ? "选择稿件系列" : "请先创建系列"}</option>
            {seriesOptions.map((series) => (
              <option key={series.id} value={series.id}>
                {series.name} · {series.personaName}{series.activeStatus !== "active" ? " · 非经营中" : ""}
              </option>
            ))}
          </Select>
          <Button onClick={() => void saveArticleDraft()} variant="secondary" className="flex-1 md:flex-none">
            保存
          </Button>
          <Button onClick={generate} disabled={generating || generateBlockedByResearch} variant="primary" className="flex-1 md:flex-none">
            {generating
              ? "生成中…"
              : generateBlockedByResearch
                ? "先补研究信源"
                : deepWritingPrototypeOverride || deepWritingStateVariantOverride
                  ? "应用当前写作切换后生成"
                  : "流式生成"}
          </Button>
        </div>
        <div data-command-chrome="true" className="mt-4 border-b border-line pb-3">
          <div className="md:hidden">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前视图</div>
            <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Button onClick={() => setView("workspace")} variant={view === "workspace" ? "primary" : "secondary"} size="sm" className="shrink-0">
                阶段工作台
              </Button>
              <Button onClick={() => setView("edit")} variant={view === "edit" ? "primary" : "secondary"} size="sm" className="shrink-0">
                稿纸
              </Button>
              <Button onClick={() => setView("preview")} variant={view === "preview" ? "primary" : "secondary"} size="sm" className="shrink-0">
                微信预览
              </Button>
              <Button onClick={() => setView("audit")} variant={view === "audit" ? "primary" : "secondary"} size="sm" className="shrink-0">
                红笔校阅
              </Button>
            </div>
            <div className="mt-3 text-sm text-inkMuted">
              当前视图：{formatWorkspaceViewLabel(view)}
            </div>
          </div>
          <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setView("workspace")} variant={view === "workspace" ? "primary" : "secondary"} size="sm">
                阶段工作台
              </Button>
              <Button onClick={() => setView("edit")} variant={view === "edit" ? "primary" : "secondary"} size="sm">
                稿纸
              </Button>
              <Button onClick={() => setView("preview")} variant={view === "preview" ? "primary" : "secondary"} size="sm">
                微信预览
              </Button>
              <Button onClick={() => setView("audit")} variant={view === "audit" ? "primary" : "secondary"} size="sm">
                红笔校阅
              </Button>
            </div>
            <div className="text-sm text-inkMuted">
              当前视图：{formatWorkspaceViewLabel(view)}
            </div>
          </div>
        </div>
        {selectedSeries ? (
          <div data-command-chrome="true" className="mt-4 border border-lineStrong/40 bg-paperStrong px-4 py-4 text-sm leading-7 text-inkSoft">
            当前稿件归属「{selectedSeries.name}」，绑定人设为 {selectedSeries.personaName}。
            {selectedSeries.thesis ? ` 核心判断：${selectedSeries.thesis}` : ""}
            {selectedSeries.targetAudience ? ` 目标读者：${selectedSeries.targetAudience}` : ""}
          </div>
        ) : (
          <div data-command-chrome="true" className="mt-4 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
            当前稿件还没有绑定系列。请先完成系列绑定，再继续推进策略、证据和发布步骤。
          </div>
        )}
        {view === "workspace" ? (
          <div className="mt-4 min-h-[420px] border border-lineStrong bg-surface p-4 md:min-h-[560px] md:p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.24em] text-inkMuted">阶段配置与执行产物</div>
            {renderCurrentStageArtifact()}
          </div>
        ) : view === "edit" ? (
          <>
            {!hasDraftContent ? (
              <div className="mt-4">
                <div className="space-y-4">
                  <AuthoringBlankSlate
                    eyebrow={draftBlankSlate.eyebrow}
                    title={draftBlankSlate.title}
                    detail={draftBlankSlate.detail}
                    prompts={draftBlankSlate.prompts}
                  >
                    {draftStarterOptions.map((option) => (
                      <Button
                        key={option.label}
                        type="button"
                        onClick={() => setMarkdown(option.text)}
                        variant="secondary"
                      >
                        {option.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      onClick={() => setView("workspace")}
                      variant="secondary"
                      className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      先看阶段工作台
                    </Button>
                  </AuthoringBlankSlate>
                  {draftBlankSlateInspirations.length > 0 ? (
                    <div className="border border-lineStrong bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.10),transparent_32%),linear-gradient(180deg,rgba(255,253,250,1)_0%,rgba(250,247,240,1)_100%)] p-5">
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">灵感启发</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        白页不只给提示，也直接给你几张可借的起手卡。可以拿素材切口起笔，也可以借经典开场方式破冰。
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {draftBlankSlateInspirations.map((item) => (
                          <div key={item.key} className="border border-lineStrong/70 bg-surface/85 px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-cinnabar">{item.title}</div>
                            <div className="mt-3 text-sm leading-7 text-inkSoft">{item.detail}</div>
                            <div className="mt-3 text-xs leading-6 text-inkMuted">{item.meta}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <textarea
              aria-label="草稿编辑区"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder="铺开稿纸，落笔生花。&#10;&#10;「文章千古事，得失寸心知。」&#10;—— 在这里写下你的第一段草稿，或从左侧素材板中汲取灵感..."
              className="mt-4 min-h-[420px] w-full resize-y border border-lineStrong bg-surfaceHighlight px-4 py-6 text-base leading-8 text-ink bg-[linear-gradient(transparent_31px,rgba(27,28,26,0.04)_32px)] bg-[length:100%_32px] md:min-h-[560px] md:px-6 md:py-8"
            />
            <div className="mt-4">
              <SentenceRhythmMap text={markdown} />
            </div>
          </>
        ) : view === "preview" ? (
          <div className="mt-4 border border-lineStrong bg-surfaceHighlight">
            <WechatNativePreview
              html={hasPreviewContent ? htmlPreview : ""}
              title={title}
              authorName={selectedSeries?.personaName || undefined}
              accountName={selectedConnection?.accountName || initialConnections.find((connection) => connection.isDefault)?.accountName || undefined}
            />
          </div>
        ) : (
          <div className="mt-4 min-h-[420px] border border-lineStrong bg-surfaceWarm p-4 md:min-h-[560px] md:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="border border-danger/20 bg-surface p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-danger/20 pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">主编红笔</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">
                      命中语言守卫后，不再只给规则列表，而是直接在稿纸上标出问题位置和批注编号。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="border border-danger/30 bg-surface px-3 py-2 text-danger">高风险 {liveLanguageGuardSummary.highSeverityCount}</span>
                    <span className="border border-lineStrong bg-paperStrong px-3 py-2 text-inkSoft">词语 {liveLanguageGuardSummary.tokenCount}</span>
                    <span className="border border-lineStrong bg-paperStrong px-3 py-2 text-inkSoft">句式 {liveLanguageGuardSummary.patternCount}</span>
                  </div>
                </div>
                {hasDraftContent && editorialReview.annotations.length === 0 ? (
                  <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                    当前正文未命中语言守卫，可以切去微信预览看最终阅读体感。
                  </div>
                ) : null}
                {hasDraftContent ? (
                  <div
                    ref={editorialPreviewRef}
                    className="mt-4 whitespace-pre-wrap break-words bg-[linear-gradient(transparent_31px,rgba(167,48,50,0.05)_32px)] bg-[length:100%_32px] px-2 text-sm leading-8 text-ink"
                    dangerouslySetInnerHTML={{ __html: editorialReview.html }}
                  />
                ) : (
                  <div className="mt-4">
                    <AuthoringBlankSlate
                      eyebrow={reviewBlankSlate.eyebrow}
                      title={reviewBlankSlate.title}
                      detail={reviewBlankSlate.detail}
                      prompts={reviewBlankSlate.prompts}
                    >
                      <Button
                        type="button"
                        onClick={() => setView("edit")}
                        variant="secondary"
                        className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                      >
                        先回稿纸起笔
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setView("workspace")}
                        variant="secondary"
                      >
                        先看阶段工作台
                      </Button>
                    </AuthoringBlankSlate>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <SentenceRhythmMap text={markdown} />
                <div className="border border-danger/20 bg-surface p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">批注清单</div>
                  {!hasDraftContent ? (
                    <div className="mt-3 text-sm leading-7 text-inkMuted">等正文出现后，这里会按编号列出每条红笔批注。</div>
                  ) : editorialReview.annotations.length === 0 ? (
                    <div className="mt-3 text-sm leading-7 text-inkMuted">没有需要批注的语言守卫命中。</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {editorialReview.annotations.map((annotation) => (
                        <button
                          key={annotation.id}
                          type="button"
                          onClick={() => jumpToEditorialAnnotation(annotation.anchorId)}
                          className={`border px-4 py-4 ${
                            annotation.severity === "high"
                              ? "border-danger/30 bg-surface"
                              : "border-warning/40 bg-surfaceWarning"
                          } w-full text-left transition-colors hover:border-cinnabar/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/40`}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="border border-current/20 bg-surface/80 px-2 py-1 text-cinnabar">#{annotation.order}</span>
                            <span className="border border-current/20 bg-surface/80 px-2 py-1 text-inkSoft">
                              {annotation.ruleKind === "pattern" ? "句式" : "词语"}
                            </span>
                            <span className="border border-current/20 bg-surface/80 px-2 py-1 text-inkSoft">
                              {annotation.scope === "system" ? "系统规则" : "自定义规则"}
                            </span>
                          </div>
                          <div className="mt-3 text-sm leading-7 text-ink">
                            命中：<span className="font-medium">{annotation.matchedText}</span>
                            {annotation.count > 1 ? ` · 共 ${annotation.count} 处` : ""}
                          </div>
                          <div className="mt-2 text-xs leading-6 text-inkMuted">上下文：{annotation.sampleContext}</div>
                          {annotation.rewriteHint ? (
                            <div className={`mt-2 text-sm leading-7 ${annotation.severity === "high" ? "text-danger" : "text-inkSoft"}`}>改写建议：{annotation.rewriteHint}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {message ? <div className="mt-4 text-sm text-cinnabar">{message}</div> : null}
      </section>

      <aside className={`${isFocusMode ? "hidden" : "min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start"}`}>
        {showCompactSixStepRail ? (
          <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">当前链路</div>
            <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
              <div className="font-serifCn text-2xl text-ink">{currentArticleMainStep.title}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{currentArticleMainStepDisplay?.detail || "当前步骤说明暂未生成。"}</div>
            </div>
            <div className="mt-3 grid gap-2">
              {articleMainSteps.map((step) => (
                <Button
                  key={step.code}
                  type="button"
                  onClick={() => handleArticleMainStepSelect(step)}
                  disabled={updatingWorkflowCode !== null || (step.code === "result" && status !== "published")}
                  variant="secondary"
                  size="sm"
                  fullWidth
                  iconRight={<span className="text-xs">{formatArticleMainStepStatus(step.statusLabel)}</span>}
                  className={`justify-between px-3 py-3 text-left text-sm ${
                    step.statusLabel === "current"
                      ? "border-cinnabar bg-surface text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                      : step.statusLabel === "completed"
                        ? "border-lineStrong bg-surface text-inkSoft"
                      : step.statusLabel === "needs_attention"
                          ? "border-warning/40 bg-surfaceWarning text-warning hover:border-warning/40 hover:bg-surfaceWarning hover:text-warning"
                          : "border-lineStrong/50 bg-surface/70 text-inkMuted hover:border-lineStrong/50 hover:bg-surface/70 hover:text-inkMuted"
                  }`}
                >
                  {step.title}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {!showLeftWorkspaceRail ? (
          <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">快照管理</div>
            <div className="mt-3 flex gap-2">
              <Input aria-label="快照备注"
                value={snapshotNote}
                onChange={(event) => setSnapshotNote(event.target.value)}
                placeholder="快照备注"
                className="min-w-0 flex-1"
              />
              <Button onClick={createSnapshot} variant="primary" size="sm">
                存档
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {snapshots.slice(0, 4).map((snapshot) => (
                <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
                  <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                  <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                  <div className="mt-3 flex gap-2 text-xs">
                    <Button onClick={() => loadDiff(snapshot.id)} variant="secondary" size="sm">
                      {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                    </Button>
                    <Button onClick={() => restoreSnapshot(snapshot.id)} variant="secondary" size="sm">
                      回滚
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {showResearchChecklistRail ? (
        <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">六步完成定义</div>
          <div className={`mt-3 border px-4 py-4 ${
            researchStepSummary.status === "ready"
              ? "border-emerald-200 bg-emerald-50"
              : researchStepSummary.status === "blocked"
                ? "border-danger/30 bg-surface"
                : "border-warning/40 bg-surfaceWarning"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究底座</div>
              <div className={`text-xs ${
                researchStepSummary.status === "ready"
                  ? "text-emerald-700"
                  : researchStepSummary.status === "blocked"
                    ? "text-danger"
                    : "text-warning"
              }`}>
                {formatResearchStepSummaryStatus(researchStepSummary.status)}
              </div>
            </div>
            <div className={`mt-2 text-sm leading-7 ${researchStepSummary.status === "blocked" ? "text-danger" : researchStepSummary.status === "needs_attention" ? "text-warning" : "text-inkSoft"}`}>{researchStepSummary.detail}</div>
          </div>
          <div className="mt-3 space-y-2">
            {editorStageChecklist.map((stage) => (
              <div key={stage.stepCode} className="border border-lineStrong bg-surface px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{stage.title}</div>
                    <div className="mt-1 text-sm leading-6 text-inkSoft">{stage.detail}</div>
                  </div>
                  <div className={`text-xs ${
                    stage.status === "ready" ? "text-emerald-700" : stage.status === "blocked" ? "text-danger" : "text-warning"
                  }`}>
                    {formatStageChecklistStatus(stage.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}
        {planCapabilityHints.length > 0 ? (
          <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">权限前置提示</div>
            <div className="mt-3 space-y-2">
              {planCapabilityHints.map((hint) => (
                <div key={hint.key} className="border border-lineStrong bg-surface px-4 py-3 text-sm leading-7 text-inkSoft">
                  <div className="font-medium text-ink">{hint.title}</div>
                  <div className="mt-1">{hint.detail}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">阶段洞察卡</div>
              <div className="mt-2 text-sm leading-7 text-inkMuted">
                {currentStage ? `当前步骤：${currentArticleMainStep.title} · 执行阶段：${currentStage.title}` : "根据当前步骤显示对应的结构化产物。"}
              </div>
            </div>
            <span className="border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted">{stageArtifacts.length} 条</span>
          </div>
          <div className="mt-4 text-sm leading-7 text-inkMuted">请在中间主工作区的“阶段工作台”标签页中查看。</div>
        </div>
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">稿件状态</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{status === "generating" ? "生成中" : formatArticleStatusLabel(status)}</div>
        </div>

        {showKnowledgeCardsRail ? (
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">相关背景卡</div>
              <div className="mt-2 text-sm leading-7 text-inkMuted">优先显示与当前稿件标题、正文和已挂载素材最相关的背景卡，减少重复总结。</div>
            </div>
            <span className="border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted">{knowledgeCardItems.length} 张</span>
          </div>
          {knowledgeCardItems.length === 0 ? (
            <div className="mt-4">
              <AuthoringBlankSlate
                eyebrow={knowledgeBlankSlate.eyebrow}
                title={knowledgeBlankSlate.title}
                detail={knowledgeBlankSlate.detail}
                prompts={knowledgeBlankSlate.prompts}
                compact
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {knowledgeCardItems.map((card) => {
                const expanded = expandedKnowledgeCardId === card.id;
                const highlighted = highlightedKnowledgeCardId === card.id;
                return (
                  <article key={card.id} className={`border bg-surface p-4 ${highlighted ? "border-cinnabar shadow-[0_0_0_1px_rgba(167,48,50,0.08)]" : "border-lineStrong"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-serifCn text-xl text-ink">{card.title}</div>
                          {highlighted ? <span className="border border-cinnabar/30 bg-surfaceWarm px-2 py-1 text-[11px] text-cinnabar">刚更新</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkMuted">
                          <span className="border border-lineStrong bg-surface px-2 py-1">{card.cardType}</span>
                          <span className="border border-lineStrong bg-surface px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                          <span className="border border-lineStrong bg-surface px-2 py-1">置信度 {Math.round(card.confidenceScore * 100)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(card.status === "stale" || card.status === "conflicted") ? (
                          <Button
                            onClick={() => refreshKnowledgeCard(card.id)}
                            disabled={refreshingKnowledgeId === card.id}
                            variant="secondary"
                            size="sm"
                            className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                          >
                            {refreshingKnowledgeId === card.id ? "刷新中…" : "刷新背景卡"}
                          </Button>
                        ) : null}
                        <Button
                          onClick={() => {
                            setExpandedKnowledgeCardId(expanded ? null : card.id);
                            if (highlighted) {
                              setHighlightedKnowledgeCardId(null);
                            }
                          }}
                          variant="secondary"
                          size="sm"
                        >
                          {expanded ? "收起证据" : "查看证据"}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-inkSoft">{card.summary || "暂无摘要"}</p>
                    {card.latestChangeSummary ? (
                      <div className="mt-3 border border-warning/40 bg-surfaceWarning px-3 py-3 text-sm leading-7 text-warning">
                        最近变化：{card.latestChangeSummary}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                      <span>命中稿件挂载素材 {card.matchedFragmentCount} 条</span>
                      <span>来源素材 {card.sourceFragmentIds.length} 条</span>
                      <span>相关度 {card.relevanceScore}</span>
                      <span>{card.lastCompiledAt ? `最近编译 ${new Date(card.lastCompiledAt).toLocaleString("zh-CN")}` : "尚未完成编译"}</span>
                    </div>
                    {card.status === "conflicted" ? (
                      <div className="mt-3 border border-danger/30 bg-surface px-3 py-3 text-sm leading-7 text-danger">
                        这张档案出现了相反信号，当前只能作为待核实线索使用，建议先补充来源或立即刷新。
                      </div>
                    ) : null}
                    {card.status === "stale" ? (
                      <div className="mt-3 border border-warning/40 bg-surfaceWarning px-3 py-3 text-sm leading-7 text-warning">
                        这张档案超过时间阈值未更新，适合在下笔前先刷新，避免沿用过期判断。
                      </div>
                    ) : null}
                    {card.conflictFlags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.conflictFlags.map((flag) => (
                          <span key={`${card.id}-flag-${flag}`} className="border border-danger/30 bg-surface px-2 py-1 text-[11px] text-danger">
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {card.keyFacts.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.keyFacts.slice(0, 3).map((fact, index) => (
                          <span key={`${card.id}-fact-${index}`} className="border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                            {fact}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {card.overturnedJudgements.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {card.overturnedJudgements.slice(0, 3).map((item, index) => (
                          <div key={`${card.id}-overturned-${index}`} className="border border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {expanded ? (
                      <div className="mt-4 space-y-4 border-t border-line pt-4">
                        {card.openQuestions.length > 0 ? (
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">待确认问题</div>
                            <div className="mt-2 space-y-2">
                              {card.openQuestions.slice(0, 2).map((question, index) => (
                                <div key={`${card.id}-question-${index}`} className="text-sm leading-7 text-inkMuted">
                                  {question}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {card.relatedCards.length > 0 ? (
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">关联档案</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {card.relatedCards.slice(0, 3).map((relatedCard) => (
                                <span
                                  key={`${card.id}-related-${relatedCard.id}`}
                                  className="border border-line bg-paperStrong px-3 py-2 text-xs leading-6 text-inkSoft"
                                >
                                  <span className="mr-2 text-inkMuted">{relatedCard.linkType}</span>
                                  {relatedCard.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">来源素材摘要</div>
                          <div className="mt-2 space-y-2">
                            {card.sourceFragments.map((fragment) => (
                              <div key={fragment.id} className="border border-line bg-paperStrong px-3 py-3 text-sm leading-7 text-inkSoft">
                                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-inkMuted">素材 #{fragment.id}</div>
                                {fragment.distilledContent}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
        ) : null}

        {showLanguageGuardRail ? (
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">即时语言守卫命中</div>
            {liveLanguageGuardHits.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
                <span className="border border-lineStrong bg-surface px-2 py-1">词语 {liveLanguageGuardSummary.tokenCount}</span>
                <span className="border border-lineStrong bg-surface px-2 py-1">句式 {liveLanguageGuardSummary.patternCount}</span>
                <span className="border border-danger/30 bg-surface px-2 py-1 text-danger">高风险 {liveLanguageGuardSummary.highSeverityCount}</span>
              </div>
            ) : null}
          </div>
          {liveLanguageGuardHits.length === 0 ? (
            <div className="mt-3 text-sm leading-7 text-inkMuted">当前稿件未命中语言守卫规则。</div>
          ) : (
            <div className="mt-3 space-y-3">
              {liveLanguageGuardHits.map((hit, index) => (
                <div
                  key={`${hit.ruleId}-${hit.matchedText}-${index}`}
                  className={`border px-4 py-3 ${hit.severity === "high" ? "border-danger/30 bg-surface" : "border-lineStrong bg-surface"}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                      {hit.ruleKind === "pattern" ? "句式" : "词语"}
                    </span>
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                      {hit.scope === "system" ? "系统默认" : "自定义"}
                    </span>
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                      {hit.severity === "high" ? "高风险" : "提醒"}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-ink">
                    命中内容：<span className="font-medium">{hit.matchedText || hit.patternText}</span>
                  </div>
                  {hit.ruleKind === "pattern" && hit.patternText !== hit.matchedText ? (
                    <div className="mt-1 text-xs leading-6 text-inkMuted">句式模板：{hit.patternText}</div>
                  ) : null}
                  {hit.rewriteHint ? (
                    <div className={`mt-2 text-sm leading-7 ${hit.severity === "high" ? "text-danger" : "text-inkSoft"}`}>
                      改写建议：{hit.rewriteHint}
                    </div>
                  ) : null}
                </div>
              ))}
              {detectedBannedWords.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  {detectedBannedWords.map((item) => (
                    <span key={item.word} className="border border-cinnabar px-3 py-1 text-xs text-cinnabar">
                      {item.word} × {item.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
        ) : null}

        {showVisualEngineRail ? (
        <div className="hidden border border-dashed border-lineStrong bg-surfaceWarm p-5 md:block">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">视觉联想引擎</div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">{visualSuggestion}</div>
          {nodeVisualSuggestions.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">段落配图建议</div>
                <Button
                  onClick={saveImagePromptAssets}
                  disabled={savingImagePrompts}
                  variant="secondary"
                  size="sm"
                >
                  {savingImagePrompts ? "保存中…" : "保存为资产"}
                </Button>
              </div>
              {nodeVisualSuggestions.map((item) => (
                <div key={item.id} className="border border-lineStrong bg-surface px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{item.prompt}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button
              onClick={generateCoverImage}
              disabled={coverImageButtonDisabled}
              variant={canGenerateCoverImage && !coverImageLimitReached ? "primary" : "secondary"}
              className={canGenerateCoverImage && !coverImageLimitReached
                ? ""
                : "text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-inkMuted"}
            >
              {coverImageButtonLabel}
            </Button>
          </div>
          {canUseCoverImageReference ? (
            <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">参考图垫图</div>
              <input aria-label="input control"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleCoverReferenceFileChange}
                className="mt-3 w-full text-sm"
              />
              <div className="mt-2 text-xs leading-6 text-inkMuted">藏锋套餐可上传参考图，封面生成会尽量继承主体、构图或风格线索。</div>
              {coverImageReferenceDataUrl ? (
                <img src={coverImageReferenceDataUrl} alt="封面图参考图" width={800} height={450} className="mt-3 aspect-[16/9] w-full border border-lineStrong object-cover" />
              ) : null}
            </div>
          ) : canGenerateCoverImage ? (
            <div className="mt-3 text-xs leading-6 text-inkMuted">参考图垫图仅藏锋可用，当前套餐仍可直接按标题生成封面图。</div>
          ) : null}
          <div className="mt-3 text-xs leading-6 text-inkMuted">
            今日封面图
            {coverImageQuota.limit == null
              ? ` ${coverImageQuota.used} / 不限`
              : ` ${coverImageQuota.used} / ${coverImageQuota.limit}`}
            {!canGenerateCoverImage
              ? "，当前套餐只输出配图提示词。"
              : coverImageLimitReached
                ? "，今日额度已耗尽。"
                : imageAssetStorageLimitReached
                  ? `，图片资产空间不足，当前已用 ${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}。`
                : coverImageQuota.remaining != null
                  ? `，还可生成 ${coverImageQuota.remaining} 次。`
                  : "。"}
          </div>
          <div className="mt-1 text-xs leading-6 text-inkMuted">
            图片资产空间 {formatBytes(imageAssetQuota.usedBytes)} / {formatBytes(imageAssetQuota.limitBytes)}
            {imageAssetStorageLimitReached
              ? `，本次生成至少还需预留 ${formatBytes(imageAssetQuota.reservedGenerationBytes)}。`
              : `，当前还剩 ${formatBytes(imageAssetQuota.remainingBytes)}。`}
          </div>
          {coverImageCandidates.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">封面图候选</div>
              <div className="grid gap-3">
                {coverImageCandidates.map((candidate) => (
                  <div key={candidate.id} className="border border-lineStrong bg-surface p-3">
                    <img src={candidate.imageUrl} alt={candidate.variantLabel} width={800} height={450} className="aspect-[16/9] w-full border border-lineStrong object-cover" />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-ink">{candidate.variantLabel}</div>
                        <div className="mt-1 text-xs text-inkMuted">{candidate.isSelected ? "已入库" : "候选图"}</div>
                      </div>
                      <Button
                        onClick={() => selectCoverCandidate(candidate.id)}
                        disabled={candidate.isSelected || selectingCoverCandidateId !== null}
                        variant={candidate.isSelected ? "secondary" : "primary"}
                        size="sm"
                        className={candidate.isSelected
                          ? "text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-inkMuted"
                          : ""}
                      >
                        {candidate.isSelected ? "已选择" : selectingCoverCandidateId === candidate.id ? "入库中…" : "选这张入库"}
                      </Button>
                    </div>
                    <div className="mt-3 border border-lineStrong bg-paperStrong px-3 py-3 text-xs leading-6 text-inkMuted">
                      {candidate.prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {coverImage ? (
            <div className="mt-4 space-y-3">
              <img src={coverImage.imageUrl} alt="AI 生成封面图" width={800} height={450} className="aspect-[16/9] w-full border border-lineStrong object-cover" />
              <div className="border border-lineStrong bg-surface px-4 py-3 text-xs leading-6 text-inkMuted">
                <div className="font-medium text-ink">最近一次封面图提示词</div>
                <div className="mt-2">{coverImage.prompt}</div>
                <div className="mt-2 text-inkMuted">{new Date(coverImage.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            </div>
          ) : null}
          {imagePrompts.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">已保存的文中配图提示词资产</div>
              {imagePrompts.map((item) => (
                <div key={item.id} className="border border-lineStrong bg-surface px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{item.prompt}</div>
                  <div className="mt-2 text-xs text-inkMuted">{new Date(item.updatedAt).toLocaleString("zh-CN")}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        ) : null}

        {showMobileInspectorEntry ? (
          <div className="border border-lineStrong/40 bg-surfaceWarm p-4 md:hidden">
            <div className="text-sm leading-7 text-inkSoft">
              手机视图默认收起了快照、背景卡、即时语言守卫和视觉联想等辅助面板，优先保证写稿、预览与发布主链路更顺。
            </div>
            <Button
              type="button"
              onClick={() => setShowMobileInspector(true)}
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
            >
              打开辅助面板
            </Button>
          </div>
        ) : null}

        {showDeliveryRail ? (
        <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">导出</div>
          <div className="mt-3 grid gap-2">
            <Button onClick={copyMarkdown} variant="secondary" className="justify-start text-left">
              复制纯净 Markdown
            </Button>
            <Link href={`/api/articles/${article.id}/export?format=markdown`} className="border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
              导出 Markdown
            </Link>
            <Link href={`/api/articles/${article.id}/export?format=html`} className="border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
              导出 HTML
            </Link>
            <Link
              href={`/api/articles/${article.id}/export?format=pdf`}
              className={`border px-4 py-3 text-sm ${canExportPdf ? "border-cinnabar bg-cinnabar text-white" : "border-lineStrong bg-surface text-inkMuted"}`}
            >
              {canExportPdf ? "导出 PDF" : "PDF 需升级付费套餐"}
            </Link>
          </div>
        </div>
        ) : null}

        {showDeliveryRail ? (
        <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">发布到公众号</div>
          {canShowWechatControls ? (
            <>
              <div className="mt-3 border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                当前发布动作会把 Markdown 先渲染为微信兼容 HTML，再按所选模板推入公众号草稿箱。
              </div>
              <Select aria-label="微信模板" value={wechatTemplateId ?? ""} onChange={(event) => setWechatTemplateId(event.target.value || null)} className="mt-3">
                <option value="">选择微信模板（默认）</option>
                {templates.map((template) => (
                  <option key={`${template.id}-${template.version}`} value={template.id}>
                    [{template.ownerUserId == null ? "官方" : "私有"}] {template.name} · {template.version}
                  </option>
                ))}
              </Select>
              <Select aria-label="公众号连接" value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} className="mt-3">
                <option value="">选择公众号连接</option>
                {wechatConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.accountName || `连接 ${connection.id}`}{connection.isDefault ? " · 默认" : ""}</option>
                ))}
              </Select>
              <Button
                onClick={() => {
                  void openWechatConnectModal(false);
                }}
                variant="secondary"
                fullWidth
                className="mt-3"
              >
                新增公众号连接
              </Button>
              {selectedTemplate ? (
                <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                    {selectedTemplate.meta || "模板"} · {selectedTemplate.version} · {formatTemplateAssetOwner(selectedTemplate)}
                  </div>
                  <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedTemplate.name}</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{selectedTemplate.description || "当前模板未填写说明，但会参与微信 HTML 渲染。"}</div>
                  <div className="mt-2 text-xs leading-6 text-inkMuted">来源：{formatTemplateSourceSummary(selectedTemplate)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formatTemplateConfigSummary(selectedTemplate).map((item) => (
                      <span key={`${selectedTemplate.id}-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前未显式指定模板，将使用默认微信渲染样式。
                </div>
              )}
              {selectedConnection ? (
                <div className="mt-3 border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">目标公众号</div>
                  <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedConnection.accountName || `连接 ${selectedConnection.id}`}</div>
                  <div className="mt-2">
                    状态：{formatConnectionStatus(selectedConnection.status)}
                    {selectedConnection.isDefault ? " · 默认连接" : ""}
                  </div>
                  <div className="text-inkMuted">
                    {selectedConnection.accessTokenExpiresAt ? `访问令牌到期：${new Date(selectedConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录访问令牌到期时间"}
                  </div>
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
                  当前还没有可用公众号连接。可直接在这里补录公众号 AppID / AppSecret，完成后会继续当前发布流程。
                </div>
              )}
              {pendingPublishIntent ? (
                <div className="mt-3 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
                  <div className="text-xs uppercase tracking-[0.18em] text-warning">待恢复发布意图</div>
                  <div className="mt-2">
                    上一次发布在 {new Date(pendingPublishIntent.createdAt).toLocaleString("zh-CN")}
                    {pendingPublishIntent.reason === "missing_connection"
                      ? " 因尚未配置公众号连接而中断。"
                      : " 因公众号凭证不可用而中断。"}
                    {pendingPublishIntent.templateId ? " 这次恢复时会继续沿用当前编辑器里的模板和正文状态。" : " 恢复后会直接沿用当前编辑器里的正文状态继续发布。"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={resumePendingPublishIntent}
                      disabled={publishing}
                      variant="secondary"
                      size="sm"
                      className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      {publishing ? "恢复中…" : "恢复继续发布"}
                    </Button>
                    <Button
                      onClick={() => {
                        void clearPendingPublishIntent();
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      清除待发布状态
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">发布前最终预览</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">
                      这里展示的是当前标题、正文和模板组合后，真正会提交给微信草稿箱的最终 HTML。
                    </div>
                  </div>
                  <Button
                    onClick={loadPublishPreview}
                    disabled={loadingPublishPreview}
                    variant="secondary"
                    size="sm"
                  >
                    {loadingPublishPreview ? "生成中…" : "生成最终预览"}
                  </Button>
                </div>
                {hasUnsavedWechatRenderInputs ? (
                  <div className="mt-3 border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                    检测到标题、正文或模板选择尚未保存。正式发布时系统会先保存，再按最终状态重新渲染。
                  </div>
                ) : null}
                {publishPreview ? (() => {
                  const researchGuardChecks = publishPreview.publishGuard.checks.filter((check) => isResearchGuardCheckKey(check.key));
                  const otherGuardChecks = publishPreview.publishGuard.checks.filter((check) => !isResearchGuardCheckKey(check.key));
                  const researchBlockedCount = researchGuardChecks.filter((check) => check.status === "blocked").length;
                  const researchWarningCount = researchGuardChecks.filter((check) => check.status === "warning").length;
                  const otherBlockedCount = otherGuardChecks.filter((check) => check.status === "blocked").length;
                  const otherWarningCount = otherGuardChecks.filter((check) => check.status === "warning").length;
                  const renderGuardCheckCard = (check: PublishPreviewState["publishGuard"]["checks"][number]) => (
                    <div key={check.key} className="flex flex-wrap items-start justify-between gap-3 border border-lineStrong bg-paperStrong px-3 py-3 text-sm">
                      <div>
                        <div className="font-medium text-ink">{check.label}</div>
                        <div className="mt-1 leading-6 text-inkSoft">{check.detail}</div>
                        {check.actionLabel && check.targetStageCode ? (
                          <Button
                            type="button"
                            onClick={() => {
                              void updateWorkflow(check.targetStageCode as typeof workflow.currentStageCode, "set");
                            }}
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                          >
                            {check.actionLabel}
                          </Button>
                        ) : null}
                      </div>
                      <div className={`shrink-0 text-xs ${
                        check.status === "passed"
                          ? "text-emerald-700"
                          : check.status === "warning"
                            ? "text-warning"
                            : "text-danger"
                      }`}>
                        {check.status === "passed" ? "通过" : check.status === "warning" ? "需关注" : "拦截"}
                      </div>
                    </div>
                  );

                  return (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    <div className="grid gap-3 md:grid-cols-6">
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究拦截</div>
                        <div className="mt-2 font-serifCn text-2xl text-danger text-balance">{researchBlockedCount}</div>
                      </div>
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究待补</div>
                        <div className="mt-2 font-serifCn text-2xl text-warning text-balance">{researchWarningCount}</div>
                      </div>
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他拦截</div>
                        <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{otherBlockedCount}</div>
                      </div>
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他警告</div>
                        <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{otherWarningCount}</div>
                      </div>
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">AI 噪声</div>
                        <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{publishPreview.publishGuard.aiNoise.score}</div>
                      </div>
                      <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">素材挂载</div>
                        <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{publishPreview.publishGuard.materialReadiness.attachedFragmentCount}</div>
                      </div>
                    </div>
                    <div className={`border px-3 py-3 text-sm leading-7 ${
                      publishPreview.publishGuard.canPublish
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-danger/30 bg-surface text-danger"
                    }`}>
                      {publishPreview.publishGuard.canPublish
                        ? "发布守门检查已通过。"
                        : `发布守门检查未通过：${publishPreview.publishGuard.blockers.join("；")}`}
                    </div>
                    <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">阶段完成定义</div>
                      <div className="mt-3 grid gap-2">
                        {publishPreview.publishGuard.stageReadiness.map((stage) => (
                          <div key={stage.stageCode} className="flex flex-wrap items-start justify-between gap-3 border border-lineStrong bg-surface px-3 py-3 text-sm">
                            <div>
                              <div className="font-medium text-ink">{stage.title}</div>
                              <div className="mt-1 leading-6 text-inkSoft">{stage.detail}</div>
                            </div>
                            <div className={`text-xs ${
                              stage.status === "ready" ? "text-emerald-700" : stage.status === "blocked" ? "text-danger" : "text-warning"
                            }`}>
                              {formatPublishStageStatus(stage.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
                      {(() => {
                        const weakestLayer = getWeakestWritingQualityLayerSummary(publishPreview.publishGuard.qualityPanel);
                        if (!weakestLayer) {
                          return null;
                        }
                        return (
                          <div className={`mb-3 border px-4 py-3 text-sm leading-7 ${
                            weakestLayer.status === "blocked"
                              ? "border-danger/30 bg-surface text-danger"
                              : weakestLayer.status === "needs_attention"
                                ? "border-warning/40 bg-surfaceWarning text-warning"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}>
                            当前优先修复：{weakestLayer.title}。{weakestLayer.suggestion}
                          </div>
                        );
                      })()}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">四层质检面板</div>
                          <div className="mt-2 text-sm leading-7 text-inkSoft">
                            发布前同时看硬规则、风格一致性、内容质量和活人感，避免只盯单个分数。
                          </div>
                        </div>
                        <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                          总分 {publishPreview.publishGuard.qualityPanel.overallScore}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {publishPreview.publishGuard.qualityPanel.layers.map((layer) => (
                          <div key={layer.code} className="border border-lineStrong bg-surface px-4 py-4 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="font-medium text-ink">{layer.title}</div>
                              <div className={`text-xs ${
                                layer.status === "ready" ? "text-emerald-700" : layer.status === "blocked" ? "text-danger" : "text-warning"
                              }`}>
                                {formatWritingQualityStatus(layer.status)} · {layer.score}
                              </div>
                            </div>
                            <div className="mt-2 leading-6 text-inkSoft">{layer.summary}</div>
                            {layer.issues.length > 0 ? (
                              <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                                {layer.issues.map((item) => (
                                  <div key={item}>- {item}</div>
                                ))}
                              </div>
                            ) : null}
                            {layer.suggestions.length > 0 ? (
                              <div className="mt-3 border border-lineStrong/60 bg-paperStrong px-3 py-3 text-xs leading-6 text-inkSoft">
                                {layer.suggestions[0]}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      {researchGuardChecks.length > 0 ? (
                        <div className="border border-warning/40 bg-surfaceWarm px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究底座守门</div>
                              <div className="mt-2 text-sm leading-7 text-inkSoft">
                                这组检查专门看是否真的研究透了，再决定正文判断能不能写硬。
                              </div>
                            </div>
                            <div className="grid min-w-[220px] gap-2 sm:grid-cols-3">
                              <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                                <div className="uppercase tracking-[0.14em] text-inkMuted">总项</div>
                                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{researchGuardChecks.length}</div>
                              </div>
                              <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                                <div className="uppercase tracking-[0.14em] text-inkMuted">拦截</div>
                                <div className="mt-2 font-serifCn text-2xl text-danger text-balance">{researchBlockedCount}</div>
                              </div>
                              <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                                <div className="uppercase tracking-[0.14em] text-inkMuted">待补</div>
                                <div className="mt-2 font-serifCn text-2xl text-warning text-balance">{researchWarningCount}</div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {researchGuardChecks.map(renderGuardCheckCard)}
                          </div>
                        </div>
                      ) : null}

                      {otherGuardChecks.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他发布检查</div>
                          <div className="grid gap-2">
                            {otherGuardChecks.map(renderGuardCheckCard)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">连接自检</div>
                        <div className="mt-2 font-medium text-ink">{publishPreview.publishGuard.connectionHealth.connectionName || "未选择连接"}</div>
                        <div className="mt-2">状态：{formatConnectionStatus(publishPreview.publishGuard.connectionHealth.status)}</div>
                        <div className="mt-1">{publishPreview.publishGuard.connectionHealth.detail}</div>
                        <div className="mt-1 text-xs text-inkMuted">
                          {publishPreview.publishGuard.connectionHealth.tokenExpiresAt
                            ? `访问令牌到期：${new Date(publishPreview.publishGuard.connectionHealth.tokenExpiresAt).toLocaleString("zh-CN")}`
                            : "尚未记录访问令牌到期时间"}
                        </div>
                      </div>
                      <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                        <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">AI 噪声与素材</div>
                        <div className="mt-2">噪声等级：{formatAiNoiseLevel(publishPreview.publishGuard.aiNoise.level)}</div>
                        <div className="mt-1">信源类型：{publishPreview.publishGuard.materialReadiness.uniqueSourceTypeCount}</div>
                        <div className="mt-1">截图证据：{publishPreview.publishGuard.materialReadiness.screenshotCount}</div>
                        {publishPreview.publishGuard.aiNoise.findings.length > 0 ? (
                          <div className="mt-3 space-y-1 text-xs text-inkMuted">
                            {publishPreview.publishGuard.aiNoise.findings.map((item) => (
                              <div key={item}>{item}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {publishPreview.publishGuard.warnings.length > 0 ? (
                      <div className="space-y-2">
                        {publishPreview.publishGuard.warnings.map((warning) => (
                          <div key={warning} className="border border-warning/40 bg-surfaceWarning px-3 py-3 text-xs leading-6 text-warning">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {publishPreview.publishGuard.suggestions.length > 0 ? (
                      <div className="space-y-2">
                        {publishPreview.publishGuard.suggestions.map((suggestion) => (
                          <div key={suggestion} className="border border-lineStrong bg-paperStrong px-3 py-3 text-xs leading-6 text-inkMuted">
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {publishPreview.publishGuard.latestAttempt ? (
                      <div className={`border px-4 py-4 text-sm leading-7 ${
                        publishPreview.publishGuard.latestAttempt.status === "failed"
                          ? "border-danger/30 bg-surface text-danger"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}>
                        <div className="text-xs uppercase tracking-[0.18em]">最近一次发布尝试</div>
                        <div className="mt-2">
                          {new Date(publishPreview.publishGuard.latestAttempt.createdAt).toLocaleString("zh-CN")} ·
                          {publishPreview.publishGuard.latestAttempt.status === "failed" ? " 失败" : " 成功"}
                        </div>
                        {publishPreview.publishGuard.latestAttempt.status === "failed" ? (
                          <div className="mt-1">
                            {publishPreview.publishGuard.latestAttempt.failureReason || "未记录失败原因"}
                            {publishPreview.publishGuard.latestAttempt.failureCode ? ` · ${formatPublishFailureCode(publishPreview.publishGuard.latestAttempt.failureCode)}` : ""}
                          </div>
                        ) : (
                          <div className="mt-1">
                            {publishPreview.publishGuard.latestAttempt.mediaId ? `草稿媒体 ID：${publishPreview.publishGuard.latestAttempt.mediaId}` : "最近一次推送成功。"}
                          </div>
                        )}
                        {publishPreview.publishGuard.latestAttempt.status === "failed" ? (
                          <Button
                            type="button"
                          onClick={retryLatestPublish}
                          disabled={retryingPublish || !selectedConnectionId}
                          variant="secondary"
                          size="sm"
                          className="mt-3 border-cinnabar px-4 text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                        >
                          {retryingPublish ? "重试中…" : "按最近失败上下文重试"}
                        </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className={publishPreview.isConsistentWithSavedHtml ? "text-emerald-700" : "text-danger"}>
                        {publishPreview.isConsistentWithSavedHtml ? "当前保存版与最终发布效果一致" : "当前保存版与最终发布效果不一致"}
                      </div>
                      <div className="text-xs text-inkMuted">
                        {new Date(publishPreview.generatedAt).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(publishPreview.templateSummary.length ? publishPreview.templateSummary : ["默认微信渲染"]).map((item) => (
                        <span key={`publish-preview-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                          {item}
                        </span>
                      ))}
                    </div>
                    {publishPreview.templateName ? (
                      <div className="text-xs text-inkMuted">
                        模板：{publishPreview.templateName}{publishPreview.templateVersion ? ` · ${publishPreview.templateVersion}` : ""}
                        {publishPreview.templateOwnerLabel ? ` · ${publishPreview.templateOwnerLabel}` : ""}
                        {publishPreview.templateSourceLabel ? ` · 来源 ${publishPreview.templateSourceLabel}` : ""}
                      </div>
                    ) : null}
                    {publishPreview.mismatchWarnings.length ? (
                      <div className="space-y-2">
                        {publishPreview.mismatchWarnings.map((warning) => (
                          <div key={warning} className="border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setView("preview")} variant="secondary" size="sm">
                        在中间栏查看
                      </Button>
                      {!publishPreview.isConsistentWithSavedHtml ? (
                        <Button
                          onClick={refreshPublishPreviewRender}
                          disabled={refreshingPublishPreview}
                          variant="secondary"
                          size="sm"
                          className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                        >
                          {refreshingPublishPreview ? "刷新中…" : "刷新为最终发布效果"}
                        </Button>
                      ) : null}
                    </div>
                    <div className="border border-lineStrong bg-surfaceHighlight">
                      <WechatNativePreview
                        html={publishPreview.finalHtml || ""}
                        title={publishPreview.title || title}
                        authorName={selectedSeries?.personaName || undefined}
                        accountName={publishPreview.publishGuard.connectionHealth.connectionName || undefined}
                      />
                    </div>
                  </div>
                  );
                })() : null}
              </div>
              <Button onClick={publish} disabled={publishing} variant="primary" fullWidth className="mt-4">
                {publishing ? "推送中…" : "推送到微信草稿箱"}
              </Button>
              <Link href="/settings" className="mt-3 block border border-lineStrong bg-surface px-4 py-3 text-center text-sm text-inkSoft">
                去设置页管理公众号连接
              </Link>
            </>
          ) : (
            <>
              <div className="mt-3 border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
                {displayPlanName}当前不支持微信草稿箱推送。你仍可继续编辑、导出 Markdown 或 HTML；升级到 Pro 或更高套餐后，才可绑定公众号并一键推送到草稿箱。
              </div>
              <Link href="/pricing" className="mt-3 block border border-cinnabar bg-surface px-4 py-3 text-center text-sm text-cinnabar">
                查看套餐权限
              </Link>
            </>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前稿件最近同步</div>
            {latestSyncLog ? (
              <div className="mt-3 space-y-3">
                <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{latestSyncLog.connectionName || "未命名公众号"}</div>
                      <div className="text-inkMuted">{new Date(latestSyncLog.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                    <div className={latestSyncLog.status === "success" ? "text-emerald-600" : "text-cinnabar"}>
                      {latestSyncLog.status === "success" ? "推送成功" : "推送失败"}
                    </div>
                  </div>
                  <div className="mt-3">
                    {latestSyncLog.status === "success"
                      ? latestSyncLog.mediaId
                        ? `草稿媒体 ID：${latestSyncLog.mediaId}`
                        : "微信已返回成功，但未回填媒体 ID。"
                      : latestSyncLog.failureReason || "未记录失败原因"}
                  </div>
                  {latestSyncLog.failureCode ? (
                    <div className="mt-2 text-xs text-inkMuted">失败分类：{formatPublishFailureCode(latestSyncLog.failureCode)}</div>
                  ) : null}
                  {latestSyncLog.retryCount > 0 ? <div className="mt-2 text-xs text-inkMuted">重试次数：{latestSyncLog.retryCount}</div> : null}
                  {latestSyncLog.articleVersionHash ? <div className="mt-2 text-xs text-inkMuted">版本哈希：{latestSyncLog.articleVersionHash.slice(0, 12)}</div> : null}
                  {latestSyncLog.templateId ? <div className="mt-1 text-xs text-inkMuted">模板：{latestSyncLog.templateId}</div> : null}
                  {latestSyncLog.status === "failed" ? (
                    <Button
                      type="button"
                      onClick={retryLatestPublish}
                      disabled={retryingPublish || !selectedConnectionId}
                      variant="secondary"
                      size="sm"
                      className="mt-3 border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      {retryingPublish ? "重试中…" : "直接重试这次发布"}
                    </Button>
                  ) : null}
                </div>
                {(latestSyncLog.requestSummary || latestSyncLog.responseSummary) ? (
                  <div className="space-y-2">
                    {latestSyncLog.requestSummary ? (
                      <div className="border border-lineStrong bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
                        <div className="uppercase tracking-[0.18em] text-inkMuted">请求摘要</div>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.requestSummary)}</pre>
                      </div>
                    ) : null}
                    {latestSyncLog.responseSummary ? (
                      <div className="border border-lineStrong bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
                        <div className="uppercase tracking-[0.18em] text-inkMuted">响应摘要</div>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.responseSummary)}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Link href="/settings/publish" className="block border border-lineStrong bg-surface px-4 py-3 text-center text-sm text-inkSoft">
                  去设置查看发布连接与同步记录
                </Link>
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                这篇稿件还没有同步记录。首次推送成功后，这里会显示最近一次请求与响应摘要。
              </div>
            )}
          </div>
        </div>
        ) : null}

        {isPolishPhase ? (
        <div className="border border-warning/40 bg-surfaceWarm p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-warning">手稿校阅与比对</div>
          {diffState ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm font-medium text-ink">
                对比快照：{diffState.snapshotNote || "未命名快照"} · {new Date(diffState.createdAt).toLocaleString("zh-CN")}
              </div>
              <div className="flex gap-4 text-xs font-medium tracking-wide">
                <span className="text-emerald-700">+{diffState.summary.added} 增补</span>
                <span className="text-danger">-{diffState.summary.removed} 删减</span>
                <span className="text-warning">={diffState.summary.unchanged} 留存</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto border-t border-dashed border-warning/40 bg-[linear-gradient(transparent_31px,rgba(140,107,75,0.1)_32px)] bg-[length:100%_32px] pt-4 font-serifCn text-[15px] leading-8 text-ink">
                {diffState.lines.map((line, index) => (
                  <span
                    key={`${line.type}-${index}`}
                    className={
                      line.type === "added"
                        ? "bg-emerald-50 text-emerald-800 underline decoration-emerald-300/60 decoration-wavy decoration-1 underline-offset-4"
                        : line.type === "removed"
                          ? "text-danger opacity-70 line-through decoration-danger/80 decoration-2"
                          : "text-ink"
                    }
                  >
                    {line.content}
                    {line.type !== "unchanged" && line.content ? " " : ""}
                    {(!line.content || line.content.trim() === "") && <br />}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm leading-7 text-warning">
              从左侧「快照管理」列表中选择一个历史版本，即可像翻阅纸质手稿一般，查看它的批注与修改痕迹。
            </div>
          )}
        </div>
        ) : null}
      </aside>

      {showMobileInspector ? (
        <div className="fixed inset-0 z-50 bg-black/35 md:hidden">
          <button
            type="button"
            aria-label="关闭辅助面板"
            className="absolute inset-0"
            onClick={() => setShowMobileInspector(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="稿件辅助面板"
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto overscroll-contain border-t border-lineStrong bg-surface px-4 pt-4 shadow-ink"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">辅助面板</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">手机端按需唤起的工作台侧栏</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  把桌面端默认常驻的快照、背景卡、语言守卫和视觉建议压成抽屉，避免主链路被挤占。
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setShowMobileInspector(false)}
                variant="secondary"
                size="sm"
              >
                关闭
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前阶段</div>
                    <div className="mt-2 font-serifCn text-2xl text-ink">{currentArticleMainStep.title}</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">
                      {currentStage ? `执行阶段：${currentStage.title}` : "当前阶段说明暂未生成。"}
                    </div>
                  </div>
                  <span className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkMuted">
                    {status === "generating" ? "生成中" : formatArticleStatusLabel(status)}
                  </span>
                </div>
              </section>

              {!showLeftWorkspaceRail ? (
                <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">快照管理</div>
                  <div className="mt-3 flex gap-2">
                    <Input
                      aria-label="快照备注"
                      value={snapshotNote}
                      onChange={(event) => setSnapshotNote(event.target.value)}
                      placeholder="快照备注"
                      className="min-w-0 flex-1"
                    />
                    <Button onClick={createSnapshot} variant="primary" size="sm">
                      存档
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {snapshots.slice(0, 3).map((snapshot) => (
                      <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
                        <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                        <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            onClick={() => {
                              setShowMobileInspector(false);
                              void loadDiff(snapshot.id);
                            }}
                            variant="secondary"
                            size="sm"
                          >
                            {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                          </Button>
                          <Button
                            onClick={() => {
                              setShowMobileInspector(false);
                              void restoreSnapshot(snapshot.id);
                            }}
                            variant="secondary"
                            size="sm"
                          >
                            回滚
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {showKnowledgeCardsRail ? (
                <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">相关背景卡</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        当前共命中 {knowledgeCardItems.length} 张背景卡，辅助面板只保留摘要，完整资产仍在设置页维护。
                      </div>
                    </div>
                    <Link
                      href="/settings/assets"
                      className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft"
                      onClick={() => setShowMobileInspector(false)}
                    >
                      去素材资产中心
                    </Link>
                  </div>
                  <div className="mt-3 space-y-2">
                    {knowledgeCardItems.slice(0, 3).map((card) => (
                      <div key={card.id} className="border border-lineStrong bg-surface px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                          <span className="border border-lineStrong bg-paperStrong px-2 py-1">{card.cardType}</span>
                          <span className="border border-lineStrong bg-paperStrong px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                        </div>
                        <div className="mt-2 text-sm text-ink">{card.title}</div>
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          {card.summary || card.latestChangeSummary || "进入素材资产中心查看完整摘要与证据。"}
                        </div>
                      </div>
                    ))}
                    {knowledgeCardItems.length === 0 ? (
                      <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                        当前还没有相关背景卡，先补素材或刷新知识卡，辅助判断才会更稳。
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {showLanguageGuardRail ? (
                <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">即时语言守卫</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        {liveLanguageGuardHits.length > 0
                          ? `当前命中 ${liveLanguageGuardHits.length} 条规则，建议切到红笔校阅逐条处理。`
                          : "当前稿件未命中语言守卫规则。"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        setView("audit");
                        setShowMobileInspector(false);
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      去红笔校阅
                    </Button>
                  </div>
                  {liveLanguageGuardHits.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {liveLanguageGuardHits.slice(0, 3).map((hit, index) => (
                        <div key={`${hit.ruleId}-${index}`} className="border border-lineStrong bg-surface px-4 py-3">
                          <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
                            <span className="border border-lineStrong bg-paperStrong px-2 py-1">
                              {hit.ruleKind === "pattern" ? "句式" : "词语"}
                            </span>
                            <span className="border border-lineStrong bg-paperStrong px-2 py-1">
                              {hit.severity === "high" ? "高风险" : "提醒"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-ink">{hit.matchedText || hit.patternText}</div>
                          {hit.rewriteHint ? (
                            <div className="mt-2 text-xs leading-6 text-inkMuted">改写建议：{hit.rewriteHint}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {showVisualEngineRail ? (
                <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">视觉联想引擎</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{visualSuggestion}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nodeVisualSuggestions.length > 0 ? (
                      <Button onClick={saveImagePromptAssets} disabled={savingImagePrompts} variant="secondary" size="sm">
                        {savingImagePrompts ? "保存中…" : "保存配图提示词"}
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => {
                        setShowMobileInspector(false);
                        void generateCoverImage();
                      }}
                      disabled={coverImageButtonDisabled}
                      variant={canGenerateCoverImage && !coverImageLimitReached ? "primary" : "secondary"}
                      size="sm"
                    >
                      {coverImageButtonLabel}
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showWechatConnectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-[560px] overflow-auto overscroll-contain border border-lineStrong bg-surfaceHighlight p-6 shadow-ink">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">公众号快速配置</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
                  {continuePublishAfterWechatConnect ? "补录凭证后继续发布" : "新增公众号连接"}
                </div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取访问令牌。
                </div>
              </div>
              <Button
                onClick={closeWechatConnectModal}
                variant="secondary"
                size="sm"
              >
                关闭
              </Button>
            </div>
            <form onSubmit={submitWechatConnectionFromEditor} className="mt-5 space-y-3">
              <Input aria-label="公众号名称"
                value={wechatConnectAccountName}
                onChange={(event) => setWechatConnectAccountName(event.target.value)}
                placeholder="公众号名称"
              />
              <Input aria-label="原始 ID"
                value={wechatConnectOriginalId}
                onChange={(event) => setWechatConnectOriginalId(event.target.value)}
                placeholder="原始 ID"
              />
              <Input aria-label="公众号 AppID"
                value={wechatConnectAppId}
                onChange={(event) => setWechatConnectAppId(event.target.value)}
                placeholder="公众号 AppID"
              />
              <Input aria-label="公众号 AppSecret"
                value={wechatConnectAppSecret}
                onChange={(event) => setWechatConnectAppSecret(event.target.value)}
                placeholder="公众号 AppSecret"
                type="password"
              />
              <label className="flex items-center gap-3 border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
                <input aria-label="input control"
                  type="checkbox"
                  checked={wechatConnectIsDefault}
                  onChange={(event) => setWechatConnectIsDefault(event.target.checked)}
                />
                保存后设为默认公众号
              </label>
              {wechatConnectMessage ? (
                <div className="border border-dashed border-danger/30 bg-surface px-4 py-3 text-sm leading-7 text-danger">
                  {wechatConnectMessage}
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  onClick={closeWechatConnectModal}
                  disabled={wechatConnectSubmitting}
                  variant="secondary"
                >
                  先不配置
                </Button>
                <Button
                  type="submit"
                  disabled={wechatConnectSubmitting}
                  variant="primary"
                >
                  {wechatConnectSubmitting
                    ? continuePublishAfterWechatConnect
                      ? "校验并续发中…"
                      : "校验中…"
                    : continuePublishAfterWechatConnect
                      ? "保存并继续发布"
                      : "保存公众号连接"}
                </Button>
              </div>
            </form>
          </div>
        </div>
        ) : null}
    </div>
  );
}
