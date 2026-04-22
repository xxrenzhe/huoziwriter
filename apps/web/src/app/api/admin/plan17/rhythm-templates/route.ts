import { requireAdminAccess } from "@/lib/auth";
import {
  activateArchetypeRhythmTemplate,
  type ArchetypeRhythmHints,
  createArchetypeRhythmTemplate,
  listArchetypeRhythmTemplates,
  normalizeStrategyArchetypeKey,
} from "@/lib/archetype-rhythm";
import { fail, ok } from "@/lib/http";

function normalizeHints(value: unknown): ArchetypeRhythmHints {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    narrativeStance: typeof record.narrativeStance === "string" ? record.narrativeStance.trim() : "",
    energyCurve: typeof record.energyCurve === "string" ? record.energyCurve.trim() : "",
    discoveryMode: typeof record.discoveryMode === "string" ? record.discoveryMode.trim() : "",
    offTopicTolerance: record.offTopicTolerance === "low" || record.offTopicTolerance === "med" || record.offTopicTolerance === "high"
      ? record.offTopicTolerance
      : "med",
    closureMode: typeof record.closureMode === "string" ? record.closureMode.trim() : "",
    judgmentStrength: record.judgmentStrength === "low" || record.judgmentStrength === "med" || record.judgmentStrength === "high"
      ? record.judgmentStrength
      : "med",
  };
}

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await listArchetypeRhythmTemplates());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取 plan17 节奏模板失败", 400);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    if (String(body?.action || "").trim() === "activate") {
      const archetypeKey = normalizeStrategyArchetypeKey(body?.archetypeKey);
      const version = String(body?.version || "").trim();
      if (!archetypeKey || !version) {
        return fail("激活节奏模板时必须提供 archetypeKey 和 version", 400);
      }
      return ok(await activateArchetypeRhythmTemplate({ archetypeKey, version }));
    }

    const archetypeKey = normalizeStrategyArchetypeKey(body?.archetypeKey);
    if (!archetypeKey) {
      return fail("节奏模板 archetypeKey 无效", 400);
    }
    return ok(await createArchetypeRhythmTemplate({
      archetypeKey,
      version: String(body?.version || ""),
      name: String(body?.name || ""),
      description: typeof body?.description === "string" ? body.description : null,
      hints: normalizeHints(body?.hints),
      activate: body?.activate === true,
      createdBy: admin.userId,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写入 plan17 节奏模板失败", 400);
  }
}
