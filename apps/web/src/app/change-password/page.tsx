import { redirect } from "next/navigation";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { ChangePasswordForm } from "@/components/auth-client";
import { ensureUserSession, findUserById } from "@/lib/auth";

const authShellClassName = cn("mx-auto flex min-h-[80vh] max-w-6xl items-center px-6 py-12");
const authCardClassName = cn(surfaceCardStyles(), "grid w-full gap-8 lg:grid-cols-[1.1fr_420px]");
const authSectionClassName = "border-0 px-8 py-12 shadow-none";
const authIntroSectionClassName = cn(surfaceCardStyles({ tone: "warm" }), authSectionClassName, "md:px-12");
const authFormSectionClassName = cn(surfaceCardStyles(), authSectionClassName, "md:px-10");
const authEyebrowClassName = "text-xs uppercase tracking-[0.28em]";
const authBrandClassName = cn(authEyebrowClassName, "text-cinnabar");
const authSectionEyebrowClassName = cn(authEyebrowClassName, "text-inkMuted");
const authHeadingClassName = "font-serifCn text-ink text-balance";
const authHeroTitleClassName = cn(authHeadingClassName, "mt-6 text-5xl font-semibold leading-tight md:text-6xl");
const authSectionTitleClassName = cn(authHeadingClassName, "mt-4 text-3xl");
const authBodyCopyClassName = "text-base leading-8 text-inkSoft";
const authDescriptionClassName = cn(authBodyCopyClassName, "mt-6 max-w-2xl");
const authFormSlotClassName = "mt-8";

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
    <div className={authShellClassName}>
      <div className={authCardClassName}>
        <section className={authIntroSectionClassName}>
          <div className={authBrandClassName}>HuoZi Writer</div>
          <h1 className={authHeroTitleClassName}>先改密码，再继续写。</h1>
          <p className={authDescriptionClassName}>
            {user.must_change_password
              ? "当前仍在使用初始密码。为确保账号与写作资产安全，首次登录后必须先完成密码更新。"
              : "你可以在这里主动轮换登录密码，更新完成后会回到当前角色对应的首页。"}
          </p>
        </section>
        <section className={authFormSectionClassName}>
          <div className={authSectionEyebrowClassName}>账户安全</div>
          <h2 className={authSectionTitleClassName}>
            {user.must_change_password ? "设置新的登录密码" : "修改当前登录密码"}
          </h2>
          <div className={authFormSlotClassName}>
            <ChangePasswordForm mustChange={Boolean(user.must_change_password)} />
          </div>
        </section>
      </div>
    </div>
  );
}
