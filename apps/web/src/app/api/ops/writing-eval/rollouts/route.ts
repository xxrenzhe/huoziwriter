import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updatePromptVersionRolloutConfig } from "@/lib/repositories";
import { getWritingAssetRollout, listWritingAssetRollouts, upsertWritingAssetRollout, type WritingRolloutAssetType } from "@/lib/writing-rollout";

function normalizeAssetType(value: string) {
  return ["layout_strategy", "apply_command_template", "scoring_profile"].includes(value) ? (value as WritingRolloutAssetType) : null;
}

function parsePromptRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) {
    return null;
  }
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

export async function GET(request: Request) {
  try {
    await requireOpsAccess();
    const { searchParams } = new URL(request.url);
    const assetType = normalizeAssetType(String(searchParams.get("assetType") || "").trim());
    const assetRef = String(searchParams.get("assetRef") || "").trim();
    if (assetType && assetRef) {
      const rollout = await getWritingAssetRollout(assetType, assetRef);
      return ok(
        rollout
          ? {
              ...rollout,
              rolloutObserveOnly: rollout.rolloutObserveOnly,
            }
          : null,
      );
    }
    const rollouts = await listWritingAssetRollouts();
    return ok(
      rollouts.map((rollout) => ({
        ...rollout,
        rolloutObserveOnly: rollout.rolloutObserveOnly,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireOpsAccess();
    const body = await request.json();
    const requestedType = String(body.assetType || "").trim();
    if (requestedType === "prompt_version") {
      const promptRef = parsePromptRef(String(body.assetRef || "").trim());
      if (!promptRef) {
        return fail("Prompt 版本引用无效", 400);
      }
      const isEnabled = Boolean(body.isEnabled);
      const rolloutPlanCodes = isEnabled && Array.isArray(body.rolloutPlanCodes) ? body.rolloutPlanCodes : [];
      const rolloutObserveOnly = isEnabled ? Boolean(body.rolloutObserveOnly) : false;
      const rolloutPercentage = isEnabled ? Number(body.rolloutPercentage ?? 0) : 0;
      await updatePromptVersionRolloutConfig({
        promptId: promptRef.promptId,
        version: promptRef.version,
        autoMode: body.autoMode,
        rolloutObserveOnly,
        rolloutPercentage,
        rolloutPlanCodes,
      });
      return ok({
        assetType: "prompt_version",
        assetRef: `${promptRef.promptId}@${promptRef.version}`,
        autoMode: String(body.autoMode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual",
        rolloutObserveOnly,
        rolloutPercentage: Math.max(0, Math.min(100, Math.round(Number(rolloutPercentage || 0)))),
        rolloutPlanCodes,
        isEnabled: rolloutObserveOnly || rolloutPercentage > 0 || rolloutPlanCodes.length > 0,
        notes: null,
        stats: null,
      });
    }
    const assetType = normalizeAssetType(requestedType);
    if (!assetType) {
      return fail("灰度对象类型无效", 400);
    }
    const rollout = await upsertWritingAssetRollout({
      assetType,
      assetRef: body.assetRef,
      autoMode: body.autoMode,
      rolloutObserveOnly: body.rolloutObserveOnly,
      rolloutPercentage: body.rolloutPercentage,
      rolloutPlanCodes: Array.isArray(body.rolloutPlanCodes) ? body.rolloutPlanCodes : [],
      isEnabled: body.isEnabled,
      notes: body.notes,
      operatorUserId: operator.userId,
    });
    return ok({
      ...rollout,
      rolloutObserveOnly: rollout?.rolloutObserveOnly ?? false,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保存灰度配置失败", 400);
  }
}
