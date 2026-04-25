import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { LoginForm } from "@/components/auth-client";

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

export default function LoginPage() {
  return (
    <div className={authShellClassName}>
      <div className={authCardClassName}>
        <section className={authIntroSectionClassName}>
          <div className={authBrandClassName}>HuoZi Writer</div>
          <h1 className={authHeroTitleClassName}>进入排版盘。</h1>
          <p className={authDescriptionClassName}>
            当前采用邀请开通制。请使用已分配的账号登录；首次登录后需要先完成密码更新。
          </p>
        </section>
        <section className={authFormSectionClassName}>
          <div className={authSectionEyebrowClassName}>登录</div>
          <h2 className={authSectionTitleClassName}>使用管理账号或已分配账号进入系统</h2>
          <div className={authFormSlotClassName}>
            <LoginForm />
          </div>
        </section>
      </div>
    </div>
  );
}
