"use client";

import { FormEvent, useState } from "react";
import { uiPrimitives } from "@huoziwriter/ui";

const ISSUE_OPTIONS = [
  { value: "product", label: "产品问题" },
  { value: "billing", label: "订阅与账单" },
  { value: "wechat", label: "微信公众号授权" },
  { value: "business", label: "商务合作" },
  { value: "feedback", label: "功能建议" },
] as const;

function normalizeIssueType(value: string | null | undefined) {
  return ISSUE_OPTIONS.some((item) => item.value === value) ? value! : "product";
}

export function SupportFormClient({
  defaultIssueType = "product",
  defaultDescription = "",
}: {
  defaultIssueType?: string;
  defaultDescription?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [issueType, setIssueType] = useState(normalizeIssueType(defaultIssueType));
  const [description, setDescription] = useState(defaultDescription);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/support", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        issueType,
        description,
        sourcePage: "/support",
      }),
    });
    const json = await response.json();
    setSubmitting(false);

    if (!response.ok || !json.success) {
      setError(json.error || "发送失败");
      return;
    }

    setSuccess("信息已提交。我们会根据你填写的邮箱继续跟进。");
    setName("");
    setEmail("");
    setDescription("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 border border-stone-300/40 bg-white p-6 shadow-ink md:p-8">
      <div>
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Support Form</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">发送信息</h2>
        <p className="mt-3 text-sm leading-7 text-stone-700">
          提交后会进入后台支持池。产品问题请尽量附带路径、时间和异常现象。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="support-name" className="text-sm text-stone-700">
            名字
          </label>
          <input aria-label="怎么称呼你"
            id="support-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={uiPrimitives.input}
            placeholder="怎么称呼你"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="support-email" className="text-sm text-stone-700">
            邮箱
          </label>
          <input aria-label="name@example.com"
            id="support-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={uiPrimitives.input}
            placeholder="name@example.com"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="support-issue-type" className="text-sm text-stone-700">
          问题类型
        </label>
        <select
          id="support-issue-type"
          value={issueType}
          onChange={(event) => setIssueType(event.target.value)}
          className={uiPrimitives.input}
        >
          {ISSUE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="support-description" className="text-sm text-stone-700">
          详细描述
        </label>
        <textarea aria-label="请写明问题路径、报错信息、页面位置，或你希望新增的功能。"
          id="support-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-[180px] w-full border border-stone-300 bg-white px-4 py-3 text-sm leading-7"
          placeholder="请写明问题路径、报错信息、页面位置，或你希望新增的功能。"
          required
        />
      </div>
      {error ? <div className="text-sm text-cinnabar">{error}</div> : null}
      {success ? <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      <button disabled={submitting} className={uiPrimitives.primaryButton}>
        {submitting ? "发送中…" : "发送信息"}
      </button>
    </form>
  );
}
