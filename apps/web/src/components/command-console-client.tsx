"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CommandConsoleClient({
  documentId,
  commands,
}: {
  documentId: number;
  commands: string[];
}) {
  const router = useRouter();
  const [customCommand, setCustomCommand] = useState("");
  const [loadingCommand, setLoadingCommand] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function runCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    setLoadingCommand(trimmed);
    setMessage("");
    const response = await fetch(`/api/documents/${documentId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: trimmed }),
    });
    const json = await response.json();
    setLoadingCommand(null);

    if (!response.ok || !json.success) {
      setMessage(json.error || "命令执行失败");
      return;
    }

    setCustomCommand("");
    setMessage("命令已执行，正在返回编辑器。");
    router.push(`/editor/${documentId}`);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await runCommand(customCommand);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {commands.map((command) => (
          <button
            key={command}
            onClick={() => runCommand(command)}
            disabled={loadingCommand !== null}
            className="flex w-full items-center justify-between border border-stone-300/40 px-4 py-4 text-left text-sm text-stone-700 disabled:opacity-60"
          >
            <span>{command}</span>
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">
              {loadingCommand === command ? "执行中" : "执行"}
            </span>
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border border-stone-300/40 bg-[#faf7f0] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自定义命令</div>
        <textarea
          value={customCommand}
          onChange={(event) => setCustomCommand(event.target.value)}
          placeholder="例如：把第三段改成更短句，并补一个反常识案例。"
          className="mt-4 min-h-[120px] w-full border border-stone-300 bg-white px-4 py-3 text-sm leading-7 text-stone-700"
        />
        <button disabled={loadingCommand !== null} className="mt-4 bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
          {loadingCommand === customCommand.trim() ? "执行中..." : "执行自定义命令"}
        </button>
      </form>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
