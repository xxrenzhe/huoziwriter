import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updatePromptVersionRolloutConfig } from "@/lib/repositories";
import { promoteWritingEvalRun } from "@/lib/writing-eval";
import { upsertWritingAssetRollout, type WritingRolloutAssetType } from "@/lib/writing-rollout";

function normalizeAssetType(value: string) {
  if (["layout_strategy", "apply_command_template", "scoring_profile"].includes(value)) {
    return value as WritingRolloutAssetType;
  }
  return null;
}

function parsePromptRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireAdminAccess();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const rolloutObserveOnly = Boolean(body?.rolloutObserveOnly);
    const rolloutPercentage = Math.max(0, Math.min(100, Math.round(Number(body?.rolloutPercentage ?? 0))));
    const autoMode = String(body?.autoMode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual";
    const rolloutPlanCodes = Array.isArray(body?.rolloutPlanCodes) ? body.rolloutPlanCodes.filter((item: unknown) => typeof item === "string") : [];
    const promoted = await promoteWritingEvalRun({
      runId: Number(id),
      reason: body?.reason,
      operatorUserId: operator.userId,
    });
    const postDecisionOps = promoted.run?.postDecisionOps;
    if (!postDecisionOps || postDecisionOps.rolloutKind === "unsupported") {
      return ok({
        ...promoted,
        rolloutApplied: false,
        message: "已 keep，但当前对象不支持直接配置灰度",
      });
    }

    if (postDecisionOps.rolloutKind === "prompt") {
      const promptRef = parsePromptRef(postDecisionOps.focusVersionRef);
      if (!promptRef) {
        return fail("Prompt 版本引用无效", 400);
      }
      await updatePromptVersionRolloutConfig({
        promptId: promptRef.promptId,
        version: promptRef.version,
        autoMode,
        rolloutObserveOnly,
        rolloutPercentage,
        rolloutPlanCodes,
      });
    } else {
      const assetType = normalizeAssetType(postDecisionOps.focusVersionType);
      if (!assetType) {
        return fail("当前对象不支持直接配置灰度", 400);
      }
      await upsertWritingAssetRollout({
        assetType,
        assetRef: postDecisionOps.focusVersionRef,
        autoMode,
        rolloutObserveOnly,
        rolloutPercentage,
        rolloutPlanCodes,
        isEnabled: rolloutObserveOnly || rolloutPercentage > 0 || rolloutPlanCodes.length > 0,
        notes: null,
        operatorUserId: operator.userId,
      });
    }

    return ok({
      ...promoted,
      rolloutApplied: true,
      rolloutConfig: {
        autoMode,
        rolloutObserveOnly,
        rolloutPercentage,
        rolloutPlanCodes,
      },
      message:
        rolloutObserveOnly
          ? "已 keep 并切到观察流量"
          : rolloutPercentage > 0
            ? `已 keep 并设置 ${rolloutPercentage}% 灰度`
            : "已 keep 并保存灰度配置",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保留并配置灰度失败", 400);
  }
}
