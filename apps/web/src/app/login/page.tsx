import { LoginForm } from "@/components/auth-client";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-8 border border-stone-300/40 bg-white shadow-ink lg:grid-cols-[1.1fr_420px]">
        <section className="bg-[#f4efe6] px-8 py-12 md:px-12">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">HuoZi Writer</div>
          <h1 className="mt-6 font-serifCn text-5xl font-semibold leading-tight text-ink md:text-6xl text-balance">进入排版盘。</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700">
            v1 不提供用户自助注册。账号由后台手动创建，默认管理账号用户名为 `huozi`。首次启动前需要配置 `DEFAULT_ADMIN_PASSWORD`。
          </p>
        </section>
        <section className="px-8 py-12 md:px-10">
          <div className="text-xs uppercase tracking-[0.28em] text-stone-500">登录</div>
          <h2 className="mt-4 font-serifCn text-3xl text-ink text-balance">使用管理账号或已分配账号进入系统</h2>
          <div className="mt-8">
            <LoginForm />
          </div>
        </section>
      </div>
    </div>
  );
}
