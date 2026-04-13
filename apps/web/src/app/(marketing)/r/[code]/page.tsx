import Link from "next/link";
import { getReferrerByReferralCode } from "@/lib/repositories";
import { getReferralCodeForUser } from "@/lib/referrals";

export default async function ReferralLandingPage({
  params,
}: {
  params: {
    code: string;
  };
}) {
  const referrer = await getReferrerByReferralCode(params.code);
  const referralCode = referrer ? getReferralCodeForUser(referrer) : params.code.toUpperCase();
  const displayName = referrer?.display_name || referrer?.username || "这位创作者";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Referral</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">
          {referrer ? `${displayName} 邀请你进入 Huozi Writer` : "这个邀请链接暂时无法识别"}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">
          {referrer
            ? "活字当前采用管理员发号制，不开放自助注册。你可以直接带着推荐码联系支持或管理员开通账号，系统后续会把归因关系落到真实用户记录。"
            : "推荐码可能已失效或输入有误。你仍然可以继续了解产品，或者联系支持人工确认。"}
        </p>
      </section>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">邀请码信息</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">推荐码</div>
              <div className="mt-3 font-mono text-lg text-ink">{referralCode}</div>
            </div>
            <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">引荐人</div>
              <div className="mt-3 font-serifCn text-2xl text-ink">{displayName}</div>
            </div>
          </div>
          <div className="mt-6 border border-stone-300/40 bg-white p-5 text-sm leading-7 text-stone-700">
            活字的核心链路已经覆盖：碎片采集、结构化知识档案、四栏工作台、死刑词约束、封面图生成、微信草稿箱真实推送。当前开通方式仍以人工发号为主，因此推荐码会在支持或管理员建号环节继续使用。
          </div>
        </article>
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">下一步</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>1. 带着推荐码联系支持，说明你的使用场景。</p>
            <p>2. 管理员确认后手动开通账号，并绑定归因关系。</p>
            <p>3. 首次登录后必须修改初始密码，再进入工作台开始写作。</p>
          </div>
          <div className="mt-5 space-y-3">
            <Link
              href={`/support?type=business&ref=${encodeURIComponent(referralCode)}`}
              className="block border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white"
            >
              带推荐码联系支持
            </Link>
            <Link href="/pricing" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
              查看套餐与能力
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
