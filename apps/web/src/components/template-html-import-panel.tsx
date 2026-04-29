"use client";

import { buttonStyles, cn } from "@huoziwriter/ui";
import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useState } from "react";

type TemplateImportIssue = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
};

type TemplateImportResult = {
  imported: boolean;
  templateId: string;
  version: string;
  name: string;
  audit: {
    status: "passed" | "warning" | "blocked";
    issues: TemplateImportIssue[];
    summary: Record<string, unknown>;
  };
};

const fieldClassName = "w-full border border-lineStrong bg-paperStrong px-3 py-2 text-sm text-ink outline-none transition focus:border-cinnabar";
const messageClassName = "border border-lineStrong/70 bg-surface px-3 py-2 text-sm leading-6 text-inkSoft";

function formatAuditStatus(status: TemplateImportResult["audit"]["status"]) {
  if (status === "passed") return "校验通过";
  if (status === "warning") return "可导入，有风险提示";
  return "未导入";
}

function formatSummaryValue(value: unknown) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value == null || value === "") return "0";
  return String(value);
}

export function TemplateHtmlImportPanel({
  canImport,
  currentCount,
  limit,
}: {
  canImport: boolean;
  currentCount: number;
  limit: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<TemplateImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reachedLimit = limit > 0 && currentCount >= limit;
  const disabled = !canImport || reachedLimit || submitting;
  const summaryItems: Array<[string, unknown]> = result
    ? [
        ["正文", result.audit.summary.textLength],
        ["段落", result.audit.summary.paragraphCount],
        ["图片", result.audit.summary.imageCount],
        ["首屏字数", result.audit.summary.firstScreenTextLength],
        ["低对比样式", result.audit.summary.lowContrastPairCount],
        ["暗色风险", result.audit.summary.darkModeRisk],
      ]
    : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/templates/import-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sourceUrl, html }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "HTML 模板导入失败");
      }
      const nextResult = json.data as TemplateImportResult;
      setResult(nextResult);
      setMessage(nextResult.imported ? `已导入：${nextResult.name}` : "模板风险过高，已记录审计但没有进入可用模板库。");
      if (nextResult.imported) {
        setHtml("");
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HTML 模板导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border border-lineStrong/70 bg-paperStrong p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">HTML 导入</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            粘贴一份已有微信公众号 HTML，系统会先做发布约束和移动端体验审计，再沉淀为私有模板。
          </div>
        </div>
        <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
          {limit > 0 ? `${currentCount} / ${limit}` : "当前套餐未开放"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-inkSoft">
            模板名称
            <input className={fieldClassName} value={name} onChange={(event) => setName(event.target.value)} placeholder="实战复盘模板" />
          </label>
          <label className="grid gap-2 text-sm text-inkSoft">
            来源链接
            <input className={fieldClassName} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://mp.weixin.qq.com/..." />
          </label>
        </div>
        <label className="grid gap-2 text-sm text-inkSoft">
          HTML
          <textarea
            className={cn(fieldClassName, "min-h-52 resize-y font-mono leading-6")}
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            placeholder="<article>...</article>"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonStyles({ variant: "primary" })} disabled={disabled}>
            <UploadCloud className="h-4 w-4" />
            {submitting ? "导入中" : "导入并审计"}
          </button>
          {!canImport ? <span className="text-sm text-inkMuted">当前套餐未开放私有模板提取。</span> : null}
          {reachedLimit ? <span className="text-sm text-inkMuted">私有模板数量已达到上限。</span> : null}
        </div>
      </form>

      {message ? <div className={cn(messageClassName, "mt-4")}>{message}</div> : null}

      {result ? (
        <div className="mt-4 grid gap-3 border border-lineStrong/60 bg-surface p-3 text-sm leading-6">
          <div className="flex items-center gap-2 text-ink">
            {result.audit.status === "blocked" ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            <span>{formatAuditStatus(result.audit.status)}</span>
            <span className="text-inkMuted">· {result.templateId} · {result.version}</span>
          </div>
          {result.audit.issues.length > 0 ? (
            <div className="grid gap-2">
              {result.audit.issues.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} className="border border-lineStrong/60 bg-paperStrong px-3 py-2 text-inkSoft">
                  {issue.severity === "blocking" ? "阻断" : "提示"}：{issue.message}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
            {summaryItems.map(([label, value]) => (
              <span key={label} className="border border-lineStrong bg-paperStrong px-2 py-1">
                {label} {formatSummaryValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
