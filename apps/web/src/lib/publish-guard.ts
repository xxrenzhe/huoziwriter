import { analyzeAiNoise } from "./ai-noise-scan";
import { getDocumentNodes } from "./document-outline";
import { getDocumentStageArtifact } from "./document-stage-artifacts";
import { getActiveTemplateById } from "./marketplace";
import { getDocumentById, getLatestCoverImage, getLatestWechatSyncLogForDocument, getWechatConnectionRaw } from "./repositories";

type GuardStatus = "passed" | "warning" | "blocked";
type GuardSeverity = "blocking" | "warning" | "suggestion";

type PublishGuardCheck = {
  key: string;
  label: string;
  status: GuardStatus;
  severity: GuardSeverity;
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

type StageReadiness = {
  stageCode: string;
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  detail: string;
};

export type PublishGuardResult = {
  canPublish: boolean;
  blockers: string[];
  warnings: string[];
  suggestions: string[];
  checks: PublishGuardCheck[];
  stageReadiness: StageReadiness[];
  aiNoise: {
    score: number;
    level: string;
    findings: string[];
    suggestions: string[];
  };
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

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function hasArtifactPayload(value: { payload?: Record<string, unknown> | null } | null) {
  return Boolean(value?.payload && Object.keys(value.payload).length > 0);
}

function pushCheck(
  list: PublishGuardCheck[],
  blockers: string[],
  warnings: string[],
  suggestions: string[],
  input: PublishGuardCheck,
) {
  list.push(input);
  if (input.severity === "blocking" || input.status === "blocked") {
    blockers.push(input.detail);
    return;
  }
  if (input.severity === "warning" || input.status === "warning") {
    warnings.push(input.detail);
    return;
  }
  suggestions.push(input.detail);
}

export async function evaluatePublishGuard(input: {
  documentId: number;
  userId: number;
  templateId?: string | null;
  wechatConnectionId?: number | null;
}): Promise<PublishGuardResult> {
  const [document, outlineArtifact, deepWritingArtifact, factCheckArtifact, prosePolishArtifact, nodes, coverImage, connection, template, latestAttempt] = await Promise.all([
    getDocumentById(input.documentId, input.userId),
    getDocumentStageArtifact(input.documentId, input.userId, "outlinePlanning"),
    getDocumentStageArtifact(input.documentId, input.userId, "deepWriting"),
    getDocumentStageArtifact(input.documentId, input.userId, "factCheck"),
    getDocumentStageArtifact(input.documentId, input.userId, "prosePolish"),
    getDocumentNodes(input.documentId),
    getLatestCoverImage(input.userId, input.documentId),
    input.wechatConnectionId ? getWechatConnectionRaw(input.wechatConnectionId, input.userId) : Promise.resolve(null),
    input.templateId ? getActiveTemplateById(input.templateId, input.userId) : Promise.resolve(null),
    getLatestWechatSyncLogForDocument({
      userId: input.userId,
      documentId: input.documentId,
      wechatConnectionId: input.wechatConnectionId ?? null,
    }),
  ]);

  const checks: PublishGuardCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const allFragments = nodes.flatMap((node) => node.fragments);
  const uniqueFragmentIds = new Set(allFragments.map((fragment) => fragment.id));
  const uniqueSourceTypes = new Set(allFragments.map((fragment) => String(fragment.sourceType || "manual")));
  const screenshotCount = allFragments.filter((fragment) => String(fragment.sourceType || "") === "screenshot" || String(fragment.usageMode || "") === "image").length;
  const materialReadiness = {
    attachedFragmentCount: uniqueFragmentIds.size,
    uniqueSourceTypeCount: uniqueSourceTypes.size,
    screenshotCount,
  };

  const outlineSelection = getRecord(outlineArtifact?.payload?.selection);
  const selectedTitle = getString(outlineSelection?.selectedTitle) || getString(outlineArtifact?.payload?.workingTitle);
  const titleConfirmed = selectedTitle.length > 0;
  const outlineGapHints = getStringArray(outlineArtifact?.payload?.materialGapHints, 4);
  const historyReferencePlan = getStringArray(deepWritingArtifact?.payload?.historyReferencePlan ? ["history"] : [], 1);
  const languageGuardHits = Array.isArray(prosePolishArtifact?.payload?.languageGuardHits)
    ? (prosePolishArtifact?.payload?.languageGuardHits as unknown[])
    : [];
  const localAiNoise = analyzeAiNoise(document?.markdown_content || "");
  const aiNoiseRecord = getRecord(prosePolishArtifact?.payload?.aiNoise);
  const aiNoiseScore = Number(aiNoiseRecord?.score ?? localAiNoise.score ?? 0);
  const aiNoiseLevel =
    getString(aiNoiseRecord?.level) || getString(localAiNoise.level) || (aiNoiseScore >= 70 ? "high" : aiNoiseScore >= 40 ? "medium" : "low");
  const aiNoiseFindings = getStringArray(aiNoiseRecord?.findings, 6).length
    ? getStringArray(aiNoiseRecord?.findings, 6)
    : getStringArray(localAiNoise.findings, 6);
  const aiNoiseSuggestions = getStringArray(aiNoiseRecord?.suggestions, 4).length
    ? getStringArray(aiNoiseRecord?.suggestions, 4)
    : getStringArray(localAiNoise.suggestions, 4);
  const missingEvidence = getStringArray(factCheckArtifact?.payload?.missingEvidence, 6);
  const overallRisk = getString(factCheckArtifact?.payload?.overallRisk);
  const personaAlignment = getString(factCheckArtifact?.payload?.personaAlignment);
  const topicAlignment = getString(factCheckArtifact?.payload?.topicAlignment);

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "title_confirmation",
    label: "标题确认",
    status: titleConfirmed ? "passed" : "blocked",
    severity: titleConfirmed ? "suggestion" : "blocking",
    detail: titleConfirmed ? `已确认发布标题：${selectedTitle}` : "发布前需要先确认一个可落地标题。",
    targetStageCode: "outlinePlanning",
    actionLabel: titleConfirmed ? undefined : "去确认标题",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "outlinePlanning",
    label: "大纲规划",
    status: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "passed" : "blocked",
    severity: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "suggestion" : "blocking",
    detail:
      outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact)
        ? "大纲规划已完成，发布主结构可追踪。"
        : "发布前需要先完成大纲规划。",
    targetStageCode: "outlinePlanning",
    actionLabel: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? undefined : "去补大纲",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "deepWriting",
    label: "深度写作",
    status: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? "passed" : "blocked",
    severity: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? "suggestion" : "blocking",
    detail:
      deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
        ? "深度写作执行卡已完成。"
        : "发布前需要先完成深度写作。",
    targetStageCode: "deepWriting",
    actionLabel: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? undefined : "去补执行卡",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "factCheck",
    label: "事实核查",
    status:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact) && missingEvidence.length === 0 && overallRisk !== "high"
        ? "passed"
        : factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? "warning"
          : "blocked",
    severity:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
        ? missingEvidence.length > 0 || overallRisk === "high"
          ? "warning"
          : "suggestion"
        : "blocking",
    detail:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
        ? missingEvidence.length > 0
          ? `事实核查已跑完，但仍缺这些关键证据：${missingEvidence.join("；")}`
          : overallRisk === "high"
            ? "事实核查已完成，但仍存在高风险表述，建议先处理。"
            : "事实核查已完成。"
        : "发布前需要先完成事实核查。",
    targetStageCode: "factCheck",
    actionLabel: "去处理核查项",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "alignment",
    label: "系列口径与选题对齐",
    status: personaAlignment && topicAlignment ? "passed" : "warning",
    severity: personaAlignment && topicAlignment ? "suggestion" : "warning",
    detail:
      personaAlignment && topicAlignment
        ? `人设与选题已对齐：${personaAlignment} / ${topicAlignment}`
        : "尚未明确记录人设/主题对齐结论，建议回到事实核查阶段补齐。",
    targetStageCode: "factCheck",
    actionLabel: "去补对齐结论",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "material",
    label: "素材可用性",
    status:
      materialReadiness.attachedFragmentCount === 0 ? "warning" : materialReadiness.uniqueSourceTypeCount <= 1 ? "warning" : "passed",
    severity:
      materialReadiness.attachedFragmentCount === 0 ? "warning" : materialReadiness.uniqueSourceTypeCount <= 1 ? "warning" : "suggestion",
    detail:
      materialReadiness.attachedFragmentCount === 0
        ? "当前文稿没有挂载素材，发布前至少补 2 条可核对素材。"
        : materialReadiness.uniqueSourceTypeCount <= 1
          ? `当前只覆盖 ${materialReadiness.uniqueSourceTypeCount} 类来源，建议补链接或截图证据，避免单一信源。`
          : `当前已挂载 ${materialReadiness.attachedFragmentCount} 条素材，覆盖 ${materialReadiness.uniqueSourceTypeCount} 类来源。`,
    targetStageCode: "outlinePlanning",
    actionLabel: materialReadiness.attachedFragmentCount === 0 ? "去补素材" : materialReadiness.uniqueSourceTypeCount <= 1 ? "去补证据" : undefined,
  });

  if (outlineGapHints.length > 0) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "outline_material_gap",
      label: "大纲证据缺口",
      status: "warning",
      severity: "warning",
      detail: `大纲阶段仍提示这些素材缺口：${outlineGapHints.join("；")}`,
      targetStageCode: "outlinePlanning",
      actionLabel: "去补节点素材",
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "history_reference",
    label: "历史文章自然引用",
    status: historyReferencePlan.length > 0 ? "passed" : "warning",
    severity: historyReferencePlan.length > 0 ? "suggestion" : "warning",
    detail: historyReferencePlan.length > 0 ? "已配置旧文自然引用计划。" : "还没有旧文自然引用计划，若这是系列文章，建议补 1-2 篇旧文承接。",
    targetStageCode: "deepWriting",
    actionLabel: historyReferencePlan.length > 0 ? undefined : "去补旧文引用",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "prosePolish",
    label: "文笔润色",
    status: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? "passed" : "warning",
    severity: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? "suggestion" : "warning",
    detail:
      prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
        ? "润色与表达诊断已完成。"
        : "建议在发布前完成文笔润色，减少机器腔和节奏问题。",
    targetStageCode: "prosePolish",
    actionLabel: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? undefined : "去润色",
  });

  if (languageGuardHits.length > 0) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "language_guard",
      label: "语言守卫",
      status: "warning",
      severity: "warning",
      detail: `当前仍命中 ${languageGuardHits.length} 条语言守卫规则，建议先清理明显机器味。`,
      targetStageCode: "prosePolish",
      actionLabel: "去清理措辞",
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "ai_noise",
    label: "AI 噪声",
    status: aiNoiseScore >= 70 ? "warning" : "passed",
    severity: aiNoiseScore >= 70 ? "warning" : "suggestion",
    detail:
      aiNoiseScore >= 70
        ? `AI 噪声得分 ${aiNoiseScore}，建议先重写空话密集段落。`
        : `AI 噪声得分 ${aiNoiseScore}，当前风险可控。`,
    targetStageCode: "prosePolish",
    actionLabel: aiNoiseScore >= 70 ? "去精修段落" : undefined,
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "coverImage",
    label: "封面图",
    status: coverImage ? "passed" : "blocked",
    severity: coverImage ? "suggestion" : "blocking",
    detail: coverImage ? "封面图已准备。" : "发布前需要先选择封面图。",
    targetStageCode: "coverImage",
    actionLabel: coverImage ? undefined : "去选封面图",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "template",
    label: "排版模板",
    status: input.templateId ? (template ? "passed" : "warning") : "warning",
    severity: input.templateId ? (template ? "suggestion" : "warning") : "suggestion",
    detail: input.templateId ? (template ? "排版模板可用。" : "当前模板不可用，将回退到默认渲染。") : "未显式选择模板，将使用默认微信渲染样式。",
    targetStageCode: "layout",
    actionLabel: template ? undefined : "去检查模板",
  });

  const connectionHealth =
    connection == null
      ? {
          connectionName: null,
          status: "missing",
          detail: "尚未选择微信公众号连接。",
          tokenExpiresAt: null,
        }
      : connection.status === "disabled"
        ? {
            connectionName: connection.account_name ?? "未命名公众号",
            status: "disabled",
            detail: "当前微信公众号连接已停用，不能发布。",
            tokenExpiresAt: connection.access_token_expires_at,
          }
        : connection.status === "valid"
          ? {
              connectionName: connection.account_name ?? "未命名公众号",
              status: "valid",
              detail:
                latestAttempt?.status === "failed" && latestAttempt.failure_code === "auth_failed"
                  ? "连接配置存在最近一次鉴权失败记录，建议先重试校验。"
                  : "连接状态正常，可直接推送。",
              tokenExpiresAt: connection.access_token_expires_at,
            }
          : {
              connectionName: connection.account_name ?? "未命名公众号",
              status: connection.status,
              detail: "公众号连接已配置，但 Token 可能过期，建议先做自检或直接重试一次。",
              tokenExpiresAt: connection.access_token_expires_at,
            };

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "wechatConnection",
    label: "微信公众号连接",
    status:
      connectionHealth.status === "valid"
        ? "passed"
        : connectionHealth.status === "missing" || connectionHealth.status === "disabled"
          ? "blocked"
          : "warning",
    severity:
      connectionHealth.status === "valid"
        ? "suggestion"
        : connectionHealth.status === "missing" || connectionHealth.status === "disabled"
          ? "blocking"
          : "warning",
    detail: connectionHealth.detail,
    actionLabel: connectionHealth.status === "valid" ? undefined : "去检查连接",
  });

  const stageReadiness: StageReadiness[] = [
    {
      stageCode: "outlinePlanning",
      title: "大纲规划",
      status: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "ready" : "blocked",
      detail:
        outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact)
          ? titleConfirmed
            ? "已确认标题、结构与素材入口。"
            : "大纲已生成，但标题还没明确确认。"
          : "先完成标题和结构规划。",
    },
    {
      stageCode: "deepWriting",
      title: "深度写作",
      status:
        deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
          ? historyReferencePlan.length > 0
            ? "ready"
            : "needs_attention"
          : "blocked",
      detail:
        deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
          ? historyReferencePlan.length > 0
            ? "执行卡、系列承接与关键事实都已准备。"
            : "执行卡已准备，但系列旧文承接仍可补强。"
          : "先生成写作执行卡。",
    },
    {
      stageCode: "factCheck",
      title: "事实核查",
      status:
        factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? missingEvidence.length > 0 || overallRisk === "high"
            ? "needs_attention"
            : "ready"
          : "blocked",
      detail:
        factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? missingEvidence.length > 0
            ? `仍有 ${missingEvidence.length} 个关键证据缺口待补。`
            : overallRisk === "high"
              ? "核查已完成，但仍存在高风险表述。"
              : "核查结果可用于发布前放行。"
          : "先完成事实核查。",
    },
    {
      stageCode: "prosePolish",
      title: "文笔润色",
      status:
        prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
          ? aiNoiseScore >= 70 || languageGuardHits.length > 0
            ? "needs_attention"
            : "ready"
          : "needs_attention",
      detail:
        prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
          ? aiNoiseScore >= 70 || languageGuardHits.length > 0
            ? "润色已完成，但仍建议处理 AI 噪声或语言守卫命中项。"
            : "表达质量已基本收口。"
          : "可直接发布，但建议先做一次润色收口。",
    },
    {
      stageCode: "publish",
      title: "发布准备",
      status: coverImage && connectionHealth.status === "valid" ? "ready" : coverImage || connectionHealth.status === "valid" ? "needs_attention" : "blocked",
      detail:
        coverImage && connectionHealth.status === "valid"
          ? "连接、封面和模板已准备。"
          : "发布前还需要处理连接或封面缺口。",
    },
  ];

  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings,
    suggestions,
    checks,
    stageReadiness,
    aiNoise: {
      score: Number.isFinite(aiNoiseScore) ? aiNoiseScore : 0,
      level: aiNoiseLevel || "unknown",
      findings: aiNoiseFindings,
      suggestions: aiNoiseSuggestions,
    },
    materialReadiness,
    connectionHealth,
    latestAttempt: latestAttempt
      ? {
          status: latestAttempt.status,
          createdAt: latestAttempt.created_at,
          failureReason: latestAttempt.failure_reason,
          failureCode: latestAttempt.failure_code,
          retryCount: latestAttempt.retry_count ?? 0,
          mediaId: latestAttempt.media_id,
        }
      : null,
  };
}
