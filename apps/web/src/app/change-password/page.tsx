import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth-client";
import { ensureUserSession, findUserById } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const session = await ensureUserSession();
  if (!session) {
    redirect("/login");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-8 border border-stone-300/40 bg-white shadow-ink lg:grid-cols-[1.1fr_420px]">
        <section className="bg-[#f4efe6] px-8 py-12 md:px-12">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">HuoZi Writer</div>
          <h1 className="mt-6 font-serifCn text-5xl font-semibold leading-tight text-ink md:text-6xl">先改密码，再继续写。</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700">
            {user.must_change_password
              ? "当前仍在使用管理员发放的初始密码。为确保后台账号与写作资产安全，首次登录后必须先完成密码更新。"
              : "你可以在这里主动轮换登录密码，更新完成后会回到当前角色对应的工作台。"}
          </p>
        </section>
        <section className="px-8 py-12 md:px-10">
          <div className="text-xs uppercase tracking-[0.28em] text-stone-500">账户安全</div>
          <h2 className="mt-4 font-serifCn text-3xl text-ink">
            {user.must_change_password ? "设置新的登录密码" : "修改当前登录密码"}
          </h2>
          <div className="mt-8">
            <ChangePasswordForm mustChange={Boolean(user.must_change_password)} />
          </div>
        </section>
      </div>
    </div>
  );
}
