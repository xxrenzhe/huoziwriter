import { Button, Input, Select } from "@huoziwriter/ui";

type SeriesOption = {
  id: number;
  name: string;
  personaName: string;
  activeStatus: string;
};

type WorkspaceControlsBarProps = {
  title: string;
  onChangeTitle: (value: string) => void;
  seriesId: number | null;
  seriesOptions: SeriesOption[];
  onChangeSeriesId: (value: number | null) => void;
  onSave: () => void | Promise<unknown>;
  generating: boolean;
  generateBlockedByResearch: boolean;
  hasWritingOverride: boolean;
  onGenerate: () => void | Promise<unknown>;
  onGoToResearchStep: () => void | Promise<unknown>;
  updatingWorkflow: boolean;
};

export function WorkspaceControlsBar({
  title,
  onChangeTitle,
  seriesId,
  seriesOptions,
  onChangeSeriesId,
  onSave,
  generating,
  generateBlockedByResearch,
  hasWritingOverride,
  onGenerate,
  onGoToResearchStep,
  updatingWorkflow,
}: WorkspaceControlsBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        aria-label="稿件标题"
        value={title}
        onChange={(event) => onChangeTitle(event.target.value)}
        className="min-w-0 flex-1 basis-full md:min-w-[240px] md:basis-auto"
      />
      <Select
        aria-label="稿件系列"
        value={seriesId ?? ""}
        onChange={(event) => onChangeSeriesId(event.target.value ? Number(event.target.value) : null)}
        className="min-w-0 basis-full md:min-w-[220px] md:basis-auto"
      >
        <option value="">{seriesOptions.length > 0 ? "选择稿件系列" : "请先创建系列"}</option>
        {seriesOptions.map((series) => (
          <option key={series.id} value={series.id}>
            {series.name} · {series.personaName}{series.activeStatus !== "active" ? " · 非经营中" : ""}
          </option>
        ))}
      </Select>
      <Button onClick={() => void onSave()} variant="secondary" className="flex-1 md:flex-none">
        保存
      </Button>
      <Button onClick={() => void onGenerate()} disabled={generating || generateBlockedByResearch} variant="primary" className="flex-1 md:flex-none">
        {generating
          ? "生成中…"
          : generateBlockedByResearch
            ? "先补研究信源"
            : hasWritingOverride
              ? "应用当前写作切换后生成"
              : "流式生成"}
      </Button>
      {generateBlockedByResearch ? (
        <Button onClick={() => void onGoToResearchStep()} disabled={updatingWorkflow} variant="secondary" className="flex-1 md:flex-none">
          去补研究层
        </Button>
      ) : null}
    </div>
  );
}
