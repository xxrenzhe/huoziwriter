import { Button } from "@huoziwriter/ui";
import { buildPublishMethodologyGates } from "@/lib/publish-methodology-gates";
import { getWeakestWritingQualityLayerSummary } from "@/lib/article-workspace-helpers";
import {
  formatAiNoiseLevel,
  formatConnectionStatus,
  formatPublishFailureCode,
  formatPublishGuardStatus,
  formatPublishStageStatus,
  formatWritingQualityStatus,
} from "@/lib/article-workspace-formatters";
import type { WorkspacePublishPreviewState } from "./types";
import { WechatNativePreview } from "../wechat-native-preview";

const RESEARCH_GUARD_CHECK_KEYS = new Set([
  "researchBrief",
  "researchSourceCoverage",
  "researchTimeline",
  "researchComparison",
  "researchIntersection",
  "counterEvidence",
]);

function isResearchGuardCheckKey(value: string) {
  return RESEARCH_GUARD_CHECK_KEYS.has(value);
}

type PublishGuardCheck = WorkspacePublishPreviewState["publishGuard"]["checks"][number];

type WechatPublishPreviewSectionProps = {
  loadingPublishPreview: boolean;
  hasUnsavedWechatRenderInputs: boolean;
  publishPreview: WorkspacePublishPreviewState | null;
  onLoadPublishPreview: () => void | Promise<void>;
  onUpdateWorkflowStage: (stageCode: string) => void;
  onRetryLatestPublish: () => void | Promise<void>;
  retryingPublish: boolean;
  canRetryPublish: boolean;
  onSwitchToPreview: () => void;
  onRefreshPublishPreviewRender: () => void | Promise<void>;
  refreshingPublishPreview: boolean;
  previewFallbackTitle: string;
  authorName?: string;
};

