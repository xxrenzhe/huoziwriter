import { Mail, QrCode, Send, Waypoints } from "lucide-react";
import { SupportFormClient } from "@/components/support-client";

export default function SupportPage({
  searchParams,
}: {
  searchParams?: {
    type?: string;
    ref?: string;
  };
}) {
  const referralCode = searchParams?.ref?.trim() || "";
  const defaultDescription = referralCode ? `推荐码：${referralCode}\n我想咨询开通方式 / 分销合作。` : "";

  return (
    <div className="space-y-10">
      <section className="max-w-3xl border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Contact HuoZi</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">联系活字</h1>
        <p className="mt-4 text-base leading-8 text-stone-700">
          有 Bug？有灵感？或者只是想骂一句当前的 AI？都可以直接写进支持池。我们把产品问题、账单处理、公众号授权和商务沟通放进同一条处理链。
        </p>
      </section>
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          {referralCode ? (
            <article className="border border-cinnabar/30 bg-cinnabar/5 p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Referral Intake</div>
              <h2 className="mt-3 font-serifCn text-3xl text-ink">当前引荐码：{referralCode}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">
                如果你是通过创作者或合作伙伴的邀请链接来到这里，可以直接提交支持表单。后台后续可按推荐码继续人工跟进。
              </p>
            </article>
          ) : null}
          <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="flex h-11 w-11 items-center justify-center border border-stone-300 bg-[#faf7f0] text-cinnabar">
              <Mail size={18} />
            </div>
            <div className="mt-5 text-xs uppercase tracking-[0.24em] text-stone-500">Support Email</div>
            <div className="mt-3 font-serifCn text-3xl text-ink">support@huozi.com</div>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              适合提交产品问题、账单需求、人工开通请求和账号异常。复杂问题建议同时附上截图与操作路径。
            </p>
            <a
              href="mailto:support@huozi.com"
              className="mt-5 inline-flex items-center gap-2 border border-stone-300 bg-white px-4 py-3 text-sm text-ink"
            >
              <Send size={16} />
              直接发邮件
            </a>
          </article>
          <article className="border border-stone-300/40 bg-[#f4efe6] p-6 shadow-ink">
            <div className="flex h-11 w-11 items-center justify-center border border-stone-300 bg-white text-cinnabar">
              <QrCode size={18} />
            </div>
            <div className="mt-5 text-xs uppercase tracking-[0.24em] text-stone-500">Inner Circle</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">扫码加入内测交流群</h2>
            <div className="mt-5 grid h-44 w-44 place-items-center border border-stone-300 bg-[linear-gradient(135deg,#fff_25%,#f5f1e8_25%,#f5f1e8_50%,#fff_50%,#fff_75%,#f5f1e8_75%,#f5f1e8_100%)] bg-[length:20px_20px]">
              <div className="flex h-16 w-16 items-center justify-center border border-stone-900 bg-white text-stone-900">
                <Waypoints size={24} />
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-stone-700">
              这里适合收集内测反馈、排版基因征集和真实公众号案例。二维码先用内测占位图，运营侧可后续替换。
            </p>
          </article>
        </div>
        <SupportFormClient defaultIssueType={searchParams?.type} defaultDescription={defaultDescription} />
      </section>
    </div>
  );
}
