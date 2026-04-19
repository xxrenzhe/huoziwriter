import Link from "next/link";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const pageClassName = "min-h-dvh bg-adminBg px-6 py-10 text-adminInk md:px-10";
const shellClassName = "mx-auto max-w-4xl";
const cardClassName = cn(
  surfaceCardStyles({ padding: "lg" }),
  "border-adminLineStrong bg-adminSurface text-adminInk shadow-none",
);
const eyebrowClassName = "text-xs uppercase tracking-[0.28em] text-adminAccent";
const titleClassName = "mt-4 font-serifCn text-4xl text-balance";
const copyClassName = "mt-4 max-w-2xl text-sm leading-7 text-adminInkSoft";
const secondaryActionClassName = cn(
  buttonStyles({ variant: "secondary" }),
  "border-adminLineStrong bg-adminSurfaceMuted text-adminInk hover:border-adminAccent hover:bg-adminSurfaceAlt hover:text-adminInk",
);

export function AdminRouteForbiddenState() {
  return (
    <div className={pageClassName}>
      <div className={shellClassName}>
        <section className={cardClassName}>
          <div className={eyebrowClassName}>Access Restricted</div>
          <h1 className={titleClassName}>当前账号没有后台访问权限。</h1>
          <p className={copyClassName}>
            后台模块只对管理员开放。你当前仍可继续使用写作工作区；如果这个账号本应具备后台权限，请回支持页或联系管理员核对角色发放。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/warroom" className={buttonStyles({ variant: "primary" })}>
              回写作区
            </Link>
            <Link href="/support?type=access" className={secondaryActionClassName}>
              去支持页
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
