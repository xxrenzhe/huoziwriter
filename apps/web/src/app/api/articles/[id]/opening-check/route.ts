import { ensureUserSession } from "@/lib/auth";
import {
  getArticleStageArtifact,
  updateArticleStageArtifactPayload,
} from "@/lib/article-stage-artifacts";
import {
  evaluateOpeningGuardChecks,
  normalizeOpeningOptions,
} from "@/lib/opening-patterns";
import { fail, ok } from "@/lib/http";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 4) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : [];
}

function buildRewriteDirections(input: {
  openingText: string;
  diagnose: {
    abstractLevel: string;
    paddingLevel: string;
    hookDensity: string;
    informationFrontLoading: string;
  };
  forbiddenHits: string[];
}) {
  const directions: string[] = [];
  const openingSeed = input.openingText.replace(/\s+/g, " ").trim().slice(0, 24) || "当前开头";

  if (input.forbiddenHits.length > 0 || input.diagnose.abstractLevel === "danger") {
    directions.push(`删掉“时代变化/趋势判断”这类空话，直接用一个具体人、场景或动作重写「${openingSeed}」的第一句。`);
  } else if (input.diagnose.abstractLevel === "warn") {
    directions.push(`把抽象判断换成可见细节，优先补一个时间点、角色或代价，让「${openingSeed}」先落地再展开。`);
  }

  if (input.forbiddenHits.length > 0 || input.diagnose.paddingLevel !== "pass") {
    directions.push("把真正的判断或冲突提前到前两句，删掉背景交代，控制在 80-140 字内完成起势。");
  }

  if (input.diagnose.hookDensity !== "pass" || input.diagnose.informationFrontLoading !== "pass") {
    directions.push("第二句就给结果、反差或问题，不要等到后半段再揭示关键结论。");
  }

  directions.push("优先改成“具体场景 / 冲突反差 / 判断前置”三类高上限开头，不要回到现象铺垫。");

  return Array.from(new Set(directions)).slice(0, 2);
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const articleId = Number(params.id);
    const [outlineArtifact, deepWritingArtifact] = await Promise.all([
      getArticleStageArtifact(articleId, session.userId, "outlinePlanning").catch(() => null),
      getArticleStageArtifact(articleId, session.userId, "deepWriting").catch(() => null),
    ]);

    const outlinePayload = getRecord(outlineArtifact?.payload);
    const deepWritingPayload = getRecord(deepWritingArtifact?.payload);
    const outlineSelection = getRecord(outlinePayload?.selection);
    const deepWritingOpeningStrategy = getString(deepWritingPayload?.openingStrategy);
    const deepWritingOpeningPatternLabel = getString(deepWritingPayload?.openingPatternLabel);
    const selectedOpening =
      deepWritingOpeningStrategy
      || getString(outlineSelection?.selectedOpeningHook)
      || getString(outlinePayload?.openingHook);

    if (!selectedOpening) {
      return fail("当前还没有可体检的开头，请先确认大纲开头或生成写作执行卡。", 409);
    }

    const outlineOptions = normalizeOpeningOptions(outlinePayload?.openingOptions, [], 3);
    const selectedOption = outlineOptions.find((item) => item.opening === selectedOpening)
      ?? normalizeOpeningOptions(
        [{
          opening: selectedOpening,
          patternLabel: deepWritingOpeningPatternLabel || undefined,
        }],
        [],
        1,
      )[0];

    const guardEvaluation = evaluateOpeningGuardChecks({
      selectedOpening,
      selectedOpeningOption: selectedOption ?? null,
      openingAuditedAt: outlinePayload?.openingAuditedAt,
      outlineUpdatedAt: outlinePayload?.outlineUpdatedAt,
    });

    const rewriteDirections = buildRewriteDirections({
      openingText: selectedOpening,
      diagnose: guardEvaluation.openingDiagnose,
      forbiddenHits: guardEvaluation.openingForbiddenHits,
    });
    const checkedAt = new Date().toISOString();
    const checkPayload = {
      openingText: selectedOpening,
      patternLabel: selectedOption?.patternLabel || deepWritingOpeningPatternLabel || "",
      qualityCeiling: guardEvaluation.openingQualityCeiling,
      hookScore: guardEvaluation.openingHookScore,
      forbiddenHits: guardEvaluation.openingForbiddenHits,
      recommendReason: selectedOption?.recommendReason || "",
      diagnose: guardEvaluation.openingDiagnose,
      recommendedDirection: rewriteDirections[0] || "把判断或冲突提前到前两句，再决定是否保留当前模式。",
      rewriteDirections,
      checks: guardEvaluation.checks,
      checkedAt,
    } satisfies Record<string, unknown>;

    if (!deepWritingArtifact) {
      return ok({ check: checkPayload, artifact: null });
    }

    const artifact = await updateArticleStageArtifactPayload({
      articleId,
      userId: session.userId,
      stageCode: "deepWriting",
      payloadPatch: {
        openingCheck: checkPayload,
      },
    });

    return ok({
      check: checkPayload,
      artifact,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "开头体检失败", 400);
  }
}
