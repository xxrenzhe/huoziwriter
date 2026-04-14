import { getDocumentStageArtifact } from "./document-stage-artifacts";
import { getActiveTemplateById } from "./marketplace";
import { getDocumentById, getLatestCoverImage, getWechatConnectionRaw } from "./repositories";

export type PublishGuardCheckStatus = "passed" | "warning" | "blocked";

export type PublishGuardCheck = {
  key: string;
  label: string;
  status: PublishGuardCheckStatus;
  detail: string;
};

export type PublishGuardResult = {
  canPublish: boolean;
  blockers: string[];
  warnings: string[];
  checks: PublishGuardCheck[];
};

function isAlignmentRisky(value: string) {
  return /(偏离|失配|不符|不匹配|跑题|错位|冲突明显)/.test(value);
}

function buildFactCheckGuard(payload: Record<string, unknown> | null | undefined): PublishGuardCheck {
  if (!payload) {
    return {
      key: "factCheck",
      label: "事实核查",
      status: "blocked",
      detail: "尚未完成事实核查，发布前必须先生成并确认核查结果。",
    };
  }

  const overallRisk = String(payload.overallRisk || "").trim();
  const checks = Array.isArray(payload.checks)
    ? payload.checks
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          status: String(item.status || "").trim(),
        }))
    : [];
  const riskyCount = checks.filter((item) => item.status === "risky").length;
  const needsSourceCount = checks.filter((item) => item.status === "needs_source").length;

  if (overallRisk === "high" || riskyCount > 0) {
    return {
      key: "factCheck",
      label: "事实核查",
      status: "blocked",
      detail:
        riskyCount > 0
          ? `当前仍有 ${riskyCount} 条高风险表述未处理，请先修正后再发布。`
          : "事实核查整体风险为高，必须先处理高风险项。",
    };
  }

  if (overallRisk === "medium" || needsSourceCount > 0) {
    return {
      key: "factCheck",
      label: "事实核查",
      status: "warning",
      detail:
        needsSourceCount > 0
          ? `仍有 ${needsSourceCount} 条表述待补来源，建议补证据后再发布。`
          : "事实核查存在中风险项，建议补充证据或改写语气。",
    };
  }

  return {
    key: "factCheck",
    label: "事实核查",
    status: "passed",
    detail: "事实核查已达可发布状态。",
  };
}

function buildOutlineGuard(payload: Record<string, unknown> | null | undefined): PublishGuardCheck {
  if (!payload) {
    return {
      key: "outlinePlanning",
      label: "大纲规划",
      status: "blocked",
      detail: "尚未完成大纲规划，发布前至少要确认一版结构化大纲。",
    };
  }

  const outlineSections = Array.isArray(payload.outlineSections)
    ? payload.outlineSections.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const selectedTitle =
    payload.selection && typeof payload.selection === "object" && !Array.isArray(payload.selection)
      ? String((payload.selection as Record<string, unknown>).selectedTitle || "").trim()
      : "";
  const workingTitle = String(payload.workingTitle || "").trim();

  if (outlineSections.length === 0) {
    return {
      key: "outlinePlanning",
      label: "大纲规划",
      status: "blocked",
      detail: "当前还没有可执行的大纲章节，请先生成并确认大纲。",
    };
  }

  if (!selectedTitle && !workingTitle) {
    return {
      key: "outlinePlanning",
      label: "大纲规划",
      status: "warning",
      detail: "大纲已生成，但还没有确认标题，建议先确认标题后再发布。",
    };
  }

  return {
    key: "outlinePlanning",
    label: "大纲规划",
    status: "passed",
    detail: `已确认 ${outlineSections.length} 段结构${selectedTitle || workingTitle ? `，标题为「${selectedTitle || workingTitle}」。` : "。"}`
  };
}

function buildDeepWritingGuard(payload: Record<string, unknown> | null | undefined): PublishGuardCheck {
  if (!payload) {
    return {
      key: "deepWriting",
      label: "深度写作",
      status: "blocked",
      detail: "尚未生成深度写作执行卡，发布前应先完成写作执行规划。",
    };
  }

  const sectionBlueprint = Array.isArray(payload.sectionBlueprint)
    ? payload.sectionBlueprint.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const voiceChecklist = Array.isArray(payload.voiceChecklist)
    ? payload.voiceChecklist.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const selectedTitle = String(payload.selectedTitle || "").trim();

  if (sectionBlueprint.length === 0) {
    return {
      key: "deepWriting",
      label: "深度写作",
      status: "blocked",
      detail: "写作执行卡缺少章节推进计划，请先刷新深度写作阶段产物。",
    };
  }

  if (voiceChecklist.length === 0) {
    return {
      key: "deepWriting",
      label: "深度写作",
      status: "warning",
      detail: "写作执行卡缺少表达约束，建议重新生成以减少文风漂移。",
    };
  }

  return {
    key: "deepWriting",
    label: "深度写作",
    status: "passed",
    detail: `${selectedTitle ? `执行标题「${selectedTitle}」` : "执行卡"}已准备完成，含 ${sectionBlueprint.length} 段推进计划。`,
  };
}

