import Link from "next/link";
import { Button, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const stateShellClassName = "space-y-6";
const stateHeroClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "lg" }), "overflow-hidden");
const stateCardClassName = cn(surfaceCardStyles({ padding: "md" }), "overflow-hidden");
const skeletonPulseClassName = "animate-pulse bg-surfaceMuted";
const warningSecondaryActionClassName = cn(
  buttonStyles({ variant: "secondary" }),
  "bg-surface text-warning hover:bg-surfaceWarning hover:text-warning",
);

export function WriterRouteLoadingState() {
  return (
    <div className={stateShellClassName} aria-busy="true" aria-live="polite">
      <section className={stateHeroClassName}>
        <div className={cn(skeletonPulseClassName, "h-3 w-28")} />
        <div className={cn(skeletonPulseClassName, "mt-4 h-10 w-full max-w-2xl")} />
        <div className={cn(skeletonPulseClassName, "mt-4 h-4 w-full max-w-3xl")} />
        <div className={cn(skeletonPulseClassName, "mt-2 h-4 w-full max-w-2xl")} />
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={stateCardClassName}>
              <div className={cn(skeletonPulseClassName, "h-3 w-20")} />
              <div className={cn(skeletonPulseClassName, "mt-4 h-10 w-24")} />
              <div className={cn(skeletonPulseClassName, "mt-4 h-4 w-full")} />
              <div className={cn(skeletonPulseClassName, "mt-2 h-4 w-5/6")} />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className={stateCardClassName}>
            <div className={cn(skeletonPulseClassName, "h-3 w-24")} />
            <div className={cn(skeletonPulseClassName, "mt-4 h-8 w-2/3")} />
            <div className={cn(skeletonPulseClassName, "mt-4 h-4 w-full")} />
            <div className={cn(skeletonPulseClassName, "mt-2 h-4 w-4/5")} />
            <div className={cn(skeletonPulseClassName, "mt-6 h-10 w-32")} />
          </div>
        ))}
      </section>
    </div>
  );
}

export function WriterRouteErrorState({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <section className={cn(surfaceCardStyles({ tone: "warning", padding: "lg" }), "space-y-5 text-warning")}>
      <div className="text-xs uppercase tracking-[0.24em]">页面加载异常</div>
      <div>
        <h1 className="font-serifCn text-3xl text-balance text-ink">写作区这次没有正常展开。</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7">
          先重试当前页面；如果问题持续，先回作战台或设置页继续主流程，避免在空白页停住。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {onRetry ? (
          <Button type="button" onClick={onRetry} variant="primary">
            重试当前页面
          </Button>
        ) : null}
        <Link href="/warroom" className={warningSecondaryActionClassName}>
          回作战台
        </Link>
        <Link href="/settings" className={warningSecondaryActionClassName}>
          去设置页
        </Link>
      </div>
    </section>
  );
}

export function WriterRouteForbiddenState({
  eyebrow = "访问受限",
  title,
  detail,
  primaryHref = "/settings/author",
  primaryLabel = "去配置作者资产",
  secondaryHref = "/settings",
  secondaryLabel = "回设置页",
}: {
  eyebrow?: string;
  title: string;
  detail: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className={cn(surfaceCardStyles({ tone: "warning", padding: "lg" }), "space-y-5 text-warning")}>
      <div className="text-xs uppercase tracking-[0.24em]">{eyebrow}</div>
      <div>
        <h1 className="font-serifCn text-3xl text-balance text-ink">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={primaryHref} className={buttonStyles({ variant: "primary" })}>
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} className={warningSecondaryActionClassName}>
          {secondaryLabel}
        </Link>
      </div>
    </section>
  );
}
