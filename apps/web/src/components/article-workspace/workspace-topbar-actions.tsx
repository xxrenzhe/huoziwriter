"use client";

import { Button } from "@huoziwriter/ui";
import Link from "next/link";

type WorkspaceTopbarActionsProps = {
  articleId: number;
  canExportPdf: boolean;
  onCopyMarkdown: () => void | Promise<void>;
  onDeleteArticle: () => void | Promise<void>;
  metadataHref?: string;
};

const menuItemClassName = "block border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft transition-colors hover:border-cinnabar hover:text-cinnabar";

export function WorkspaceTopbarActions({
  articleId,
  canExportPdf,
  onCopyMarkdown,
  onDeleteArticle,
  metadataHref = "#workspace-metadata",
}: WorkspaceTopbarActionsProps) {
  return (
    <details className="relative">
      <summary className="list-none border border-lineStrong bg-surface px-3 py-2 text-xs text-inkMuted transition-colors hover:border-cinnabar hover:text-cinnabar [&::-webkit-details-marker]:hidden">
        更多操作
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 grid min-w-[220px] gap-2 border border-lineStrong bg-surfaceWarm p-3 shadow-ink">
        <Button type="button" onClick={() => void onCopyMarkdown()} variant="secondary" size="sm" className="justify-start text-left">
          复制纯净 Markdown
        </Button>
        <Link href={`/api/articles/${articleId}/export?format=markdown`} className={menuItemClassName}>
          导出 Markdown
        </Link>
        <Link href={`/api/articles/${articleId}/export?format=html`} className={menuItemClassName}>
          导出 HTML
        </Link>
        <Link
          href={`/api/articles/${articleId}/export?format=pdf`}
          className={`${menuItemClassName} ${canExportPdf ? "border-cinnabar bg-cinnabar text-white hover:text-white" : "text-inkMuted"}`}
        >
          {canExportPdf ? "导出 PDF" : "PDF 需升级套餐"}
        </Link>
        <Link href={metadataHref} className={menuItemClassName}>
          稿件元信息
        </Link>
        <Button type="button" onClick={() => void onDeleteArticle()} variant="secondary" size="sm" className="justify-start border-danger/30 text-danger hover:border-danger/40 hover:bg-red-50">
          删除稿件
        </Button>
      </div>
    </details>
  );
}
