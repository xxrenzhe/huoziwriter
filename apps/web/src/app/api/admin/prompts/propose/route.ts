import { extractJsonObject, generateSceneText } from "@/lib/ai-gateway";
import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptVersion, getPromptDetail } from "@/lib/repositories";
import { getWritingEvalRuns } from "@/lib/writing-eval";

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

function buildRunContextText(promptId: string, runs: Awaited<ReturnType<typeof getWritingEvalRuns>>) {
  const relatedRuns = runs
    .filter(
      (run) =>
        (run.baseVersionType === "prompt_version" && run.baseVersionRef.startsWith(`${promptId}@`)) ||
        (run.candidateVersionType === "prompt_version" && run.candidateVersionRef.startsWith(`${promptId}@`)),
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

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json();
    const promptId = String(body.promptId || "").trim();
    const baseVersion = String(body.baseVersion || "").trim();
    const optimizationGoal =
      String(body.optimizationGoal || "").trim() ||
      "提升写作风格稳定性、语言自然度、信息密度、情绪推进和标题兑现度，同时避免机器腔与事实边界退化。";
    if (!promptId || !baseVersion) {
      throw new Error("Prompt 对象和基线版本不能为空");
    }

    const [versions, writingEvalRuns] = await Promise.all([getPromptDetail(promptId), getWritingEvalRuns()]);
    const basePrompt = versions.find((item) => item.version === baseVersion) ?? null;
    if (!basePrompt) {
      throw new Error("基线 Prompt 版本不存在");
    }

    const systemPrompt = [
      "你是中文写作系统的 Prompt 优化研究员。",
      "你的任务是基于一个已有 Prompt 版本，生成一个更强但仍然可控的候选版本。",
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
      `优化目标：${optimizationGoal}`,
      "最近相关写作评测运行：",
      buildRunContextText(promptId, writingEvalRuns),
      "当前基线 Prompt：",
      basePrompt.prompt_content,
    ].join("\n\n");

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
      body.candidateVersion,
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
      createdBy: operator.userId,
    });

    return ok({
      created: true,
      promptId: basePrompt.prompt_id,
      baseVersion,
      version: nextVersion,
      changeSummary,
      riskChecks,
      model: generated.model,
      provider: generated.provider,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "生成候选 Prompt 版本失败", 400);
  }
}
