import { OpsWritingEvalDatasetsClient } from "@/components/ops-writing-eval-datasets-client";
import { requireOpsSession } from "@/lib/page-auth";
import { getWritingEvalCases, getWritingEvalDatasets } from "@/lib/writing-eval";

export default async function OpsWritingEvalDatasetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ datasetId?: string; caseId?: string }>;
}) {
  await requireOpsSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const datasets = await getWritingEvalDatasets();
  const requestedDatasetId = Number(resolvedSearchParams.datasetId);
  const requestedCaseId = Number(resolvedSearchParams.caseId);
  const initialDataset =
    Number.isInteger(requestedDatasetId) && requestedDatasetId > 0
      ? datasets.find((item) => item.id === requestedDatasetId) ?? datasets[0] ?? null
      : datasets[0] ?? null;
  const initialCases = initialDataset ? await getWritingEvalCases(initialDataset.id) : [];
  const initialCase =
    Number.isInteger(requestedCaseId) && requestedCaseId > 0
      ? initialCases.find((item) => item.id === requestedCaseId) ?? initialCases[0] ?? null
      : initialCases[0] ?? null;

  return (
    <OpsWritingEvalDatasetsClient
      initialDatasets={datasets}
      initialCases={initialCases}
      initialSelectedDatasetId={initialDataset?.id ?? null}
      initialSelectedCaseId={initialCase?.id ?? null}
      focusDataset={
        Number.isInteger(requestedDatasetId) && requestedDatasetId > 0
          ? {
              datasetId: requestedDatasetId,
              matchedCount: initialDataset ? 1 : 0,
              clearHref: "/ops/writing-eval/datasets",
            }
          : null
      }
      focusCase={
        Number.isInteger(requestedCaseId) && requestedCaseId > 0
          ? {
              caseId: requestedCaseId,
              matchedCount: initialCase ? 1 : 0,
              clearHref: initialDataset ? `/ops/writing-eval/datasets?datasetId=${initialDataset.id}` : "/ops/writing-eval/datasets",
            }
          : null
      }
    />
  );
}
