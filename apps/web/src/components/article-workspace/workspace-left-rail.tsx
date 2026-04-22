import type { ComponentProps } from "react";
import { Button, Input } from "@huoziwriter/ui";
import { ArticleOutlineClient } from "../article-outline-client";

type SnapshotLike = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type WorkspaceLeftRailProps = {
  isCollectPhase: boolean;
  outlinePanel: Pick<ComponentProps<typeof ArticleOutlineClient>, "articleId" | "nodes" | "fragments" | "onChange">;
  snapshotNote: string;
  onChangeSnapshotNote: (value: string) => void;
  onCreateSnapshot: () => void | Promise<void>;
  snapshots: SnapshotLike[];
  loadingDiffId: number | null;
  onLoadDiff: (snapshotId: number) => void | Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => void | Promise<void>;
};

export function WorkspaceLeftRail({
  isCollectPhase,
  outlinePanel,
  snapshotNote,
  onChangeSnapshotNote,
  onCreateSnapshot,
  snapshots,
  loadingDiffId,
  onLoadDiff,
  onRestoreSnapshot,
}: WorkspaceLeftRailProps) {
  return (
    <aside className="min-w-0 space-y-4 border border-lineStrong/40 bg-surfaceWarm p-5">
      <div className="border border-lineStrong/50 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
        <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">
          {isCollectPhase ? "采集阶段" : "构思阶段"}
        </div>
        <div className="mt-2">
          {isCollectPhase
            ? "先在这里挂素材、整理节点和保存关键快照。当前阶段不强调成稿句子。"
            : "当前优先看节点之间怎么推进、哪些素材该挂到哪一段，不急着追求完整正文。"}
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">大纲树与素材挂载</div>
        <div className="mt-4">
          <ArticleOutlineClient {...outlinePanel} />
        </div>
      </div>
      <div className="border-t border-lineStrong/60 pt-4">
        <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">快照管理</div>
        <div className="mt-3 flex gap-2">
          <Input
            aria-label="快照备注"
            value={snapshotNote}
            onChange={(event) => onChangeSnapshotNote(event.target.value)}
            placeholder="快照备注"
            className="min-w-0 flex-1"
          />
          <Button onClick={() => void onCreateSnapshot()} variant="primary" size="sm">
            存档
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {snapshots.slice(0, 6).map((snapshot) => (
            <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
              <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
              <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
              <div className="mt-3 flex gap-2 text-xs">
                <Button onClick={() => void onLoadDiff(snapshot.id)} variant="secondary" size="sm">
                  {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                </Button>
                <Button onClick={() => void onRestoreSnapshot(snapshot.id)} variant="secondary" size="sm">
                  回滚
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
