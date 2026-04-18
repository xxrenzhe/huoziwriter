import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptCandidateVersionFromBase } from "@/lib/prompt-candidates";
import { updatePromptVersionRolloutConfig } from "@/lib/repositories";
import { createWritingEvalRun, discardWritingEvalRun, getWritingEvalRunDetail, promoteWritingEvalRun } from "@/lib/writing-eval";
import { upsertWritingAssetRollout, type WritingRolloutAssetType } from "@/lib/writing-rollout";

type WizardDecision = "keep" | "discard" | "none";

function normalizeDecision(value: unknown): WizardDecision {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "keep" || normalized === "discard") {
    return normalized;
  }
  return "none";
}

function normalizeAssetType(value: string) {
  if (["layout_strategy", "apply_command_template", "scoring_profile"].includes(value)) {
    return value as WritingRolloutAssetType;
  }
  return null;
}

function parsePromptRef(value: unknown) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) {
    throw new Error("Prompt 版本引用格式错误");
  }
  const [promptId, version] = trimmed.split("@", 2);
  if (!promptId || !version) {
    throw new Error("Prompt 版本引用格式错误");
  }
  return { promptId, version };
}

function isPromptBackedVersionType(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized === "prompt_version" || normalized === "fact_check" || normalized === "title_template" || normalized === "lead_template";
}

