import { OpsWritingEvalClient } from "@/components/ops-writing-eval-client";
import { requireOpsSession } from "@/lib/page-auth";
import { getPromptVersions } from "@/lib/repositories";
import { getWritingEvalApplyCommandTemplates, getWritingEvalCases, getWritingEvalDatasets, getWritingEvalLayoutStrategies, getWritingEvalRunDetail, getWritingEvalRunSchedules, getWritingEvalRuns, getWritingEvalScoringProfiles } from "@/lib/writing-eval";

export default async function OpsWritingEvalRunsPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string; scheduleId?: string; resultId?: string; datasetId?: string }>;
}) {
  await requireOpsSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const [datasets, runs, prompts, scoringProfiles, layoutStrategies, applyCommandTemplates, schedules] = await Promise.all([
    getWritingEvalDatasets(),
    getWritingEvalRuns(),
    getPromptVersions(),
    getWritingEvalScoringProfiles(),
    getWritingEvalLayoutStrategies(),
    getWritingEvalApplyCommandTemplates(),
    getWritingEvalRunSchedules(),
  ]);
  const requestedRunId = Number(resolvedSearchParams.runId);
  const requestedScheduleId = Number(resolvedSearchParams.scheduleId);
  const requestedResultId = Number(resolvedSearchParams.resultId);
  const requestedDatasetId = Number(resolvedSearchParams.datasetId);
  const requestedRun =
    Number.isInteger(requestedRunId) && requestedRunId > 0 ? runs.find((item) => item.id === requestedRunId) ?? null : null;
  const requestedSchedule =
    Number.isInteger(requestedScheduleId) && requestedScheduleId > 0 ? schedules.find((item) => item.id === requestedScheduleId) ?? null : null;
  const requestedDataset =
    Number.isInteger(requestedDatasetId) && requestedDatasetId > 0 ? datasets.find((item) => item.id === requestedDatasetId) ?? null : null;
  const initialRun = requestedRun ?? (requestedDataset ? null : runs[0] ?? null);
  const initialRunDetail = initialRun ? await getWritingEvalRunDetail(initialRun.id) : null;
  const initialSelectedDatasetId = requestedDataset?.id ?? initialRunDetail?.datasetId ?? datasets[0]?.id ?? null;
  const requestedResultExists =
    Boolean(
      initialRunDetail
      && Number.isInteger(requestedResultId)
      && requestedResultId > 0
      && initialRunDetail.results.some((item) => item.id === requestedResultId),
    );
  const initialCases = initialRunDetail
    ? await getWritingEvalCases(initialRunDetail.datasetId)
    : initialSelectedDatasetId
      ? await getWritingEvalCases(initialSelectedDatasetId)
      : [];
  return (
    <OpsWritingEvalClient
      initialDatasets={datasets}
      initialCases={initialCases}
      initialSelectedDatasetId={initialSelectedDatasetId}
      initialRuns={runs}
      initialRunDetail={initialRunDetail}
      initialResultId={Number.isInteger(requestedResultId) && requestedResultId > 0 ? requestedResultId : null}
      initialSchedules={schedules}
      focusDataset={
        Number.isInteger(requestedDatasetId) && requestedDatasetId > 0
          ? {
              datasetId: requestedDatasetId,
              matchedCount: requestedDataset ? 1 : 0,
              clearHref: "/ops/writing-eval/runs",
            }
          : null
      }
      focusResult={
        Number.isInteger(requestedResultId) && requestedResultId > 0
          ? {
              resultId: requestedResultId,
              matchedCount: requestedResultExists ? 1 : 0,
              clearHref: requestedRun ? `/ops/writing-eval/runs?runId=${requestedRun.id}` : "/ops/writing-eval/runs",
            }
          : null
      }
      focusSchedule={
        Number.isInteger(requestedScheduleId) && requestedScheduleId > 0
          ? {
              scheduleId: requestedScheduleId,
              matchedCount: requestedSchedule ? 1 : 0,
              clearHref: "/ops/writing-eval/runs",
            }
          : null
      }
      promptOptions={prompts.map((prompt) => ({
        promptId: prompt.prompt_id,
        name: prompt.name,
        value: `${prompt.prompt_id}@${prompt.version}`,
        label: `${prompt.name} · ${prompt.prompt_id}@${prompt.version}${prompt.is_active ? " · active" : ""}`,
      }))}
      initialScoringProfiles={scoringProfiles}
      layoutStrategyOptions={layoutStrategies.map((strategy) => ({
        value: String(strategy.id),
        label: `${strategy.name} · ${strategy.code}${strategy.isOfficial ? " · official" : strategy.isPublic ? " · public" : ""}`,
      }))}
      applyCommandTemplateOptions={applyCommandTemplates.map((template) => ({
        value: template.code,
        label: `${template.name} · ${template.code}`,
      }))}
    />
  );
}
