"use client";

import { FormEvent, useState } from "react";
import { Button, Input, Select, Textarea, cn, surfaceCardStyles } from "@huoziwriter/ui";

const ISSUE_OPTIONS = [
  { value: "product", label: "产品问题" },
  { value: "billing", label: "订阅与账单" },
  { value: "wechat", label: "微信公众号授权" },
  { value: "business", label: "商务合作" },
  { value: "feedback", label: "功能建议" },
] as const;

const supportFormClassName = cn(surfaceCardStyles(), "space-y-5 p-6 md:p-8");
const fieldClassName = "space-y-2";
const fieldLabelClassName = "text-sm text-inkSoft";
const descriptionFieldClassName = "min-h-[180px]";
const errorMessageClassName = "text-sm text-cinnabar";
const successMessageClassName = cn(surfaceCardStyles({ tone: "success" }), "px-4 py-3 text-sm text-emerald-700 shadow-none");

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
    <form onSubmit={handleSubmit} className={supportFormClassName}>
      <div>
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Support Form</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">发送信息</h2>
        <p className="mt-3 text-sm leading-7 text-inkSoft">
          提交后会进入后台支持池。产品问题请尽量附带路径、时间和异常现象。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={fieldClassName}>
          <label htmlFor="support-name" className={fieldLabelClassName}>
            名字
          </label>
          <Input
            aria-label="怎么称呼你"
            id="support-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="怎么称呼你"
            required
          />
        </div>
        <div className={fieldClassName}>
          <label htmlFor="support-email" className={fieldLabelClassName}>
            邮箱
          </label>
          <Input
            aria-label="name@example.com"
            id="support-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
          />
        </div>
      </div>
      <div className={fieldClassName}>
        <label htmlFor="support-issue-type" className={fieldLabelClassName}>
          问题类型
        </label>
        <Select
          id="support-issue-type"
          value={issueType}
          onChange={(event) => setIssueType(event.target.value)}
        >
          {ISSUE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={fieldClassName}>
        <label htmlFor="support-description" className={fieldLabelClassName}>
          详细描述
        </label>
        <Textarea
          aria-label="请写明问题路径、报错信息、页面位置，或你希望新增的功能。"
          id="support-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={descriptionFieldClassName}
          placeholder="请写明问题路径、报错信息、页面位置，或你希望新增的功能。"
          required
        />
      </div>
      {error ? <div className={errorMessageClassName}>{error}</div> : null}
      {success ? <div className={successMessageClassName}>{success}</div> : null}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "发送中…" : "发送信息"}
      </Button>
    </form>
  );
}
