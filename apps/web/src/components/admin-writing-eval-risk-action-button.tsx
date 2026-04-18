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

export function AdminWritingEvalRiskActionButton({ action }: { action: GovernanceAction }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/admin/writing-eval/governance-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { message?: string } };
    setSubmitting(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "执行治理动作失败");
      return;
    }
    setMessage(json.data?.message || "治理动作已执行");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <button type="button" className={uiPrimitives.adminSecondaryButton} onClick={() => void handleClick()} disabled={submitting}>
        {submitting ? "执行中…" : action.label}
      </button>
      {message ? <div className="text-xs leading-6 text-stone-500">{message}</div> : null}
    </div>
  );
}
