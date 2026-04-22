type SelectedSeriesLike = {
  name: string;
  personaName: string;
  thesis?: string | null;
  targetAudience?: string | null;
} | null;

type WorkspaceSeriesNoticeProps = {
  selectedSeries: SelectedSeriesLike;
};

export function WorkspaceSeriesNotice({ selectedSeries }: WorkspaceSeriesNoticeProps) {
  if (selectedSeries) {
    return (
      <div data-command-chrome="true" className="mt-4 border border-lineStrong/40 bg-paperStrong px-4 py-4 text-sm leading-7 text-inkSoft">
        当前稿件归属「{selectedSeries.name}」，绑定人设为 {selectedSeries.personaName}。
        {selectedSeries.thesis ? ` 核心判断：${selectedSeries.thesis}` : ""}
        {selectedSeries.targetAudience ? ` 目标读者：${selectedSeries.targetAudience}` : ""}
      </div>
    );
  }

  return (
    <div data-command-chrome="true" className="mt-4 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
      当前稿件还没有绑定系列。请先完成系列绑定，再继续推进策略、证据和发布步骤。
    </div>
  );
}
