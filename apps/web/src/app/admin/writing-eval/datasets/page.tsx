import { AdminWritingEvalDatasetsClient } from "@/components/admin-writing-eval-datasets-client";
import { buildAdminWritingEvalDatasetsHref, getAdminWritingEvalHref } from "@/lib/admin-writing-eval-links";
import { requireAdminSession } from "@/lib/page-auth";
import { getWritingEvalCases, getWritingEvalDatasets } from "@/lib/writing-eval";

export default async function AdminWritingEvalDatasetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ datasetId?: string; caseId?: string }>;
}) {
  await requireAdminSession();
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
    <AdminWritingEvalDatasetsClient
      initialDatasets={datasets}
      initialCases={initialCases}
      initialSelectedDatasetId={initialDataset?.id ?? null}
      initialSelectedCaseId={initialCase?.id ?? null}
      focusDataset={
        Number.isInteger(requestedDatasetId) && requestedDatasetId > 0
          ? {
              datasetId: requestedDatasetId,
              matchedCount: initialDataset ? 1 : 0,
              clearHref: getAdminWritingEvalHref("datasets"),
            }
          : null
      }
      focusCase={
        Number.isInteger(requestedCaseId) && requestedCaseId > 0
          ? {
              caseId: requestedCaseId,
              matchedCount: initialCase ? 1 : 0,
              clearHref: buildAdminWritingEvalDatasetsHref({ datasetId: initialDataset?.id ?? null }),
            }
          : null
      }
    />
  );
}
