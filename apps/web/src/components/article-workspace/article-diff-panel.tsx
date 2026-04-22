type DiffStateLike = {
  snapshotNote: string | null;
  createdAt: string;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  lines: Array<{ type: "added" | "removed" | "unchanged"; content: string }>;
} | null;

type ArticleDiffPanelProps = {
  diffState: DiffStateLike;
};

export function ArticleDiffPanel({ diffState }: ArticleDiffPanelProps) {
  return (
    <div className="border border-warning/40 bg-surfaceWarm p-5 shadow-ink">
      <div className="text-xs uppercase tracking-[0.24em] text-warning">手稿校阅与比对</div>
      {diffState ? (
        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium text-ink">
            对比快照：{diffState.snapshotNote || "未命名快照"} · {new Date(diffState.createdAt).toLocaleString("zh-CN")}
          </div>
          <div className="flex gap-4 text-xs font-medium tracking-wide">
            <span className="text-emerald-700">+{diffState.summary.added} 增补</span>
            <span className="text-danger">-{diffState.summary.removed} 删减</span>
            <span className="text-warning">={diffState.summary.unchanged} 留存</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto border-t border-dashed border-warning/40 bg-[linear-gradient(transparent_31px,rgba(140,107,75,0.1)_32px)] bg-[length:100%_32px] pt-4 font-serifCn text-[15px] leading-8 text-ink">
            {diffState.lines.map((line, index) => (
              <span
                key={`${line.type}-${index}`}
                className={
                  line.type === "added"
                    ? "bg-emerald-50 text-emerald-800 underline decoration-emerald-300/60 decoration-wavy decoration-1 underline-offset-4"
                    : line.type === "removed"
                      ? "text-danger opacity-70 line-through decoration-danger/80 decoration-2"
                      : "text-ink"
                }
              >
                {line.content}
                {line.type !== "unchanged" && line.content ? " " : ""}
                {(!line.content || line.content.trim() === "") && <br />}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm leading-7 text-warning">
          从左侧「快照管理」列表中选择一个历史版本，即可像翻阅纸质手稿一般，查看它的批注与修改痕迹。
        </div>
      )}
    </div>
  );
}