export function WechatPublishPreviewSection({
  loadingPublishPreview,
  hasUnsavedWechatRenderInputs,
  publishPreview,
  onLoadPublishPreview,
  onUpdateWorkflowStage,
  onRetryLatestPublish,
  retryingPublish,
  canRetryPublish,
  onSwitchToPreview,
  onRefreshPublishPreviewRender,
  refreshingPublishPreview,
  previewFallbackTitle,
  authorName,
}: WechatPublishPreviewSectionProps) {
  const renderGuardCheckCard = (check: PublishGuardCheck) => (
    <div key={check.key} className="flex flex-wrap items-start justify-between gap-3 border border-lineStrong bg-paperStrong px-3 py-3 text-sm">
      <div>
        <div className="font-medium text-ink">{check.label}</div>
        <div className="mt-1 leading-6 text-inkSoft">{check.detail}</div>
        {check.actionLabel && check.targetStageCode ? (
          <Button
            type="button"
            onClick={() => onUpdateWorkflowStage(check.targetStageCode!)}
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            {check.actionLabel}
          </Button>
        ) : null}
      </div>
      <div className={`shrink-0 text-xs ${
        check.status === "passed"
          ? "text-emerald-700"
          : check.status === "warning"
            ? "text-warning"
            : "text-danger"
      }`}>
        {check.status === "passed" ? "通过" : check.status === "warning" ? "需关注" : "拦截"}
      </div>
    </div>
  );

  return (
    <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">发布前最终预览</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            这里展示的是当前标题、正文和模板组合后，真正会提交给微信草稿箱的最终 HTML。
          </div>
        </div>
        <Button
          onClick={() => void onLoadPublishPreview()}
          disabled={loadingPublishPreview}
          variant="secondary"
          size="sm"
        >
          {loadingPublishPreview ? "生成中…" : "生成最终预览"}
        </Button>
      </div>
      {hasUnsavedWechatRenderInputs ? (
        <div className="mt-3 border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
          检测到标题、正文或模板选择尚未保存。正式发布时系统会先保存，再按最终状态重新渲染。
        </div>
      ) : null}
      {publishPreview ? (() => {
        const researchGuardChecks = publishPreview.publishGuard.checks.filter((check) => isResearchGuardCheckKey(check.key));
        const otherGuardChecks = publishPreview.publishGuard.checks.filter((check) => !isResearchGuardCheckKey(check.key));
        const methodologyGates = buildPublishMethodologyGates(publishPreview.publishGuard.checks);
        const methodologyBlockedCount = methodologyGates.filter((gate) => gate.status === "blocked").length;
        const methodologyWarningCount = methodologyGates.filter((gate) => gate.status === "warning").length;
        const researchBlockedCount = researchGuardChecks.filter((check) => check.status === "blocked").length;
        const researchWarningCount = researchGuardChecks.filter((check) => check.status === "warning").length;
        const otherBlockedCount = otherGuardChecks.filter((check) => check.status === "blocked").length;
        const otherWarningCount = otherGuardChecks.filter((check) => check.status === "warning").length;

        return (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究拦截</div>
                <div className="mt-2 font-serifCn text-2xl text-danger text-balance">{researchBlockedCount}</div>
              </div>
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究待补</div>
                <div className="mt-2 font-serifCn text-2xl text-warning text-balance">{researchWarningCount}</div>
              </div>
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他拦截</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{otherBlockedCount}</div>
              </div>
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他警告</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{otherWarningCount}</div>
              </div>
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">AI 噪声</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{publishPreview.publishGuard.aiNoise.score}</div>
              </div>
              <div className="border border-lineStrong bg-paperStrong px-3 py-3 text-sm text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">素材挂载</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{publishPreview.publishGuard.materialReadiness.attachedFragmentCount}</div>
              </div>
            </div>
            <div className={`border px-3 py-3 text-sm leading-7 ${
              publishPreview.publishGuard.canPublish
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-danger/30 bg-surface text-danger"
            }`}>
              {publishPreview.publishGuard.canPublish
                ? "发布守门检查已通过。"
                : `发布守门检查未通过：${publishPreview.publishGuard.blockers.join("；")}`}
            </div>
            <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">发布前六道闸门</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    按方案 17 的总控口径，把研究、证据、爆点、四元强度、语言守卫和原型节奏收成一列，方便一屏决策。
                  </div>
                </div>
                <div className="grid min-w-[220px] gap-2 sm:grid-cols-3">
                  <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                    <div className="uppercase tracking-[0.14em] text-inkMuted">总项</div>
                    <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{methodologyGates.length}</div>
                  </div>
                  <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                    <div className="uppercase tracking-[0.14em] text-inkMuted">拦截</div>
                    <div className="mt-2 font-serifCn text-2xl text-danger text-balance">{methodologyBlockedCount}</div>
                  </div>
                  <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                    <div className="uppercase tracking-[0.14em] text-inkMuted">待补</div>
                    <div className="mt-2 font-serifCn text-2xl text-warning text-balance">{methodologyWarningCount}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {methodologyGates.map((gate, index) => (
                  <div key={gate.code} className="border border-lineStrong bg-surface px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="border border-lineStrong bg-paperStrong px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="font-medium text-ink">{gate.label}</div>
                        </div>
                        <div className="mt-2 leading-6 text-inkSoft">{gate.detail}</div>
                        {gate.actionLabel && gate.targetStageCode ? (
                          <Button
                            type="button"
                            onClick={() => onUpdateWorkflowStage(gate.targetStageCode!)}
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                          >
                            {gate.actionLabel}
                          </Button>
                        ) : null}
                      </div>
                      <div className={`shrink-0 text-xs ${
                        gate.status === "passed"
                          ? "text-emerald-700"
                          : gate.status === "warning"
                            ? "text-warning"
                            : "text-danger"
                      }`}>
                        {formatPublishGuardStatus(gate.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">阶段完成定义</div>
              <div className="mt-3 grid gap-2">
                {publishPreview.publishGuard.stageReadiness.map((stage) => (
                  <div key={stage.stageCode} className="flex flex-wrap items-start justify-between gap-3 border border-lineStrong bg-surface px-3 py-3 text-sm">
                    <div>
                      <div className="font-medium text-ink">{stage.title}</div>
                      <div className="mt-1 leading-6 text-inkSoft">{stage.detail}</div>
                    </div>
                    <div className={`text-xs ${
                      stage.status === "ready" ? "text-emerald-700" : stage.status === "blocked" ? "text-danger" : "text-warning"
                    }`}>
                      {formatPublishStageStatus(stage.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
              {(() => {
                const weakestLayer = getWeakestWritingQualityLayerSummary(publishPreview.publishGuard.qualityPanel);
                if (!weakestLayer) {
                  return null;
                }
                return (
                  <div className={`mb-3 border px-4 py-3 text-sm leading-7 ${
                    weakestLayer.status === "blocked"
                      ? "border-danger/30 bg-surface text-danger"
                      : weakestLayer.status === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning text-warning"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}>
                    当前优先修复：{weakestLayer.title}。{weakestLayer.suggestion}
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">四层质检面板</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    发布前同时看硬规则、风格一致性、内容质量和活人感，避免只盯单个分数。
                  </div>
                </div>
                <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                  总分 {publishPreview.publishGuard.qualityPanel.overallScore}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {publishPreview.publishGuard.qualityPanel.layers.map((layer) => (
                  <div key={layer.code} className="border border-lineStrong bg-surface px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-ink">{layer.title}</div>
                      <div className={`text-xs ${
                        layer.status === "ready" ? "text-emerald-700" : layer.status === "blocked" ? "text-danger" : "text-warning"
                      }`}>
                        {formatWritingQualityStatus(layer.status)} · {layer.score}
                      </div>
                    </div>
                    <div className="mt-2 leading-6 text-inkSoft">{layer.summary}</div>
                    {layer.issues.length > 0 ? (
                      <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                        {layer.issues.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    ) : null}
                    {layer.suggestions.length > 0 ? (
                      <div className="mt-3 border border-lineStrong/60 bg-paperStrong px-3 py-3 text-xs leading-6 text-inkSoft">
                        {layer.suggestions[0]}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {researchGuardChecks.length > 0 ? (
                <div className="border border-warning/40 bg-surfaceWarm px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究底座守门</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        这组检查专门看是否真的研究透了，再决定正文判断能不能写硬。
                      </div>
                    </div>
                    <div className="grid min-w-[220px] gap-2 sm:grid-cols-3">
                      <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                        <div className="uppercase tracking-[0.14em] text-inkMuted">总项</div>
                        <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{researchGuardChecks.length}</div>
                      </div>
                      <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                        <div className="uppercase tracking-[0.14em] text-inkMuted">拦截</div>
                        <div className="mt-2 font-serifCn text-2xl text-danger text-balance">{researchBlockedCount}</div>
                      </div>
                      <div className="border border-lineStrong bg-surface px-3 py-3 text-xs text-inkSoft">
                        <div className="uppercase tracking-[0.14em] text-inkMuted">待补</div>
                        <div className="mt-2 font-serifCn text-2xl text-warning text-balance">{researchWarningCount}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {researchGuardChecks.map(renderGuardCheckCard)}
                  </div>
                </div>
              ) : null}

              {otherGuardChecks.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">其他发布检查</div>
                  <div className="grid gap-2">
                    {otherGuardChecks.map(renderGuardCheckCard)}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">连接自检</div>
                <div className="mt-2 font-medium text-ink">{publishPreview.publishGuard.connectionHealth.connectionName || "未选择连接"}</div>
                <div className="mt-2">状态：{formatConnectionStatus(publishPreview.publishGuard.connectionHealth.status)}</div>
                <div className="mt-1">{publishPreview.publishGuard.connectionHealth.detail}</div>
                <div className="mt-1 text-xs text-inkMuted">
                  {publishPreview.publishGuard.connectionHealth.tokenExpiresAt
                    ? `访问令牌到期：${new Date(publishPreview.publishGuard.connectionHealth.tokenExpiresAt).toLocaleString("zh-CN")}`
                    : "尚未记录访问令牌到期时间"}
                </div>
              </div>
              <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">AI 噪声与素材</div>
                <div className="mt-2">噪声等级：{formatAiNoiseLevel(publishPreview.publishGuard.aiNoise.level)}</div>
                <div className="mt-1">信源类型：{publishPreview.publishGuard.materialReadiness.uniqueSourceTypeCount}</div>
                <div className="mt-1">截图证据：{publishPreview.publishGuard.materialReadiness.screenshotCount}</div>
                {publishPreview.publishGuard.aiNoise.findings.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs text-inkMuted">
                    {publishPreview.publishGuard.aiNoise.findings.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {publishPreview.publishGuard.warnings.length > 0 ? (
              <div className="space-y-2">
                {publishPreview.publishGuard.warnings.map((warning) => (
                  <div key={warning} className="border border-warning/40 bg-surfaceWarning px-3 py-3 text-xs leading-6 text-warning">
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            {publishPreview.publishGuard.suggestions.length > 0 ? (
              <div className="space-y-2">
                {publishPreview.publishGuard.suggestions.map((suggestion) => (
                  <div key={suggestion} className="border border-lineStrong bg-paperStrong px-3 py-3 text-xs leading-6 text-inkMuted">
                    {suggestion}
                  </div>
                ))}
              </div>
            ) : null}
            {publishPreview.publishGuard.latestAttempt ? (
              <div className={`border px-4 py-4 text-sm leading-7 ${
                publishPreview.publishGuard.latestAttempt.status === "failed"
                  ? "border-danger/30 bg-surface text-danger"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}>
                <div className="text-xs uppercase tracking-[0.18em]">最近一次发布尝试</div>
                <div className="mt-2">
                  {new Date(publishPreview.publishGuard.latestAttempt.createdAt).toLocaleString("zh-CN")} ·
                  {publishPreview.publishGuard.latestAttempt.status === "failed" ? " 失败" : " 成功"}
                </div>
                {publishPreview.publishGuard.latestAttempt.status === "failed" ? (
                  <div className="mt-1">
                    {publishPreview.publishGuard.latestAttempt.failureReason || "未记录失败原因"}
                    {publishPreview.publishGuard.latestAttempt.failureCode ? ` · ${formatPublishFailureCode(publishPreview.publishGuard.latestAttempt.failureCode)}` : ""}
                  </div>
                ) : (
                  <div className="mt-1">
                    {publishPreview.publishGuard.latestAttempt.mediaId ? `草稿媒体 ID：${publishPreview.publishGuard.latestAttempt.mediaId}` : "最近一次推送成功。"}
                  </div>
                )}
                {publishPreview.publishGuard.latestAttempt.status === "failed" ? (
                  <Button
                    type="button"
                    onClick={() => void onRetryLatestPublish()}
                    disabled={retryingPublish || !canRetryPublish}
                    variant="secondary"
                    size="sm"
                    className="mt-3 border-cinnabar px-4 text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                  >
                    {retryingPublish ? "重试中…" : "按最近失败上下文重试"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className={publishPreview.isConsistentWithSavedHtml ? "text-emerald-700" : "text-danger"}>
                {publishPreview.isConsistentWithSavedHtml ? "当前保存版与最终发布效果一致" : "当前保存版与最终发布效果不一致"}
              </div>
              <div className="text-xs text-inkMuted">
                {new Date(publishPreview.generatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(publishPreview.templateSummary.length ? publishPreview.templateSummary : ["默认微信渲染"]).map((item) => (
                <span key={`publish-preview-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                  {item}
                </span>
              ))}
            </div>
            {publishPreview.templateName ? (
              <div className="text-xs text-inkMuted">
                模板：{publishPreview.templateName}{publishPreview.templateVersion ? ` · ${publishPreview.templateVersion}` : ""}
                {publishPreview.templateOwnerLabel ? ` · ${publishPreview.templateOwnerLabel}` : ""}
                {publishPreview.templateSourceLabel ? ` · 来源 ${publishPreview.templateSourceLabel}` : ""}
              </div>
            ) : null}
            {publishPreview.mismatchWarnings.length ? (
              <div className="space-y-2">
                {publishPreview.mismatchWarnings.map((warning) => (
                  <div key={warning} className="border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSwitchToPreview} variant="secondary" size="sm">
                在中间栏查看
              </Button>
              {!publishPreview.isConsistentWithSavedHtml ? (
                <Button
                  onClick={() => void onRefreshPublishPreviewRender()}
                  disabled={refreshingPublishPreview}
                  variant="secondary"
                  size="sm"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {refreshingPublishPreview ? "刷新中…" : "刷新为最终发布效果"}
                </Button>
              ) : null}
            </div>
            <div className="border border-lineStrong bg-surfaceHighlight">
              <WechatNativePreview
                html={publishPreview.finalHtml || ""}
                title={publishPreview.title || previewFallbackTitle}
                authorName={authorName}
                accountName={publishPreview.publishGuard.connectionHealth.connectionName || undefined}
              />
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