function normalizeRolloutPayload(body: Record<string, unknown>) {
  const hasRolloutConfig = [
    "rolloutObserveOnly",
    "rolloutPercentage",
    "rolloutPlanCodes",
    "autoMode",
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!hasRolloutConfig) {
    return null;
  }
  return {
    autoMode: String(body.autoMode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual",
    rolloutObserveOnly: Boolean(body.rolloutObserveOnly),
    rolloutPercentage: Math.max(0, Math.min(100, Math.round(Number(body.rolloutPercentage ?? 0)))),
    rolloutPlanCodes: Array.isArray(body.rolloutPlanCodes)
      ? body.rolloutPlanCodes.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireAdminAccess();
    const { id } = await context.params;
    const runId = Number(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const decision = normalizeDecision(body.decision);
    const continueOptimization = Boolean(body.continueOptimization);
    const approvalReason = String(body.reason || "").trim();
    const rolloutConfig = normalizeRolloutPayload(body);

    if (decision === "none" && !continueOptimization) {
      return fail("当前向导至少需要执行决议或继续优化中的一种动作", 400);
    }
    if (decision !== "keep" && rolloutConfig) {
      return fail("只有 keep 决议后才能配置灰度", 400);
    }

    const originalRun = await getWritingEvalRunDetail(runId);
    let runDetail = originalRun;
    let promotionTarget: Record<string, unknown> = {};

    if (decision === "keep") {
      const promoted = await promoteWritingEvalRun({
        runId,
        reason: approvalReason,
        operatorUserId: operator.userId,
      });
      runDetail = promoted.run;
      promotionTarget = {
        ...promotionTarget,
        ...Object.fromEntries(
          Object.entries(promoted).filter(([key]) => key !== "run"),
        ),
      };
    } else if (decision === "discard") {
      runDetail = await discardWritingEvalRun({
        runId,
        reason: approvalReason,
        operatorUserId: operator.userId,
      });
    }

    if (rolloutConfig) {
      const postDecisionOps = runDetail.postDecisionOps;
      if (!postDecisionOps || postDecisionOps.rolloutKind === "unsupported") {
        return fail("已完成决议，但当前对象不支持直接配置灰度", 400);
      }
      if (postDecisionOps.rolloutKind === "prompt") {
        const promptRef = parsePromptRef(postDecisionOps.focusVersionRef);
        await updatePromptVersionRolloutConfig({
          promptId: promptRef.promptId,
          version: promptRef.version,
          autoMode: rolloutConfig.autoMode,
          rolloutObserveOnly: rolloutConfig.rolloutObserveOnly,
          rolloutPercentage: rolloutConfig.rolloutPercentage,
          rolloutPlanCodes: rolloutConfig.rolloutPlanCodes,
        });
      } else {
        const assetType = normalizeAssetType(postDecisionOps.focusVersionType);
        if (!assetType) {
          return fail("当前对象不支持直接配置灰度", 400);
        }
        await upsertWritingAssetRollout({
          assetType,
          assetRef: postDecisionOps.focusVersionRef,
          autoMode: rolloutConfig.autoMode,
          rolloutObserveOnly: rolloutConfig.rolloutObserveOnly,
          rolloutPercentage: rolloutConfig.rolloutPercentage,
          rolloutPlanCodes: rolloutConfig.rolloutPlanCodes,
          isEnabled: rolloutConfig.rolloutObserveOnly || rolloutConfig.rolloutPercentage > 0 || rolloutConfig.rolloutPlanCodes.length > 0,
          notes: null,
          operatorUserId: operator.userId,
        });
      }
      runDetail = await getWritingEvalRunDetail(runId);
    }

    let candidate: Awaited<ReturnType<typeof createPromptCandidateVersionFromBase>> | null = null;
    let nextRun: Awaited<ReturnType<typeof createWritingEvalRun>> | null = null;
    let sourceRefForNextRun: string | null = null;

    if (continueOptimization) {
      if (!isPromptBackedVersionType(runDetail.baseVersionType) || runDetail.baseVersionType !== runDetail.candidateVersionType) {
        return fail("当前实验不是同类型的 Prompt/模板版本对比，无法直接继续优化下一轮", 400);
      }
      sourceRefForNextRun =
        decision === "keep"
          ? runDetail.candidateVersionRef
          : decision === "discard"
            ? runDetail.baseVersionRef
            : runDetail.recommendation === "keep"
              ? runDetail.candidateVersionRef
              : runDetail.baseVersionRef;
      const { promptId, version } = parsePromptRef(sourceRefForNextRun);
      candidate = await createPromptCandidateVersionFromBase({
        promptId,
        baseVersion: version,
        versionType: runDetail.baseVersionType,
        experimentMode: String(body.experimentMode || "").trim() || runDetail.experimentMode,
        optimizationGoal: String(body.optimizationGoal || "").trim() || null,
        candidateVersion: String(body.candidateVersion || "").trim() || null,
        operatorUserId: operator.userId,
      });
      nextRun = await createWritingEvalRun({
        datasetId: runDetail.datasetId,
        baseVersionType: runDetail.baseVersionType,
        baseVersionRef: sourceRefForNextRun,
        candidateVersionType: runDetail.baseVersionType,
        candidateVersionRef: candidate.promptVersionRef,
        experimentMode: String(body.experimentMode || "").trim() || runDetail.experimentMode,
        triggerMode: String(body.triggerMode || "").trim() || "manual",
        decisionMode: String(body.decisionMode || "").trim() || "manual_review",
        summary:
          String(body.summary || "").trim()
          || [
            `${decision === "keep" ? "keep" : decision === "discard" ? "discard" : "fork"} from ${runDetail.runCode}`,
            `source:${sourceRefForNextRun}`,
            approvalReason || runDetail.recommendationReason || "",
          ]
            .filter(Boolean)
            .join(" · "),
        createdBy: operator.userId,
      });
    }

    const messages: string[] = [];
    if (decision === "keep") {
      if (rolloutConfig) {
        messages.push(
          rolloutConfig.rolloutObserveOnly
            ? "已 keep 并切到观察流量"
            : rolloutConfig.rolloutPercentage > 0
              ? `已 keep 并设置 ${rolloutConfig.rolloutPercentage}% 灰度`
              : "已 keep 并保存灰度配置",
        );
      } else {
        messages.push("已 keep 当前候选");
      }
    } else if (decision === "discard") {
      messages.push("已记录 discard 决议");
    }
    if (candidate && nextRun) {
      messages.push(`已基于 ${sourceRefForNextRun} 继续生成候选 ${candidate.promptVersionRef} 并创建实验 ${nextRun.runCode}`);
    }

    return ok({
      ...promotionTarget,
      decision,
      run: runDetail,
      rolloutApplied: Boolean(rolloutConfig),
      continueOptimizationApplied: Boolean(candidate && nextRun),
      candidate,
      nextRun,
      sourceRefForNextRun,
      message: messages.join("；"),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "执行实验决议向导失败", 400);
  }
}
