import { EditorialFeatureGrid } from "@/components/marketing-views";

export default function SupportPage() {
  return (
    <EditorialFeatureGrid
      title="联系活字"
      description="有 Bug、有灵感、要合作，或者只是想骂一句当前的大模型写作工具，都可以来。"
      items={[
        { title: "产品问题", description: "提供账号、时间、操作路径和截图，便于快速排查。", meta: "Support" },
        { title: "排版模板征集", description: "欢迎提交你自己的排版基因、公众号模板和风格规则。", meta: "Template" },
        { title: "商务合作", description: "适合内容团队、研究写作团队和公众号矩阵型客户。", meta: "Biz" },
        { title: "独立开发沟通", description: "长期欢迎直接交流产品路线、Prompt 机制和微信能力。", meta: "Founder" },
      ]}
    />
  );
}
