import { PricingMatrix } from "@/components/marketing-views";

export default function PricingPage() {
  return (
    <PricingMatrix
      plans={[
        {
          name: "游墨",
          price: "￥0",
          tagline: "Free",
          features: ["50 条碎片上限", "每日 1 次生成", "仅文本配图建议", "最近 3 天历史快照"],
        },
        {
          name: "执毫",
          price: "￥108/月",
          tagline: "Pro",
          features: ["无限碎片", "每日 10 次生成", "微信草稿箱真实同步", "无限自定义死刑词库"],
          featured: true,
        },
        {
          name: "藏锋",
          price: "￥298/月",
          tagline: "Ultra",
          features: ["高优先级生成通道", "100 次封面图生成", "多个公众号矩阵", "无限历史快照与 PDF 导出"],
        },
        {
          name: "团队",
          price: "定制",
          tagline: "Team",
          features: ["共享碎片池", "共享禁用词库", "团队级权限控制", "团队共享情绪罗盘信息源"],
        },
      ]}
    />
  );
}
