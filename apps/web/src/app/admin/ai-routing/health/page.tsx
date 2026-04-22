import Link from "next/link";
import { getCredentialHealthMatrix, type AiCredentialHealthStatus, type AiCredentialProviderHealth } from "@/lib/ai-credentials-health";
import { requireAdminSession } from "@/lib/page-auth";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const mutedPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted p-5 text-adminInk shadow-none");
const actionClassName = buttonStyles({ variant: "secondary", size: "sm" });
const eyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const accentEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminAccent";

function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatLatency(value: number | null) {
  if (value == null) {
    return "--";
  }
  return `${value} ms`;
}

function getStatusLabel(status: AiCredentialHealthStatus) {
  if (status === "healthy") return "健康";
  if (status === "missing_env") return "缺凭据";
  if (status === "probe_failed") return "探针失败";
  return "未使用";
}

function getStatusBadgeClassName(status: AiCredentialHealthStatus) {
  if (status === "healthy") {
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "missing_env") {
    return "border border-cinnabar/40 bg-cinnabar/10 text-cinnabar";
  }
  if (status === "probe_failed") {
    return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border border-adminLineStrong bg-adminSurfaceAlt text-adminInkMuted";
}

function getProviderTitle(provider: AiCredentialProviderHealth["provider"]) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Gemini";
}

function getSceneSummary(entry: AiCredentialProviderHealth) {
  if (entry.sceneCodes.length === 0) {
    return "当前没有绑定 scene";
  }
  return entry.sceneCodes.join("、");
}

export default async function AdminAiRoutingHealthPage() {
  await requireAdminSession();
  const matrix = await getCredentialHealthMatrix();
  const healthyCount = matrix.providers.filter((item) => item.status === "healthy").length;
  const affectedSceneCount = matrix.providers
    .filter((item) => item.status !== "healthy" && item.status !== "unused")
    .reduce((sum, item) => sum + item.sceneCodes.length, 0);

  return (
    <section className="space-y-6">
      <article className={cn(panelClassName, "grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end")}>
        <div>
          <div className={accentEyebrowClassName}>AI Routing Health</div>
          <h1 className="mt-4 font-serifCn text-4xl text-adminInk text-balance">Provider 凭据与探针健康矩阵</h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-adminInkSoft">
            按 `ai_model_routes` 去重 scene / model，按 provider 聚合后做最小探针请求。结果缓存 {matrix.ttlSeconds} 秒，避免后台频繁刷新时重复打三家 provider。
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-adminInkMuted">
            最近生成 {formatDateTime(matrix.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/ai-routing" className={actionClassName}>
            返回路由页
          </Link>
          <Link href="/admin/ai-routing/health" className={actionClassName}>
            手动刷新
          </Link>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-3">
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>健康 provider</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{healthyCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">当前三家 provider 中，有 {healthyCount} 家通过最小探针。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>受影响 scene</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{affectedSceneCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">缺凭据或探针失败时，会把当前绑定 scene 一并标出来。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>缓存窗口</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{matrix.ttlSeconds}s</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">探针不经过业务统计链路，也不会写入 AI 调用观测。</p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {matrix.providers.map((entry) => (
          <article key={entry.provider} className={panelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={eyebrowClassName}>{getProviderTitle(entry.provider)}</div>
                <h2 className="mt-3 font-serifCn text-3xl text-adminInk text-balance">{getStatusLabel(entry.status)}</h2>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(entry.status))}>
                {getStatusLabel(entry.status)}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className={mutedPanelClassName}>
                <div className={eyebrowClassName}>最近探针</div>
                <div className="mt-2 text-sm text-adminInk">{formatDateTime(entry.lastProbeAt)}</div>
              </div>
              <div className={mutedPanelClassName}>
                <div className={eyebrowClassName}>探针模型</div>
                <div className="mt-2 break-all text-sm text-adminInk">{entry.probeModel || "--"}</div>
              </div>
              <div className={mutedPanelClassName}>
                <div className={eyebrowClassName}>状态码 / 时延</div>
                <div className="mt-2 text-sm text-adminInk">
                  {entry.statusCode != null ? `HTTP ${entry.statusCode}` : "--"} · {formatLatency(entry.latencyMs)}
                </div>
              </div>
              <div className={mutedPanelClassName}>
                <div className={eyebrowClassName}>凭据</div>
                <div className="mt-2 text-sm text-adminInk">
                  {entry.envConfigured ? "已配置" : "缺失"} · {entry.envKeyLabel}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className={eyebrowClassName}>状态细节</div>
              <div className="mt-2 rounded-2xl border border-adminLineStrong bg-adminSurfaceMuted px-4 py-3 text-sm leading-7 text-adminInkSoft">
                {entry.error || (entry.status === "healthy" ? "探针返回正常。" : entry.status === "unused" ? "当前 ai_model_routes 没有使用该 provider。" : "未返回错误信息。")}
              </div>
            </div>

            <div className="mt-4">
              <div className={eyebrowClassName}>受影响 scene</div>
              <div className="mt-2 text-sm leading-7 text-adminInkSoft">{getSceneSummary(entry)}</div>
            </div>

            <div className="mt-4">
              <div className={eyebrowClassName}>覆盖模型</div>
              <div className="mt-2 text-sm leading-7 text-adminInkSoft">
                {entry.models.length > 0 ? entry.models.join("、") : "--"}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
