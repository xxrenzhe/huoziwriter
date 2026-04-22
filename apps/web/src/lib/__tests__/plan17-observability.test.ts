import test from "node:test";
import assert from "node:assert/strict";

import { calculatePercentile, summarizeBatchIsolationObservations, summarizeLatencyObservations } from "../plan17-observability";

test("calculatePercentile returns p95 from sorted samples", () => {
  assert.equal(calculatePercentile([120, 180, 90, 150, 200], 0.95), 200);
  assert.equal(calculatePercentile([], 0.95), null);
});

test("summarizeLatencyObservations only uses completed samples for latency stats", () => {
  const summary = summarizeLatencyObservations("strategyCard.strengthAudit.route", [
    { group_key: null, status: "completed", duration_ms: 120, meta_json: null, observed_at: "2026-04-20T10:00:00.000Z" },
    { group_key: null, status: "failed", duration_ms: 900, meta_json: null, observed_at: "2026-04-20T09:59:00.000Z" },
    { group_key: null, status: "completed", duration_ms: 180, meta_json: null, observed_at: "2026-04-20T09:58:00.000Z" },
  ]);

  assert.equal(summary.observationCount, 3);
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.avgMs, 150);
  assert.equal(summary.p95Ms, 180);
});

test("summarizeBatchIsolationObservations measures failure isolation by batch", () => {
  const summary = summarizeBatchIsolationObservations("topicBacklogGenerate.item", [
    { group_key: "batch-a", status: "completed", duration_ms: 200, meta_json: null, observed_at: "2026-04-20T10:00:00.000Z" },
    { group_key: "batch-a", status: "failed", duration_ms: 500, meta_json: null, observed_at: "2026-04-20T09:59:00.000Z" },
    { group_key: "batch-b", status: "failed", duration_ms: 450, meta_json: null, observed_at: "2026-04-20T09:58:00.000Z" },
    { group_key: "batch-c", status: "completed", duration_ms: 210, meta_json: null, observed_at: "2026-04-20T09:57:00.000Z" },
  ]);

  assert.equal(summary.batchCount, 3);
  assert.equal(summary.completedItemCount, 2);
  assert.equal(summary.failedItemCount, 2);
  assert.equal(summary.failureBatchCount, 2);
  assert.equal(summary.isolatedFailureBatchCount, 1);
  assert.equal(summary.isolationRate, 0.5);
});
