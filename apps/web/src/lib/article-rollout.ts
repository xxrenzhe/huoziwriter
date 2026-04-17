import { loadRolledOutApplyCommandTemplate, loadRolledOutLayoutStrategy } from "./writing-rollout";

export type ResolvedArticleLayoutStrategy = {
  id: number;
  code: string;
  name: string;
  config: Record<string, unknown>;
  resolutionMode: "explicit" | "rollout" | "active";
  resolutionReason: string;
};

export async function resolveArticleLayoutStrategy(input: {
  userId: number;
  role?: string | null;
  planCode?: string | null;
}): Promise<ResolvedArticleLayoutStrategy | null> {
  const layoutStrategy = await loadRolledOutLayoutStrategy({
    userId: input.userId,
    role: input.role,
    planCode: input.planCode,
  });
  if (!layoutStrategy) {
    return null;
  }
  return {
    id: layoutStrategy.id,
    code: layoutStrategy.code,
    name: layoutStrategy.name,
    config: layoutStrategy.config,
    resolutionMode: layoutStrategy.resolutionMode,
    resolutionReason: layoutStrategy.resolutionReason,
  };
}

export async function resolveArticleApplyCommandTemplate(input: {
  userId: number;
  role?: string | null;
  planCode?: string | null;
}) {
  return loadRolledOutApplyCommandTemplate({
    userId: input.userId,
    role: input.role,
    planCode: input.planCode,
  });
}
