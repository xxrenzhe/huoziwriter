const TERMS_SECTIONS = [
  {
    id: "acceptance",
    title: "1. 接受条款",
    body:
      "访问或使用 Huozi Writer，即表示你同意遵守本条款。若你代表团队或机构使用本服务，你需要确保自己有权限代表该组织接受这些约束。",
  },
  {
    id: "account",
    title: "2. 账号与权限",
    body:
      "v1 不开放用户自助注册。所有账号均由运营后台手动创建并发放，首次登录后必须修改初始密码。你应妥善保管账号，不得向未授权第三方共享。",
  },
  {
    id: "subscription",
    title: "3. 订阅与退款",
    body:
      "当前套餐由后台手动配置，限制维度主要为生成次数、素材容量、公众号连接额度和高级功能开关。外部支付渠道尚未接入，账单与退订由运营后台或支持团队人工处理。",
  },
  {
    id: "content",
    title: "4. 内容归属与使用边界",
    body:
      "用户输入的素材、稿件、模板资产和生成结果归用户所有。平台仅在完成采集、生成、审校、排版、导出和同步所必需的范围内处理这些内容，不会擅自公开出售或转作训练语料。",
  },
  {
    id: "wechat",
    title: "5. 微信公众号同步",
    body:
      "如果你配置了公众号 appId 与 appSecret，系统将代表你完成 access token 获取、素材上传和草稿箱推送。你需要保证自己拥有该公众号的合法管理权限，并承担文章发布前的最终审核责任。",
  },
  {
    id: "security",
    title: "6. 安全与审计",
    body:
      "系统会记录必要的登录、模型路由变更、Prompt 版本切换、后台治理与微信同步日志，以用于故障排查、权限回溯和合规审计。若发现异常使用或安全风险，平台有权暂停服务。",
  },
  {
    id: "changes",
    title: "7. 条款变更",
    body:
      "当产品能力、套餐结构或数据处理边界发生实质性调整时，我们会更新本页内容。重大变更会优先通过站内公告、支持渠道或运营后台通知方式同步给受影响用户。",
  },
] as const;

export default function TermsPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit border border-stone-300/40 bg-white p-5 shadow-ink lg:sticky lg:top-28">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">目录</div>
        <nav className="mt-4 space-y-2">
          {TERMS_SECTIONS.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`block border-l-2 px-4 py-3 text-sm transition-colors ${
                index === 0
                  ? "border-cinnabar bg-cinnabar/5 font-medium text-cinnabar"
                  : "border-stone-200 text-stone-700 hover:border-stone-400 hover:bg-[#faf7f0]"
              }`}
            >
              {section.title}
            </a>
          ))}
        </nav>
      </aside>
      <article className="border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="border-b border-stone-200 pb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Terms of Service</div>
          <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl text-balance">服务条款</h1>
          <p className="mt-4 text-base leading-8 text-stone-700">最后更新：2026 年 4 月</p>
        </div>
        <div className="mt-8 space-y-10">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="font-serifCn text-2xl font-semibold text-ink text-balance">{section.title}</h2>
              <p className="mt-4 text-base leading-9 text-stone-700">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
