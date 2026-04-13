"use client";

import { useState } from "react";

export function ReferralLinkCard({
  referralLink,
}: {
  referralLink: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
      <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Invite Link</div>
      <h2 className="mt-3 font-serifCn text-3xl text-ink">布道者专属链接</h2>
      <p className="mt-3 text-sm leading-7 text-stone-700">
        把这条链接发给管理员或潜在客户，用于绑定你的推荐归因。
      </p>
      <div className="mt-5 flex flex-col gap-3 md:flex-row">
        <input
          readOnly
          value={referralLink}
          className="w-full border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-stone-700"
        />
        <button onClick={handleCopy} className="bg-cinnabar px-4 py-3 text-sm text-white">
          {copied ? "已复制" : "复制链接"}
        </button>
      </div>
    </div>
  );
}