function buildAlignmentGuard(payload: Record<string, unknown> | null | undefined): PublishGuardCheck {
  if (!payload) {
    return {
      key: "alignment",
      label: "人设与选题匹配",
      status: "warning",
      detail: "尚未基于事实核查结果校验人设与选题匹配度。",
    };
  }

  const personaAlignment = String(payload.personaAlignment || "").trim();
  const topicAlignment = String(payload.topicAlignment || "").trim();
  if (isAlignmentRisky(personaAlignment) || isAlignmentRisky(topicAlignment)) {
    return {
      key: "alignment",
      label: "人设与选题匹配",
      status: "blocked",
      detail: [personaAlignment, topicAlignment].filter(Boolean).join("；") || "当前正文与人设或选题存在明显偏移。",
    };
  }

  return {
    key: "alignment",
    label: "人设与选题匹配",
    status: "passed",
    detail: [personaAlignment, topicAlignment].filter(Boolean).join("；") || "正文与当前人设、选题基本一致。",
  };
}

function buildProsePolishGuard(payload: Record<string, unknown> | null | undefined): PublishGuardCheck {
  if (!payload) {
    return {
      key: "prosePolish",
      label: "文笔润色",
      status: "warning",
      detail: "尚未执行文笔润色，建议至少生成一版语言节奏建议后再发布。",
    };
  }

  const issues = Array.isArray(payload.issues)
    ? payload.issues.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const rewrittenLead = String(payload.rewrittenLead || "").trim();

  return {
    key: "prosePolish",
    label: "文笔润色",
    status: issues.length > 0 || rewrittenLead ? "passed" : "warning",
    detail:
      issues.length > 0 || rewrittenLead
        ? `已生成润色建议${issues.length > 0 ? `，包含 ${issues.length} 条问题定位` : ""}${rewrittenLead ? "，并给出首段改写。" : "。"}`
        : "润色阶段已运行，但还没有形成有效建议。",
  };
}

export async function evaluatePublishGuard(input: {
  documentId: number;
  userId: number;
  templateId?: string | null;
  wechatConnectionId?: number | null;
}) {
  const document = await getDocumentById(input.documentId, input.userId);
  if (!document) {
    throw new Error("文稿不存在");
  }

  const [outlineArtifact, deepWritingArtifact, factCheckArtifact, prosePolishArtifact, coverImage, template, connection] = await Promise.all([
    getDocumentStageArtifact(document.id, input.userId, "outlinePlanning"),
    getDocumentStageArtifact(document.id, input.userId, "deepWriting"),
    getDocumentStageArtifact(document.id, input.userId, "factCheck"),
    getDocumentStageArtifact(document.id, input.userId, "prosePolish"),
    getLatestCoverImage(input.userId, document.id),
    input.templateId ? getActiveTemplateById(input.templateId, input.userId) : Promise.resolve(null),
    input.wechatConnectionId ? getWechatConnectionRaw(input.wechatConnectionId, input.userId) : Promise.resolve(null),
  ]);

  const checks: PublishGuardCheck[] = [];

  checks.push({
    key: "content",
    label: "正文内容",
    status: document.markdown_content.trim().length >= 80 ? "passed" : "blocked",
    detail:
      document.markdown_content.trim().length >= 80
        ? "正文内容已满足发布基础长度。"
        : "正文过短或为空，请先完成正文写作后再发布。",
  });

  checks.push(buildOutlineGuard(outlineArtifact?.payload || null));
  checks.push(buildDeepWritingGuard(deepWritingArtifact?.payload || null));
  checks.push(buildFactCheckGuard(factCheckArtifact?.payload || null));
  checks.push(buildAlignmentGuard(factCheckArtifact?.payload || null));
  checks.push(buildProsePolishGuard(prosePolishArtifact?.payload || null));

  checks.push({
    key: "coverImage",
    label: "封面图",
    status: coverImage ? "passed" : "blocked",
    detail: coverImage ? "封面图已确定。" : "尚未确认封面图，请先完成封面图二选一。",
  });

  checks.push({
    key: "template",
    label: "排版模板",
    status: input.templateId && !template ? "blocked" : "passed",
    detail:
      input.templateId && !template
        ? "当前选择的模板不可用，请重新选择有效模板。"
        : input.templateId
          ? `模板 ${input.templateId} 可用于发布。`
          : "将使用默认微信渲染模板发布。",
  });

  checks.push({
    key: "wechatConnection",
    label: "公众号连接",
    status:
      input.wechatConnectionId == null
        ? "blocked"
        : !connection
          ? "blocked"
          : connection.status === "disabled" || connection.status === "invalid"
            ? "blocked"
            : connection.status === "expired"
              ? "warning"
              : "passed",
    detail:
      input.wechatConnectionId == null
        ? "尚未选择公众号连接。"
        : !connection
          ? "公众号连接不存在。"
          : connection.status === "disabled"
            ? "公众号连接已停用。"
            : connection.status === "invalid"
              ? "公众号连接校验失败，请重新配置凭证。"
              : connection.status === "expired"
                ? "公众号连接已过期，发布时会尝试自动刷新 token。"
                : "公众号连接可用于发布。",
  });

  const blockers = checks.filter((item) => item.status === "blocked").map((item) => `${item.label}：${item.detail}`);
  const warnings = checks.filter((item) => item.status === "warning").map((item) => `${item.label}：${item.detail}`);

  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings,
    checks,
  } satisfies PublishGuardResult;
}
