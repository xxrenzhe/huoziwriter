import { Shield, ShieldCheck, Waypoints } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="border border-lineStrong/40 bg-surface px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Privacy Policy</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl text-balance">隐私协议</h1>
        <p className="mt-4 text-base leading-8 text-inkSoft">
          活字处理的是素材、草稿、模板资产和公众号连接，这些都属于高敏感写作资产。我们的原则很简单：只处理完成写作链路所必需的数据，不把你的内容偷渡成训练燃料。
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="border border-emerald-200 bg-emerald-50 p-6 shadow-ink">
          <div className="flex h-11 w-11 items-center justify-center border border-emerald-200 bg-surface text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <h2 className="mt-5 font-serifCn text-3xl text-ink text-balance">你的记忆，绝对私有。</h2>
          <p className="mt-4 text-sm leading-7 text-inkSoft">
            你输入的素材、草稿、排版模板与生成结果均归你所有。平台只在提供写作、渲染、同步和审计能力所必需的范围内处理这些数据，不将其擅自公开、售卖或转作基础模型训练素材。
          </p>
        </article>
        <article className="border border-sky-200 bg-sky-50 p-6 shadow-ink">
          <div className="flex h-11 w-11 items-center justify-center border border-sky-200 bg-surface text-sky-700">
            <Waypoints size={18} />
          </div>
          <h2 className="mt-5 font-serifCn text-3xl text-ink text-balance">微信授权说明。</h2>
          <p className="mt-4 text-sm leading-7 text-inkSoft">
            你可以填写公众号 AppID 与 AppSecret 建立连接，仅用于获取访问令牌、上传素材和推送草稿。系统不会自动群发，不会接管你的公众号运营行为。
          </p>
        </article>
      </section>
      <article className="border border-lineStrong/40 bg-surface px-6 py-10 shadow-ink md:px-10">
        <div className="flex items-center gap-3 text-cinnabar">
          <Shield size={18} />
          <div className="text-xs uppercase tracking-[0.28em]">Data Boundary</div>
        </div>
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="font-serifCn text-2xl font-semibold text-ink text-balance">内容归属</h2>
            <p className="mt-4 text-base leading-9 text-inkSoft">
              用户输入的素材、草稿、排版模板与生成结果均归用户所有。平台只在提供写作、渲染、同步和审计能力所必需的范围内处理这些数据，不将其擅自公开、售卖或挪作训练素材。
            </p>
          </section>
          <section>
            <h2 className="font-serifCn text-2xl font-semibold text-ink text-balance">日志与审计</h2>
            <p className="mt-4 text-base leading-9 text-inkSoft">
              平台保留必要的登录、账号管理、Prompt 版本切换与同步日志，用于安全审计和故障排查。日志仅展示必要摘要，并区分业务数据与系统审计数据。
            </p>
          </section>
          <section>
            <h2 className="font-serifCn text-2xl font-semibold text-ink text-balance">凭证与密钥</h2>
            <p className="mt-4 text-base leading-9 text-inkSoft">
              公众号凭证与全局 AI 引擎密钥均以加密形式持久化，界面不会回传明文。管理员查看配置时只能看到状态、更新时间和是否已配置，不能直接读取密钥原值。
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
