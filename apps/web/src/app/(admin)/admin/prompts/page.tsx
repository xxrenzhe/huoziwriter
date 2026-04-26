import { PromptManagerClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getPromptVersions } from "@/lib/repositories";

export default async function AdminPromptsPage() {
  await requireAdminSession();
  const prompts = await getPromptVersions();
  return (
    <PromptManagerClient
      prompts={prompts.map((prompt) => ({
        id: prompt.id,
        promptId: prompt.prompt_id,
        version: prompt.version,
        category: prompt.category,
        name: prompt.name,
        isActive: Boolean(prompt.is_active),
        promptContent: prompt.prompt_content,
        autoMode: String(prompt.auto_mode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual",
        updatedAt: prompt.updated_at,
        rolloutObserveOnly: Boolean(prompt.rollout_observe_only),
        rolloutPercentage: prompt.rollout_percentage,
        rolloutPlanCodes: (() => {
          try {
            const parsed = JSON.parse(prompt.rollout_plan_codes_json || "[]") as unknown;
            return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
          } catch {
            return [];
          }
        })(),
        rolloutAssessment: {
          hasLedger: false,
          ledgerDecision: null,
          sourceVersion: null,
          runId: null,
          deltaTotalScore: null,
          failedCaseCount: 0,
          feedbackCount: 0,
          observedViralScore: null,
          openRate: null,
          readCompletionRate: null,
          uniqueUsers: 0,
          totalHitCount: 0,
          lastHitAt: null,
        },
        rolloutAuditTrail: [],
        rolloutStats: {
          uniqueUserCount: 0,
          totalHitCount: 0,
          lastHitAt: null,
          observeUserCount: 0,
          planUserCount: 0,
          percentageUserCount: 0,
          stableUserCount: 0,
        },
        rolloutTrend: [],
        rolloutSamples: [],
      }))}
    />
  );
}
