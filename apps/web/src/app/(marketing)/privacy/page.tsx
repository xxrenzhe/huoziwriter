import { EditorialArticle } from "@/components/marketing-views";

export default function PrivacyPage() {
  return (
    <EditorialArticle
      title="隐私与数据边界"
      sections={[
        {
          title: "内容归属",
          body: "用户输入的碎片、草稿、排版模板与生成结果均归用户所有。平台只在提供写作、渲染、同步和审计能力所必需的范围内处理这些数据，不将其擅自公开、售卖或挪作训练素材。",
        },
        {
          title: "微信授权边界",
          body: "v1 使用用户手动填写的公众号 appId 与 appSecret 建立连接，仅用于 access token 获取、素材上传和草稿箱推送。系统不会自动群发，不会接管你的公众号运营行为。",
        },
        {
          title: "日志与审计",
          body: "后台保留必要的登录、账号管理、Prompt 版本切换与同步日志，用于安全审计和故障排查。日志展示给管理员时统一使用 camelCase API 字段，并区分业务数据与系统审计数据。",
        },
      ]}
    />
  );
}
