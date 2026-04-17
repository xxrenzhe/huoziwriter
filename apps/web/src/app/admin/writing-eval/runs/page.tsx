import { AdminWritingEvalClient } from "@/components/admin-writing-eval-client";
import { buildAdminWritingEvalRunsHref, getAdminWritingEvalHref } from "@/lib/admin-writing-eval-links";
import { requireAdminSession } from "@/lib/page-auth";
import { getPromptVersions } from "@/lib/repositories";
import { getWritingEvalApplyCommandTemplates, getWritingEvalCases, getWritingEvalDatasets, getWritingEvalLayoutStrategies, getWritingEvalRunDetail, getWritingEvalRunSchedules, getWritingEvalRuns, getWritingEvalScoringProfiles } from "@/lib/writing-eval";

export default async function AdminWritingEvalRunsPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string; scheduleId?: string; resultId?: string; datasetId?: string }>;
}) {
  await requireAdminSession();
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
    <AdminWritingEvalClient
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
              clearHref: getAdminWritingEvalHref("runs"),
            }
          : null
      }
      focusResult={
        Number.isInteger(requestedResultId) && requestedResultId > 0
          ? {
              resultId: requestedResultId,
              matchedCount: requestedResultExists ? 1 : 0,
              clearHref: buildAdminWritingEvalRunsHref({ runId: requestedRun?.id ?? null }),
            }
          : null
      }
      focusSchedule={
        Number.isInteger(requestedScheduleId) && requestedScheduleId > 0
          ? {
              scheduleId: requestedScheduleId,
              matchedCount: requestedSchedule ? 1 : 0,
              clearHref: getAdminWritingEvalHref("runs"),
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
        label: `${strategy.name} · ${strategy.code}${strategy.isOfficial ? " · official" : strategy.ownerUserId ? " · private" : ""}`,
      }))}
      applyCommandTemplateOptions={applyCommandTemplates.map((template) => ({
        value: template.code,
        label: `${template.name} · ${template.code}`,
      }))}
    />
  );
}
