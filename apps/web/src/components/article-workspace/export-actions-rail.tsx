import { Button } from "@huoziwriter/ui";
import Link from "next/link";

type ExportActionsRailProps = {
  articleId: number;
  canExportPdf: boolean;
  onCopyMarkdown: () => void | Promise<void>;
};

export function ExportActionsRail({
  articleId,
  canExportPdf,
  onCopyMarkdown,
}: ExportActionsRailProps) {
  return (
    <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
      <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">导出</div>
      <div className="mt-3 grid gap-2">
        <Button onClick={() => void onCopyMarkdown()} variant="secondary" className="justify-start text-left">
          复制纯净 Markdown
        </Button>
        <Link href={`/api/articles/${articleId}/export?format=markdown`} className="border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
          导出 Markdown
        </Link>
        <Link href={`/api/articles/${articleId}/export?format=html`} className="border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
          导出 HTML
        </Link>
        <Link
          href={`/api/articles/${articleId}/export?format=pdf`}
          className={`border px-4 py-3 text-sm ${canExportPdf ? "border-cinnabar bg-cinnabar text-white" : "border-lineStrong bg-surface text-inkMuted"}`}
        >
          {canExportPdf ? "导出 PDF" : "PDF 需升级付费套餐"}
        </Link>
      </div>
    </div>
  );
}
