import { AdminPlan17QualityClient } from "@/components/admin-plan17-quality-client";
import { requireAdminSession } from "@/lib/page-auth";
import { isPlan17WritingEvalFocusKey } from "@/lib/writing-eval-plan17";
import { getWritingEvalCaseQualityLabels, getWritingEvalCases, getWritingEvalDatasets, getPlan17QualityReport } from "@/lib/writing-eval";

export default async function AdminPlan17QualityPage({
  searchParams,
}: {
  searchParams?: Promise<{ focusKey?: string; datasetId?: string; caseId?: string }>;
}) {
  await requireAdminSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const [qualityReport, datasets, labels] = await Promise.all([
    getPlan17QualityReport(),
    getWritingEvalDatasets(),
    getWritingEvalCaseQualityLabels({ limit: 1000 }),
  ]);
  const plan17Datasets = datasets.filter((item) => isPlan17WritingEvalFocusKey(item.focus.key));
  const queues = await Promise.all(
    plan17Datasets.map(async (dataset) => ({
      dataset,
      focus: qualityReport.focuses.find((item) => item.key === dataset.focus.key) ?? null,
      cases: await getWritingEvalCases(dataset.id),
    })),
  );
  const requestedFocusKey = String(resolvedSearchParams.focusKey || "").trim() || null;
  const requestedDatasetId = Number(resolvedSearchParams.datasetId);
  const requestedCaseId = Number(resolvedSearchParams.caseId);

  return (
    <AdminPlan17QualityClient
      qualityReport={qualityReport}
      queues={queues}
      initialLabels={labels}
      initialFocusKey={requestedFocusKey}
      initialSelectedDatasetId={Number.isInteger(requestedDatasetId) && requestedDatasetId > 0 ? requestedDatasetId : null}
      initialSelectedCaseId={Number.isInteger(requestedCaseId) && requestedCaseId > 0 ? requestedCaseId : null}
    />
  );
}
