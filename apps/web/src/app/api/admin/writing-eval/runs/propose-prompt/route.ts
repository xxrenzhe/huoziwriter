import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptCandidateVersionFromBase } from "@/lib/prompt-candidates";
import { createWritingEvalRun } from "@/lib/writing-eval";

function parsePromptVersionRef(value: unknown) {
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

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const baseVersionType = String(body.baseVersionType || "").trim();
    const baseVersionRef = String(body.baseVersionRef || "").trim();
    if (!isPromptBackedVersionType(baseVersionType)) {
      return fail("当前仅支持从 prompt_version、fact_check、title_template 或 lead_template 自动生成候选并开跑", 400);
    }
    const { promptId, version } = parsePromptVersionRef(baseVersionRef);
    const candidate = await createPromptCandidateVersionFromBase({
      promptId,
      baseVersion: version,
      versionType: baseVersionType,
      experimentMode: body.experimentMode,
      optimizationGoal:
        String(body.optimizationGoal || "").trim() ||
        [
          `为 dataset ${Number(body.datasetId)} 生成一版可直接进入 writing eval 的候选 Prompt。`,
          String(body.summary || "").trim() || null,
          "优先做小步、可归因、可回滚的 Prompt 优化，不改变输出契约。",
        ]
          .filter(Boolean)
          .join(" "),
      candidateVersion: body.candidateVersion,
      operatorUserId: operator.userId,
    });
    const run = await createWritingEvalRun({
      datasetId: Number(body.datasetId),
      baseVersionType,
      baseVersionRef,
      candidateVersionType: baseVersionType,
      candidateVersionRef: candidate.promptVersionRef,
      experimentMode: body.experimentMode,
      triggerMode: body.triggerMode,
      decisionMode: body.decisionMode,
      summary: [String(body.summary || "").trim(), `auto-propose:${candidate.promptVersionRef}`].filter(Boolean).join("\n"),
      createdBy: operator.userId,
    });
    return ok({
      candidate,
      run,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "自动生成候选并创建实验失败", 400);
  }
}
