import { AdminOverview } from "@/components/admin-views";

export default function AdminOverviewPage() {
  return (
    <AdminOverview
      title="后台既要能看经营指标，也要能看系统健康。"
      description="v1 后台覆盖用户管理、套餐语义、Prompt 版本、模型路由、微信草稿箱推送和业务指标。"
      metrics={[
        { label: "MRR", value: "￥38,620", note: "先保留套餐与账务结构，不接外部订阅渠道。" },
        { label: "活跃 Pro 用户", value: "61", note: "主力收入来自执毫与藏锋。" },
        { label: "微信成功率", value: "97.4%", note: "重点监控 token 失效与素材上传失败。" },
      ]}
      panels={[
        { title: "用户与权限", description: "默认管理员 huozi，普通用户全部由后台手动创建。", meta: "Users" },
        { title: "Prompt 版本", description: "复用 autobb 的 prompt_versions 思路，支持激活与回滚。", meta: "Prompts" },
        { title: "模型与业务", description: "把生成、净化、推送、计费统计拆成独立运维面板。", meta: "Ops" },
      ]}
    />
  );
}
