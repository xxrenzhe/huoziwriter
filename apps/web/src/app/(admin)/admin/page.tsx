import { AdminOverview } from "@/components/admin-views";
import { getDatabase } from "@/lib/db";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminBusinessOverview, getModelRoutes, getPlans, getPromptVersions, getUsers } from "@/lib/repositories";

export default async function AdminOverviewPage() {
  await requireAdminSession();
  const [users, plans, prompts, routes, imageEngine, business] = await Promise.all([
    getUsers(),
    getPlans(),
    getPromptVersions(),
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getAdminBusinessOverview(),
  ]);
  const db = getDatabase();
  const [documents, fragments, syncSuccess, knowledgeCards, auditLogs] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM audit_logs"),
  ]);

  const activeUsers = users.filter((user) => Boolean(user.is_active)).length;
  const activePromptVersions = prompts.filter((prompt) => Boolean(prompt.is_active)).length;
  return (
    <AdminOverview
      title="后台既要看经营指标，也要看写作主链路有没有真的跑起来。"
      description="当前后台已经接入用户管理、套餐结构、Prompt 版本、模型路由和微信草稿箱发布统计，默认管理员为 huozi。"
      metrics={[
        { label: "激活用户", value: String(activeUsers), note: `总用户 ${users.length} 个，全部由后台手动创建。` },
        { label: "写作资产", value: String((documents?.count ?? 0) + (fragments?.count ?? 0)), note: `文稿 ${(documents?.count ?? 0)} 篇，碎片 ${(fragments?.count ?? 0)} 条。` },
        { label: "主题档案", value: String(knowledgeCards?.count ?? 0), note: "系统已沉淀的结构化主题档案数量。" },
        { label: "微信成功推送", value: String(syncSuccess?.count ?? 0), note: "这里统计真实写入公众号草稿箱成功的次数。" },
        { label: "审计事件", value: String(auditLogs?.count ?? 0), note: "配置变更、重编译、排版基因 Fork/发布等关键动作都会写入审计日志。" },
        { label: "归因转化", value: String(business.activePaidReferralCount), note: `有效付费归因 ${business.activePaidReferralCount} 个，预计月佣金 ￥${business.estimatedMonthlyCommissionCny}。` },
        { label: "生图引擎", value: imageEngine.hasApiKey ? "已配置" : "未配置", note: imageEngine.baseUrl ? `${imageEngine.model} · ${imageEngine.baseUrl}` : "封面图生成仍需管理员补充 Base_URL 与 API Key。" },
      ]}
      panels={[
        { title: "用户与权限", description: "默认管理员 huozi，普通用户不开放自助注册，所有账号都走后台发放。", meta: "Users" },
        { title: "主题档案治理", description: "冲突、过期、低置信度档案可以在后台统一重编译和调整状态。", meta: "Knowledge" },
        { title: "审计日志", description: "后台可以按动作、目标类型和操作人回看关键改动，避免把配置治理和业务动作混在口头描述里。", meta: "Audit" },
        { title: "Prompt 版本", description: `当前共 ${prompts.length} 条 Prompt 版本记录，正在生效的版本 ${activePromptVersions} 条。`, meta: "Prompts" },
        { title: "模型与路由", description: `当前维护 ${routes.length} 条模型路由，套餐结构已初始化 ${plans.length} 档。`, meta: "Ops" },
        { title: "经营面", description: `当前累计归因用户 ${business.referredUserCount} 个，分销榜单可在业务总览继续查看。`, meta: "Growth" },
        { title: "生图 AI 引擎", description: imageEngine.hasApiKey ? `当前默认模型 ${imageEngine.model}，最后更新于 ${imageEngine.updatedAt ? new Date(imageEngine.updatedAt).toLocaleString("zh-CN") : "未记录"}。` : "全局生图引擎尚未配置，封面图生成会失败。", meta: "Image" },
      ]}
    />
  );
}
