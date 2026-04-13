import { EditorialArticle } from "@/components/marketing-views";

export default function ManifestoPage() {
  return (
    <EditorialArticle
      title="文字不该是算法的排泄物"
      sections={[
        {
          title: "为什么做活字",
          body: "因为我们受够了“总而言之”和“不可否认”。今天的大多数 AI 写作工具，只是在把一套更高效的空话生成器卖给写作者。它们不要求你拥有真实碎片，不要求你做结构判断，也不在乎你写出来的东西有没有人味。",
        },
        {
          title: "我们反对什么",
          body: "我们反对把抽象套话误认为深刻，把数据抄写误认为分析，把排版模板误认为风格。活字希望把生成约束、事实召回、语言净化和微信排版都放在同一套系统里，而不是交给十几个互相割裂的工具。",
        },
        {
          title: "我们的判断",
          body: "AI 是印书机的活字盘，不是作者本人。它应该服务于你的判断，而不是反过来让你替它擦屁股。你提供碎片、立场与语感，系统才有资格替你加速。",
        },
      ]}
    />
  );
}
