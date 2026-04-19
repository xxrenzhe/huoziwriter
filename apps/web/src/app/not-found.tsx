import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";

const illustrationShellClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "md" }),
  "relative mb-8 h-40 w-40 shadow-none",
);
const primaryActionClassName = buttonStyles({ variant: "primary", size: "lg" });
const secondaryActionClassName = buttonStyles({ variant: "secondary", size: "lg" });

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[72vh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className={illustrationShellClassName}>
        <div className="absolute inset-0 bg-surfaceWarm" />
        <div className="absolute left-8 top-8 h-24 w-24 border border-ink bg-ink" />
        <div className="absolute left-14 top-14 h-12 w-12 border border-lineStrong bg-surfaceWarm" />
        <div className="absolute -right-2 top-10 h-16 w-16 rotate-12 border border-cinnabar/40 bg-surface/80" />
      </div>
      <div className="text-xs uppercase tracking-[0.32em] text-cinnabar">404</div>
      <h1 className="mt-4 font-serifCn text-5xl font-semibold text-ink md:text-6xl text-balance">这页纸被风吹走了</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-inkMuted">
        或许是被 AI 当作废话删除了。这里什么都没有。回首页继续看，或者直接回到作战台继续推进稿件。
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/warroom" className={primaryActionClassName}>回到作战台</Link>
        <Link href="/" className={secondaryActionClassName}>回到首页</Link>
      </div>
    </div>
  );
}
