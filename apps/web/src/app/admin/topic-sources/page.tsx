import { AdminTopicSourcesClient } from "@/components/admin-client";
import { getDatabase } from "@/lib/db";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminTopicSources } from "@/lib/topic-signals";

function parseJobPayload(value: string | null) {
  if (!value) {
    return {} as Record<string, unknown>;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function AdminTopicSourcesPage() {
  await requireAdminSession();
  const db = getDatabase();
  const [sources, recentRuns, failedTopicFetchJobs] = await Promise.all([
    getAdminTopicSources(),
    db.query<{
      id: number;
      sync_window_start: string;
      sync_window_label: string;
      status: string;
      scheduled_source_count: number;
      enqueued_job_count: number;
      completed_source_count: number;
      failed_source_count: number;
      inserted_item_count: number;
      last_error: string | null;
      triggered_at: string;
      finished_at: string | null;
    }>(
      `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
              completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at
       FROM topic_sync_runs
       ORDER BY sync_window_start DESC, id DESC
       LIMIT 8`,
    ),
    db.query<{ payload_json: string | null; last_error: string | null; updated_at: string }>(
      `SELECT payload_json, last_error, updated_at
       FROM job_queue
       WHERE job_type = ? AND status = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 60`,
      ["topicFetch", "failed"],
    ),
  ]);

  const topicSourceFailureMap = new Map<
    number,
    {
      count: number;
      latestError: string | null;
      latestUpdatedAt: string | null;
    }
  >();
  for (const job of failedTopicFetchJobs) {
    const payload = parseJobPayload(job.payload_json);
    const sourceId = Number(payload.sourceId || 0);
    if (!sourceId) {
      continue;
    }
    const current = topicSourceFailureMap.get(sourceId) ?? {
      count: 0,
      latestError: null,
      latestUpdatedAt: null,
    };
    current.count += 1;
    if (!current.latestUpdatedAt || job.updated_at > current.latestUpdatedAt) {
      current.latestUpdatedAt = job.updated_at;
      current.latestError = job.last_error || null;
    }
    topicSourceFailureMap.set(sourceId, current);
  }

  return (
    <AdminTopicSourcesClient
      sources={sources.map((source) => ({
        id: source.id,
        name: source.name,
        homepageUrl: source.homepage_url,
        sourceType: source.source_type ?? "news",
        priority: source.priority ?? 100,
        isActive: Boolean(source.is_active),
        lastFetchedAt: source.last_fetched_at,
        recentFailureCount: topicSourceFailureMap.get(source.id)?.count ?? 0,
        latestFailure: topicSourceFailureMap.get(source.id)?.latestError ?? null,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      }))}
      recentRuns={recentRuns.map((run) => ({
        id: run.id,
        syncWindowStart: run.sync_window_start,
        syncWindowLabel: run.sync_window_label,
        status: run.status,
        scheduledSourceCount: run.scheduled_source_count,
        enqueuedJobCount: run.enqueued_job_count,
        completedSourceCount: run.completed_source_count,
        failedSourceCount: run.failed_source_count,
        insertedItemCount: run.inserted_item_count,
        lastError: run.last_error,
        triggeredAt: run.triggered_at,
        finishedAt: run.finished_at,
      }))}
    />
  );
}
