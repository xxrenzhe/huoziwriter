import { Button } from "@huoziwriter/ui";

type LayoutTemplateSummary = {
  metaLabel: string;
  name: string;
  description: string;
  sourceSummary: string;
  configSummary: string[];
};

type LayoutArtifactPanelProps = {
  selectedTemplate: LayoutTemplateSummary | null;
  applyingLayout: boolean;
  onApplyLayout: () => void;
};

export function LayoutArtifactPanel({
  selectedTemplate,
  applyingLayout,
  onApplyLayout,
}: LayoutArtifactPanelProps) {
  return (
    <div className="mt-4 space-y-3">
      <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
        当前排版会把所选模板直接应用到 HTML 预览、导出 HTML 与后续微信稿箱渲染，尽量保持三者一致。
      </div>
      {selectedTemplate ? (
        <div className="border border-lineStrong bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{selectedTemplate.metaLabel}</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedTemplate.name}</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">{selectedTemplate.description || "当前模板未填写说明。"}</div>
          <div className="mt-2 text-xs leading-6 text-inkMuted">来源：{selectedTemplate.sourceSummary}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTemplate.configSummary.map((item) => (
              <span key={`${selectedTemplate.name}-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          当前未显式选择模板，应用排版时会使用默认微信渲染样式。
        </div>
      )}
      <Button onClick={onApplyLayout} disabled={applyingLayout} variant="primary">
        {applyingLayout ? "应用中…" : "应用排版并查看 HTML"}
      </Button>
    </div>
  );
}
