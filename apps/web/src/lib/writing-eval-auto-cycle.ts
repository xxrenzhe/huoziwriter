import { appendAuditLog } from "./audit";
import { autoManagePromptRollouts } from "./prompt-rollout";
import { autoProposeWritingEvalPromptCandidates } from "./prompt-candidates";
import { autoFillWritingEvalDatasets, autoCalibrateWritingEvalScoringProfile, autoResolveWritingEvalRuns } from "./writing-eval";
import { autoGovernWritingEvalRisks } from "./writing-eval-governance";
import { autoManageWritingAssetRollouts } from "./writing-rollout";

export async function autoOptimizeWritingEvalCycle(input?: {
  operatorUserId?: number | null;
  force?: boolean;
  autoFillLimit?: number;
  autoFillMaxImportsPerDataset?: number;
  autoGovernLimit?: number;
  autoGovernCooldownHours?: number;
  autoResolveLimit?: number;
  autoRolloutLimit?: number;
  autoRolloutCooldownHours?: number;
  promptRolloutLimit?: number;
  promptRolloutCooldownHours?: number;
  autoProposeLimit?: number;
  autoProposeCooldownHours?: number;
}) {
  const startedAt = new Date().toISOString();
  const force = Boolean(input?.force);

  const [autoFill, autoGovern, autoResolve, autoCalibrate, assetRollout, promptRollout, autoPropose] = await Promise.all([
    autoFillWritingEvalDatasets({
      force,
      limit: input?.autoFillLimit,
      maxImportsPerDataset: input?.autoFillMaxImportsPerDataset,
      operatorUserId: input?.operatorUserId ?? null,
    }),
    autoGovernWritingEvalRisks({
      triggerMode: "service_auto",
      operatorUserId: input?.operatorUserId ?? null,
      limit: input?.autoGovernLimit,
      cooldownHours: input?.autoGovernCooldownHours,
      dryRun: false,
    }),
    autoResolveWritingEvalRuns({
      operatorUserId: input?.operatorUserId ?? null,
      limit: input?.autoResolveLimit,
      dryRun: false,
    }),
    autoCalibrateWritingEvalScoringProfile({
      activate: true,
      force,
      createdBy: input?.operatorUserId ?? null,
    }),
    autoManageWritingAssetRollouts({
      force,
      limit: input?.autoRolloutLimit,
      cooldownHours: input?.autoRolloutCooldownHours,
    }),
    autoManagePromptRollouts({
      force,
      limit: input?.promptRolloutLimit,
      cooldownHours: input?.promptRolloutCooldownHours,
    }),
    autoProposeWritingEvalPromptCandidates({
      limit: input?.autoProposeLimit,
      cooldownHours: input?.autoProposeCooldownHours,
      operatorUserId: input?.operatorUserId ?? null,
    }),
  ]);

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    force,
    autoFill: {
      appliedCount: autoFill.appliedCount,
      createdCaseCount: autoFill.createdCaseCount,
      skippedCount: autoFill.skippedCount,
    },
    autoGovern: {
      executableCount: autoGovern.executableCount,
      successCount: autoGovern.successCount,
      failureCount: autoGovern.failureCount,
      skippedCount: autoGovern.skippedCount,
    },
    autoResolve: {
      scannedCount: autoResolve.scannedCount,
      resolvedCount: autoResolve.resolvedCount,
      keepCount: autoResolve.keepCount,
      discardCount: autoResolve.discardCount,
      failureCount: autoResolve.failureCount,
    },
    autoCalibrate: {
      action: autoCalibrate.action,
      profileCode: autoCalibrate.action === "created" ? (autoCalibrate.profile?.code ?? null) : null,
    },
    assetRollout: {
      scannedCount: assetRollout.scannedCount,
      appliedCount: assetRollout.appliedCount,
      noopCount: assetRollout.noopCount,
    },
    promptRollout: {
      scannedCount: Number(promptRollout.total ?? 0),
      appliedCount: Number(promptRollout.appliedCount ?? 0),
      noopCount: Math.max(0, Number(promptRollout.total ?? 0) - Number(promptRollout.appliedCount ?? 0)),
    },
    autoPropose: {
      createdCount: autoPropose.createdCount,
      skippedCount: autoPropose.skippedCount,
    },
  };

  await appendAuditLog({
    userId: input?.operatorUserId ?? null,
    action: "writing_eval_auto_optimize_cycle",
    targetType: "writing_eval_automation",
    payload: summary,
  });

  return {
    ...summary,
    totalActivityCount:
      autoFill.createdCaseCount
      + Number(autoGovern.successCount ?? 0)
      + autoResolve.resolvedCount
      + (autoCalibrate.action === "created" ? 1 : 0)
      + assetRollout.appliedCount
      + promptRollout.appliedCount
      + autoPropose.createdCount,
    autoFill,
    autoGovern,
    autoResolve,
    autoCalibrate,
    assetRollout,
    promptRollout,
    autoPropose,
  };
}
