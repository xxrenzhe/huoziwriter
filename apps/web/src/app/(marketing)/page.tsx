import { EditorialFeatureGrid, MarketingHero } from "@/components/marketing-views";

export default function LandingPage() {
  return (
    <div>
      <MarketingHero />
      <EditorialFeatureGrid
        title="从输入、生成、净化到分发，整条链路都围绕中文写作者重做。"
        description="活字不是通用聊天框外面套一层包装，而是一套专门解决中文内容工作流问题的写作 SaaS。"
        items={[
          { title: "全域采集", description: "v1 支持手输碎片、URL 穿透解析和截图上传，所有内容统一进入碎片库。", meta: "Capture" },
          { title: "四栏工作台", description: "先搭节点，再写正文，再挂碎片，生成过程用流式打字机输出。", meta: "Workspace" },
          { title: "死刑词库", description: "把写作者厌恶的黑话变成系统级约束，而不是生成后再祈祷。", meta: "Language" },
          { title: "真实微信推送", description: "v1 直接推送到微信公众号草稿箱，不做假占位。", meta: "Distribution" },
        ]}
      />
    </div>
  );
}
