"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";

type GovernanceAction = {
  actionType: "retry_run" | "set_rollout_observe" | "set_rollout_trial" | "pause_rollout";
  label: string;
  reason: string;
  runId: number | null;
  assetType: string | null;
  assetRef: string | null;
};

export function AdminWritingEvalRiskBatchActions({ actions }: { actions: GovernanceAction[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/admin/writing-eval/governance-actions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      data?: { total?: number; successCount?: number; failureCount?: number };
    };
    setSubmitting(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "批量执行治理动作失败");
      return;
    }
    setMessage(`已执行 ${json.data?.successCount ?? 0}/${json.data?.total ?? actions.length} 个治理动作`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2 text-right">
      <button type="button" className={uiPrimitives.primaryButton} onClick={() => void handleClick()} disabled={submitting || actions.length === 0}>
        {submitting ? "执行中…" : `批量应用高优先建议 (${actions.length})`}
      </button>
      {message ? <div className="text-xs leading-6 text-stone-500">{message}</div> : null}
    </div>
  );
}
