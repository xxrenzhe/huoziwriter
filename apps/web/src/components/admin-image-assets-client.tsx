"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, cn, surfaceCardStyles } from "@huoziwriter/ui";

const adminMaintenanceFormClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "mt-5 border-adminLineStrong bg-adminBg text-adminInk shadow-none",
);
const adminMaintenanceInputClassName = cn(
  "w-24 min-h-10 px-3 py-2",
  "border-adminLineStrong bg-adminSurfaceAlt text-adminInk",
  "focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);
const adminMaintenanceMessageBaseClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "mt-3 text-sm shadow-none",
);
const adminMaintenanceMessageSuccessClassName = cn(
  adminMaintenanceMessageBaseClassName,
  "border-adminLineStrong bg-adminSurfaceAlt text-adminInkSoft",
);
const adminMaintenanceMessageErrorClassName = cn(
  adminMaintenanceMessageBaseClassName,
  "border-[#8f3136] bg-[#2a1718] text-[#efb5b9]",
);

function getMaintenanceMessageClassName(message: string) {
  return message.includes("失败")
    ? adminMaintenanceMessageErrorClassName
    : adminMaintenanceMessageSuccessClassName;
}

export function AdminImageAssetMaintenance() {
  const router = useRouter();
  const [limit, setLimit] = useState("20");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setMessage("");
    const response = await fetch("/api/admin/images/rebuild-derivatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: Number(limit || 20) }),
    });
    const json = await response.json().catch(() => null);
    setRunning(false);
    if (!response.ok || !json?.success) {
      setMessage(json?.error || "重建失败");
      return;
    }

    const data = json.data as {
      matchedCount: number;
      rebuiltCount: number;
      failureCount: number;
    };
    setMessage(`已扫描并命中 ${data.matchedCount} 条，成功重建 ${data.rebuiltCount} 条，失败 ${data.failureCount} 条。`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className={adminMaintenanceFormClassName}>
      <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">Image Maintenance</div>
      <div className="mt-2 text-sm leading-7 text-adminInkSoft">
        对历史 `passthrough` / `passthrough-fallback` 资产执行一次重建，补齐真实压缩图和缩略图。单次建议先跑小批量。
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          aria-label="重建数量上限"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          inputMode="numeric"
          className={adminMaintenanceInputClassName}
          placeholder="20"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={running}
          className="px-4"
        >
          {running ? "重建中…" : "重建旧资产衍生"}
        </Button>
      </div>
      {message ? (
        <div className={getMaintenanceMessageClassName(message)}>
          {message}
        </div>
      ) : null}
    </form>
  );
}
