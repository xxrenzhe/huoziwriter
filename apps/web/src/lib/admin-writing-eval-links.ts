export type AdminWritingEvalSection = "overview" | "datasets" | "runs" | "versions" | "insights" | "scoring" | "schedules" | "governance";

const ADMIN_WRITING_EVAL_SECTION_CONFIG = {
  overview: {
    label: "Overview",
    href: "/admin/writing-eval",
  },
  datasets: {
    label: "Datasets",
    href: "/admin/writing-eval/datasets",
  },
  runs: {
    label: "Runs",
    href: "/admin/writing-eval/runs",
  },
  versions: {
    label: "Versions",
    href: "/admin/writing-eval/versions",
  },
  insights: {
    label: "Insights",
    href: "/admin/writing-eval/insights",
  },
  scoring: {
    label: "Scoring",
    href: "/admin/writing-eval/scoring",
  },
  schedules: {
    label: "Schedules",
    href: "/admin/writing-eval/schedules",
  },
  governance: {
    label: "Governance",
    href: "/admin/writing-eval/governance",
  },
} as const satisfies Record<AdminWritingEvalSection, { label: string; href: string }>;

export function getAdminWritingEvalHref(section: AdminWritingEvalSection) {
  return ADMIN_WRITING_EVAL_SECTION_CONFIG[section].href;
}

export function getAdminWritingEvalNavItems(sections: readonly AdminWritingEvalSection[]) {
  return sections.map((section) => ({
    key: section,
    label: ADMIN_WRITING_EVAL_SECTION_CONFIG[section].label,
    href: ADMIN_WRITING_EVAL_SECTION_CONFIG[section].href,
  }));
}

export function buildAdminWritingEvalRunsHref({
  runId,
  resultId,
  scheduleId,
  datasetId,
}: {
  runId?: number | null;
  resultId?: number | null;
  scheduleId?: number | null;
  datasetId?: number | null;
} = {}) {
  const params = new URLSearchParams();
  if (typeof runId === "number" && Number.isInteger(runId) && runId > 0) {
    params.set("runId", String(runId));
  }
  if (typeof resultId === "number" && Number.isInteger(resultId) && resultId > 0) {
    params.set("resultId", String(resultId));
  }
  if (typeof scheduleId === "number" && Number.isInteger(scheduleId) && scheduleId > 0) {
    params.set("scheduleId", String(scheduleId));
  }
  if (typeof datasetId === "number" && Number.isInteger(datasetId) && datasetId > 0) {
    params.set("datasetId", String(datasetId));
  }
  const baseHref = getAdminWritingEvalHref("runs");
  return params.size > 0 ? `${baseHref}?${params.toString()}` : baseHref;
}

export function buildAdminWritingEvalDatasetsHref({
  datasetId,
  caseId,
}: {
  datasetId?: number | null;
  caseId?: number | null;
} = {}) {
  const params = new URLSearchParams();
  if (typeof datasetId === "number" && Number.isInteger(datasetId) && datasetId > 0) {
    params.set("datasetId", String(datasetId));
  }
  if (typeof caseId === "number" && Number.isInteger(caseId) && caseId > 0) {
    params.set("caseId", String(caseId));
  }
  const baseHref = getAdminWritingEvalHref("datasets");
  return params.size > 0 ? `${baseHref}?${params.toString()}` : baseHref;
}

export function buildAdminWritingEvalVersionsHref({
  assetType,
  assetRef,
  versionId,
}: {
  assetType?: string | null;
  assetRef?: string | null;
  versionId?: number | null;
} = {}) {
  const params = new URLSearchParams();
  const normalizedAssetType = String(assetType || "").trim();
  const normalizedAssetRef = String(assetRef || "").trim();
  if (normalizedAssetType) {
    params.set("assetType", normalizedAssetType);
  }
  if (normalizedAssetRef) {
    params.set("assetRef", normalizedAssetRef);
  }
  if (typeof versionId === "number" && Number.isInteger(versionId) && versionId > 0) {
    params.set("versionId", String(versionId));
  }
  const baseHref = getAdminWritingEvalHref("versions");
  return params.size > 0 ? `${baseHref}?${params.toString()}` : baseHref;
}

export function parsePromptVersionRef(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) {
    return null;
  }
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

export function buildAdminPromptVersionHref(candidateRef: string | null | undefined, fallbackPromptId?: string | null) {
  const parsed = parsePromptVersionRef(candidateRef);
  if (parsed) {
    const params = new URLSearchParams(parsed);
    return `/admin/prompts?${params.toString()}`;
  }

  const normalizedFallbackPromptId = String(fallbackPromptId || "").trim();
  const normalizedVersion = String(candidateRef || "").trim();
  if (!normalizedFallbackPromptId || !normalizedVersion) {
    return null;
  }
  const params = new URLSearchParams({
    promptId: normalizedFallbackPromptId,
    version: normalizedVersion,
  });
  return `/admin/prompts?${params.toString()}`;
}
