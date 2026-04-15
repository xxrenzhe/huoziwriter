"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";

function refreshRouter(router: ReturnType<typeof useRouter>) {
  startTransition(() => {
    router.refresh();
  });
}

async function patchGuide(body: Record<string, unknown>) {
  const response = await fetch("/api/first-success-guide", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.error || "首篇引导状态更新失败");
  }
}

export function FirstSuccessGuideViewed() {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    void patchGuide({ action: "viewed" }).catch(() => {
      sentRef.current = false;
    });
  }, []);

  return null;
}

export function FirstSuccessStepToggle({
  stepId,
  completed,
}: {
  stepId: number;
  completed: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      await patchGuide({
        action: "set_step",
        stepId,
        completed: !completed,
      });
      refreshRouter(router);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className="mt-4 border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:opacity-60"
    >
      {loading ? "处理中..." : completed ? "取消手动完成" : "手动标记完成"}
    </button>
  );
}

export function FirstSuccessBannerControls({
  dismissed,
}: {
  dismissed: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "dismiss" | "reopen") {
    setLoading(true);
    try {
      await patchGuide({ action });
      refreshRouter(router);
    } finally {
      setLoading(false);
    }
  }

  return dismissed ? (
    <button
      type="button"
      onClick={() => handleAction("reopen")}
      disabled={loading}
      className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:opacity-60"
    >
      {loading ? "处理中..." : "重新打开首篇引导"}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => handleAction("dismiss")}
      disabled={loading}
      className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:opacity-60"
    >
      {loading ? "处理中..." : "收起首篇引导横幅"}
    </button>
  );
}
