import { extractJsonObject, generateSceneText } from "@/lib/ai-gateway";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { createPromptVersion, getPromptDetail } from "@/lib/repositories";
import { createWritingEvalRun, getWritingEvalRuns } from "@/lib/writing-eval";

const AUTO_PROPOSAL_SIGNAL_DEFINITIONS = [
  { label: "写作风格", deltaKey: "deltaStyleScore" },
  { label: "语言自然度", deltaKey: "deltaLanguageScore" },
  { label: "信息密度", deltaKey: "deltaDensityScore" },
  { label: "情绪推进", deltaKey: "deltaEmotionScore" },
  { label: "结构完成度", deltaKey: "deltaStructureScore" },
  { label: "标题点击力", deltaKey: "deltaHeadlineScore" },
  { label: "开头留存力", deltaKey: "deltaHookScore" },
  { label: "社交传播性", deltaKey: "deltaShareabilityScore" },
  { label: "读者收益感", deltaKey: "deltaReaderValueScore" },
] as const;

const AUTO_PROPOSAL_POSITIVE_SIGNAL_THRESHOLD = 0.5;
const AUTO_PROPOSAL_NEGATIVE_SIGNAL_THRESHOLD = -0.35;

function buildCandidateVersion(baseVersion: string, existingVersions: string[], requestedVersion?: string) {
  const normalizedRequested = String(requestedVersion || "").trim();
  if (normalizedRequested) {
    if (existingVersions.includes(normalizedRequested)) {
      throw new Error("候选版本号已存在");
    }
    return normalizedRequested;
  }
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const base = `${baseVersion}-ai-${stamp}`;
  if (!existingVersions.includes(base)) {
    return base;
  }
  let counter = 2;
  while (existingVersions.includes(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function isPromptBackedVersionType(versionType: string) {
  return versionType === "prompt_version"
    || versionType === "fact_check"
    || versionType === "title_template"
    || versionType === "lead_template";
}

function getExpectedPromptIdForVersionType(versionType: string) {
  if (versionType === "fact_check") return "fact_check";
  if (versionType === "title_template") return "title_optimizer";
  if (versionType === "lead_template") return "prose_polish";
  return null;
}

function parsePromptVersionRef(value: string) {
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

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDelta(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function buildPromptBackedContextTag(versionType: string, experimentMode: string) {
  if (versionType === "fact_check") return "事实核查 Prompt";
  if (versionType === "title_template" || experimentMode === "title_only") return "标题模板 Prompt";
  if (versionType === "lead_template" || experimentMode === "lead_only") return "开头模板 Prompt";
  return "正文 Prompt";
}

function getRunSignalHighlights(scoreSummary: Record<string, unknown>, threshold = AUTO_PROPOSAL_POSITIVE_SIGNAL_THRESHOLD, limit = 3) {
  return AUTO_PROPOSAL_SIGNAL_DEFINITIONS
    .map((item) => ({
      label: item.label,
      delta: getNumber(scoreSummary[item.deltaKey]) ?? 0,
    }))
    .filter((item) => item.delta >= threshold)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, limit)
    .map((item) => `${item.label}${formatDelta(item.delta)}`);
}

function getRunSignalRegressions(scoreSummary: Record<string, unknown>, threshold = AUTO_PROPOSAL_NEGATIVE_SIGNAL_THRESHOLD, limit = 3) {
  return AUTO_PROPOSAL_SIGNAL_DEFINITIONS
    .map((item) => ({
      label: item.label,
      delta: getNumber(scoreSummary[item.deltaKey]) ?? 0,
    }))
    .filter((item) => item.delta <= threshold)
    .sort((left, right) => left.delta - right.delta)
    .slice(0, limit)
    .map((item) => `${item.label}${formatDelta(item.delta)}`);
}

function getAutoProposalSourcePlan(run: Awaited<ReturnType<typeof getWritingEvalRuns>>[number]) {
  const scoreSummary = run.scoreSummary ?? {};
  const deltaTotal = getNumber(scoreSummary.deltaTotalScore) ?? 0;
  const failedCaseCount = getNumber(scoreSummary.failedCaseCount) ?? 0;
  const factualRiskPenalty = getNumber(scoreSummary.factualRiskPenalty) ?? 0;
  const baseFactualRiskPenalty = getNumber(scoreSummary.baseFactualRiskPenalty) ?? factualRiskPenalty;
  const aiNoisePenalty = getNumber(scoreSummary.aiNoisePenalty) ?? 0;
  const baseAiNoisePenalty = getNumber(scoreSummary.baseAiNoisePenalty) ?? aiNoisePenalty;
  const riskStable = factualRiskPenalty <= baseFactualRiskPenalty && aiNoisePenalty <= baseAiNoisePenalty;

  if (run.resolutionStatus === "keep") {
    return {
      sourceRef: run.candidateVersionRef,
      sourceReason: "resolved_keep_candidate",
      sourceDecisionLabel: "已 keep，继续沿候选版本迭代",
    };
  }
  if (run.resolutionStatus === "discard" || run.resolutionStatus === "rollback") {
    return {
      sourceRef: run.baseVersionRef,
      sourceReason: run.resolutionStatus === "rollback" ? "resolved_rollback_base" : "resolved_discard_base",
      sourceDecisionLabel: run.resolutionStatus === "rollback" ? "已 rollback，回到基线继续迭代" : "已 discard，回到基线继续迭代",
    };
  }
  if (
    run.resolutionStatus === "pending"
    && run.recommendation === "keep"
    && deltaTotal >= 3
    && failedCaseCount === 0
    && riskStable
  ) {
    return {
      sourceRef: run.candidateVersionRef,
      sourceReason: "pending_keep_recommendation_candidate",
      sourceDecisionLabel: "待人工审核，但 keep 信号足够强，提前沿候选版本继续提案",
    };
  }
  return null;
}

function buildAutoProposalScopeKey(input: {
  datasetId: number;
  sourceRef: string;
  versionType: string;
  experimentMode: string;
  sourceScheduleId?: number | null;
}) {
  return [
    String(input.datasetId),
    input.versionType,
    input.experimentMode,
    String(input.sourceScheduleId ?? 0),
    input.sourceRef,
  ].join("@@");
}

function getAutoProposalOpportunityScore(run: Awaited<ReturnType<typeof getWritingEvalRuns>>[number]) {
  const scoreSummary = run.scoreSummary ?? {};
  const deltaTotal = getNumber(scoreSummary.deltaTotalScore) ?? 0;
  const deltaQuality = getNumber(scoreSummary.deltaQualityScore) ?? 0;
  const deltaViral = getNumber(scoreSummary.deltaViralScore) ?? 0;
  const improvedCaseCount = getNumber(scoreSummary.improvedCaseCount) ?? 0;
  const regressedCaseCount = getNumber(scoreSummary.regressedCaseCount) ?? 0;
  const failedCaseCount = getNumber(scoreSummary.failedCaseCount) ?? 0;
  const factualRiskPenalty = getNumber(scoreSummary.factualRiskPenalty) ?? 0;
  const baseFactualRiskPenalty = getNumber(scoreSummary.baseFactualRiskPenalty) ?? factualRiskPenalty;
  const aiNoisePenalty = getNumber(scoreSummary.aiNoisePenalty) ?? 0;
  const baseAiNoisePenalty = getNumber(scoreSummary.baseAiNoisePenalty) ?? aiNoisePenalty;
  const highlights = getRunSignalHighlights(scoreSummary, AUTO_PROPOSAL_POSITIVE_SIGNAL_THRESHOLD, 4);
  const regressions = getRunSignalRegressions(scoreSummary, AUTO_PROPOSAL_NEGATIVE_SIGNAL_THRESHOLD, 4);

  let score = 0;
  if (run.resolutionStatus === "keep") score += 18;
  else if (run.resolutionStatus === "discard") score += 10;
  else if (run.resolutionStatus === "rollback") score += 8;
  else if (run.resolutionStatus === "pending" && run.recommendation === "keep") score += 7;
  score += Math.max(-8, Math.min(18, deltaTotal * 2.5));
  score += Math.max(-5, Math.min(8, deltaQuality * 1.4));
  score += Math.max(-5, Math.min(8, deltaViral * 1.4));
  score += Math.max(-4, Math.min(6, (improvedCaseCount - regressedCaseCount) * 0.8));
  score += highlights.length * 1.5;
  score -= regressions.length * 2;
  score -= failedCaseCount * 2.5;
  if (factualRiskPenalty > baseFactualRiskPenalty) score -= 5;
  if (aiNoisePenalty > baseAiNoisePenalty) score -= 4;
  if (run.sourceScheduleId) score += 2;
  return score;
}

function buildAutoProposalOptimizationGoal(run: Awaited<ReturnType<typeof getWritingEvalRuns>>[number], sourceDecisionLabel: string) {
  const scoreSummary = run.scoreSummary ?? {};
  const contextTag = buildPromptBackedContextTag(run.baseVersionType, run.experimentMode);
  const deltaTotal = getNumber(scoreSummary.deltaTotalScore);
  const highlights = getRunSignalHighlights(scoreSummary);
  const regressions = getRunSignalRegressions(scoreSummary);
  const focus =
    run.baseVersionType === "fact_check"
      ? "重点提升事实边界、证据绑定、风险措辞和结论克制，不要让事实核查段变成模板化复述。"
      : run.baseVersionType === "title_template"
        ? "重点优化标题张力、兑现度和传播性，避免标题更强但正文兑现更弱。"
        : run.baseVersionType === "lead_template" || run.experimentMode === "lead_only"
          ? "重点优化开头前 3 段的压强、冲突建立和承接密度，避免开头更猛但后文掉速。"
          : "重点优化正文 Prompt 的风格稳定性、信息密度、结构推进和传播表现。";

  return [
    `基于实验 ${run.runCode} 的结果继续优化 ${contextTag}。`,
    `当前来源判断：${sourceDecisionLabel}。`,
    deltaTotal !== null ? `上一轮总分 Delta ${formatDelta(deltaTotal)}。` : null,
    highlights.length ? `优先保留已验证有效的增益：${highlights.join("、")}。` : null,
    regressions.length ? `下一轮重点修正：${regressions.join("、")}。` : null,
    run.recommendationReason || null,
    focus,
    "要求延续已有输出契约，优先做小步、可归因、可回滚的 Prompt 调整，不自动 keep/discard。",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRunContextText(
  promptId: string,
  runs: Awaited<ReturnType<typeof getWritingEvalRuns>>,
  input?: { versionType?: string | null; experimentMode?: string | null },
) {
  const relatedRuns = runs
    .filter(
      (run) =>
        (!input?.versionType || run.baseVersionType === input.versionType || run.candidateVersionType === input.versionType)
        && (!input?.experimentMode || run.experimentMode === input.experimentMode)
        && (
        (
          isPromptBackedVersionType(run.baseVersionType)
          && run.baseVersionRef.startsWith(`${promptId}@`)
        ) ||
        (
          isPromptBackedVersionType(run.candidateVersionType)
          && run.candidateVersionRef.startsWith(`${promptId}@`)
        )
        ),
    )
    .slice(0, 4);
  if (relatedRuns.length === 0) {
    return "暂无与该 Prompt 相关的写作评测运行记录。";
  }
  return relatedRuns
    .map((run, index) => {
      const total = typeof run.scoreSummary.totalScore === "number" ? run.scoreSummary.totalScore.toFixed(2) : "--";
      const delta = typeof run.scoreSummary.deltaTotalScore === "number" ? run.scoreSummary.deltaTotalScore.toFixed(2) : "--";
      return [
        `${index + 1}. ${run.runCode}`,
        `状态 ${run.status}`,
        `基线 ${run.baseVersionRef}`,
        `候选 ${run.candidateVersionRef}`,
        `总分 ${total}`,
        `Delta ${delta}`,
        `建议 ${run.recommendation}`,
        run.recommendationReason ? `原因 ${run.recommendationReason}` : null,
      ]
        .filter(Boolean)
        .join("；");
    })
    .join("\n");
}

export async function createPromptCandidateVersionFromBase(input: {
  promptId: string;
  baseVersion: string;
  versionType?: string | null;
  experimentMode?: string | null;
  optimizationGoal?: string | null;
  candidateVersion?: string | null;
  operatorUserId?: number | null;
}) {
  const promptId = String(input.promptId || "").trim();
  const baseVersion = String(input.baseVersion || "").trim();
  const versionType = String(input.versionType || "").trim() || "prompt_version";
  const expectedPromptId = getExpectedPromptIdForVersionType(versionType);
  const optimizationGoal =
    String(input.optimizationGoal || "").trim() ||
    "提升写作风格稳定性、语言自然度、信息密度、情绪推进和标题兑现度，同时避免机器腔与事实边界退化。";
  if (!promptId || !baseVersion) {
    throw new Error("Prompt 对象和基线版本不能为空");
  }
  if (expectedPromptId && promptId !== expectedPromptId) {
    throw new Error(`${versionType} 的 Prompt 对象必须是 ${expectedPromptId}`);
  }

  const [versions, writingEvalRuns] = await Promise.all([getPromptDetail(promptId), getWritingEvalRuns()]);
  const basePrompt = versions.find((item) => item.version === baseVersion) ?? null;
  if (!basePrompt) {
    throw new Error("基线 Prompt 版本不存在");
  }
  const promptContextTag = buildPromptBackedContextTag(versionType, String(input.experimentMode || "").trim());

  const systemPrompt = [
    "你是中文写作系统的 Prompt 优化研究员。",
    "你的任务是基于一个已有 Prompt 版本，生成一个更强但仍然可控的候选版本。",
    `当前优化对象：${promptContextTag}。`,
    "禁止改坏输出契约、变量占位符、事实边界、格式要求和安全限制。",
    "优先做小步、可归因、可回滚的修改，不要整体改写成另一套风格。",
    "返回 JSON，不要解释，不要 markdown 代码块。",
  ].join("\n");
  const userPrompt = [
    '字段：{"promptContent":"字符串","changeSummary":[""],"riskChecks":[""]}',
    "changeSummary 返回 3-6 条，说明这版候选 Prompt 做了哪些可归因修改。",
    "riskChecks 返回 2-4 条，说明上线前应重点观察什么风险。",
    "promptContent 必须返回完整 Prompt 内容，而不是 diff。",
    `Prompt 对象：${promptId}`,
    `基线版本：${baseVersion}`,
    `优化对象类型：${versionType}`,
    input.experimentMode ? `实验模式：${input.experimentMode}` : null,
    `优化目标：${optimizationGoal}`,
    "最近相关写作评测运行：",
    buildRunContextText(promptId, writingEvalRuns, {
      versionType,
      experimentMode: input.experimentMode ?? null,
    }),
    "当前基线 Prompt：",
    basePrompt.prompt_content,
  ]
    .filter(Boolean)
    .join("\n\n");

  const generated = await generateSceneText({
    sceneCode: "deepWrite",
    systemPrompt,
    userPrompt,
    temperature: 0.35,
  });
  const parsed = extractJsonObject(generated.text) as {
    promptContent?: unknown;
    changeSummary?: unknown;
    riskChecks?: unknown;
  };
  const promptContent = String(parsed.promptContent || "").trim();
  if (!promptContent) {
    throw new Error("AI 未返回有效的候选 Prompt 内容");
  }
  const changeSummary = Array.isArray(parsed.changeSummary)
    ? parsed.changeSummary.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const riskChecks = Array.isArray(parsed.riskChecks)
    ? parsed.riskChecks.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const nextVersion = buildCandidateVersion(
    baseVersion,
    versions.map((item) => item.version),
    input.candidateVersion ?? undefined,
  );

  await createPromptVersion({
    promptId: basePrompt.prompt_id,
    version: nextVersion,
    category: basePrompt.category,
    name: basePrompt.name,
    description: basePrompt.description,
    filePath: basePrompt.file_path,
    functionName: basePrompt.function_name,
    promptContent,
    language: basePrompt.language || "zh-CN",
    isActive: false,
    changeNotes: [
      `AI candidate from ${baseVersion}`,
      `goal: ${optimizationGoal}`,
      changeSummary.length ? `changes: ${changeSummary.join("；")}` : null,
      riskChecks.length ? `risk-checks: ${riskChecks.join("；")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    autoMode: "recommendation",
    rolloutObserveOnly: false,
    rolloutPercentage: 0,
    rolloutPlanCodes: [],
    createdBy: input.operatorUserId ?? null,
  });

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "prompt_version_candidate_create",
    targetType: versionType,
    targetId: basePrompt.id,
    payload: {
      promptId,
      baseVersion,
      versionType,
      experimentMode: input.experimentMode ?? null,
      candidateVersion: nextVersion,
      optimizationGoal,
      changeSummary,
      riskChecks,
      model: generated.model,
      provider: generated.provider,
    },
  });

  return {
    created: true,
    promptId: basePrompt.prompt_id,
    baseVersion,
    version: nextVersion,
    promptVersionRef: `${basePrompt.prompt_id}@${nextVersion}`,
    changeSummary,
    riskChecks,
    model: generated.model,
    provider: generated.provider,
  };
}

export async function autoProposeWritingEvalPromptCandidates(input: {
  limit?: number;
  cooldownHours?: number;
  operatorUserId?: number | null;
} = {}) {
  const limit = Math.min(Math.max(Math.round(Number(input.limit ?? 2)) || 2, 1), 8);
  const cooldownHours = Math.min(Math.max(Number(input.cooldownHours ?? 12) || 12, 1), 24 * 14);
  const cooldownCutoff = Date.now() - cooldownHours * 60 * 60 * 1000;
  const db = getDatabase();
  const runs = await getWritingEvalRuns();
  const recentAuditRows = await db.query<{ target_id: string | null; payload_json: string | Record<string, unknown> | null; created_at: string }>(
    `SELECT target_id, payload_json, created_at
     FROM audit_logs
     WHERE action = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 120`,
    ["writing_eval_auto_candidate_create"],
  );
  const recentAutoProposalKeys = new Set(
    recentAuditRows
      .filter((row) => new Date(row.created_at).getTime() >= cooldownCutoff)
      .map((row) => {
        const payload = row.payload_json && typeof row.payload_json === "string"
          ? (() => {
            try {
              return JSON.parse(row.payload_json) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
          : (row.payload_json as Record<string, unknown> | null) ?? {};
        const datasetId = Number(payload.datasetId);
        const sourceRef = String(payload.sourceRef || "").trim();
        const versionType = String(payload.versionType || "").trim();
        const experimentMode = String(payload.experimentMode || "").trim();
        const sourceScheduleId = Number(payload.sourceScheduleId);
        return Number.isInteger(datasetId) && datasetId > 0 && sourceRef && versionType && experimentMode
          ? buildAutoProposalScopeKey({
            datasetId,
            sourceRef,
            versionType,
            experimentMode,
            sourceScheduleId: Number.isInteger(sourceScheduleId) && sourceScheduleId > 0 ? sourceScheduleId : null,
          })
          : null;
      })
      .filter((item): item is string => Boolean(item)),
  );

  const createdItems: Array<{
    datasetId: number;
    sourceRunId: number;
    sourceRunCode: string;
    sourceRef: string;
    candidateRef: string;
    runId: number;
    runCode: string;
    experimentMode: string;
    versionType: string;
  }> = [];
  const skipped: Array<{ runId: number; runCode: string; reason: string }> = [];

  const rankedRuns = runs
    .filter((run) => run.status === "succeeded")
    .filter((run) => isPromptBackedVersionType(run.baseVersionType) && run.baseVersionType === run.candidateVersionType)
    .map((run) => {
      const sourcePlan = getAutoProposalSourcePlan(run);
      return {
        run,
        sourcePlan,
        opportunityScore: sourcePlan ? getAutoProposalOpportunityScore(run) : Number.NEGATIVE_INFINITY,
      };
    })
    .filter((item) => item.sourcePlan)
    .sort((left, right) => {
      if (right.opportunityScore !== left.opportunityScore) return right.opportunityScore - left.opportunityScore;
      return new Date(right.run.createdAt).getTime() - new Date(left.run.createdAt).getTime();
    });

  for (const item of rankedRuns) {
    if (createdItems.length >= limit) break;
    const run = item.run;
    const sourcePlan = item.sourcePlan;
    if (!sourcePlan) continue;
    const sourceRef = sourcePlan.sourceRef;
    if (!sourceRef) {
      skipped.push({ runId: run.id, runCode: run.runCode, reason: "缺少可复用的源版本引用" });
      continue;
    }
    const autoProposalKey = buildAutoProposalScopeKey({
      datasetId: run.datasetId,
      sourceRef,
      versionType: run.baseVersionType,
      experimentMode: run.experimentMode,
      sourceScheduleId: run.sourceScheduleId,
    });
    if (recentAutoProposalKeys.has(autoProposalKey)) {
      skipped.push({ runId: run.id, runCode: run.runCode, reason: "冷却窗口内已经为该源版本生成过自动候选" });
      continue;
    }
    const hasNewerIteration = runs.some((item) =>
      item.id !== run.id
      && item.datasetId === run.datasetId
      && item.baseVersionType === run.baseVersionType
      && item.experimentMode === run.experimentMode
      && (item.sourceScheduleId ?? null) === (run.sourceScheduleId ?? null)
      && item.baseVersionRef === sourceRef
      && new Date(item.createdAt).getTime() > new Date(run.createdAt).getTime(),
    );
    if (hasNewerIteration) {
      skipped.push({ runId: run.id, runCode: run.runCode, reason: "该源版本之后已经存在更新的迭代实验" });
      continue;
    }

    const { promptId, version } = parsePromptVersionRef(sourceRef);
    const candidate = await createPromptCandidateVersionFromBase({
      promptId,
      baseVersion: version,
      versionType: run.baseVersionType,
      experimentMode: run.experimentMode,
      optimizationGoal: buildAutoProposalOptimizationGoal(run, sourcePlan.sourceDecisionLabel),
      operatorUserId: input.operatorUserId ?? null,
    });
    const nextRun = await createWritingEvalRun({
      datasetId: run.datasetId,
      sourceScheduleId: run.sourceScheduleId ?? null,
      baseVersionType: run.baseVersionType,
      baseVersionRef: sourceRef,
      candidateVersionType: run.baseVersionType,
      candidateVersionRef: candidate.promptVersionRef,
      experimentMode: run.experimentMode,
      triggerMode: "agent",
      decisionMode: "manual_review",
      summary: [
        `auto-proposed from ${run.runCode}`,
        `sourceReason:${sourcePlan.sourceReason}`,
        `source:${sourceRef}`,
      ].join("\n"),
      createdBy: input.operatorUserId ?? null,
    });
    createdItems.push({
      datasetId: run.datasetId,
      sourceRunId: run.id,
      sourceRunCode: run.runCode,
      sourceRef,
      candidateRef: candidate.promptVersionRef,
      runId: nextRun.id,
      runCode: nextRun.runCode,
      experimentMode: run.experimentMode,
      versionType: run.baseVersionType,
    });
    recentAutoProposalKeys.add(autoProposalKey);
    await appendAuditLog({
      userId: input.operatorUserId ?? null,
      action: "writing_eval_auto_candidate_create",
      targetType: "writing_optimization_run",
      targetId: run.id,
      payload: {
        datasetId: run.datasetId,
      sourceRunCode: run.runCode,
      sourceRunId: run.id,
      sourceRef,
      sourceReason: sourcePlan.sourceReason,
      sourceScheduleId: run.sourceScheduleId ?? null,
      candidateRef: candidate.promptVersionRef,
      nextRunId: nextRun.id,
      nextRunCode: nextRun.runCode,
      experimentMode: run.experimentMode,
      versionType: run.baseVersionType,
      opportunityScore: item.opportunityScore,
    },
  });
  }

  return {
    limit,
    cooldownHours,
    createdCount: createdItems.length,
    items: createdItems,
    skippedCount: skipped.length,
    skipped,
  };
}
