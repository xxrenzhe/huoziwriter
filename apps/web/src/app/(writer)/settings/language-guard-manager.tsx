"use client";

import { Button, Input, Select, Textarea, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useMemo, useState } from "react";
import type { LanguageGuardRule } from "@/lib/language-guard-core";

function normalizePattern(ruleKind: "token" | "pattern", value: string) {
  const trimmed = value.trim();
  if (ruleKind !== "pattern") return trimmed;
  return trimmed.replace(/\.\.\./g, "…");
}

const createFormClassName = cn(surfaceCardStyles({ padding: "md" }), "grid gap-4");
const coverageCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "shadow-none");
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const coverageNoteClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "text-sm leading-7 text-inkSoft shadow-none",
);
const sectionCardClassName = surfaceCardStyles({ padding: "md" });
const systemRuleClassName = cn(
  surfaceCardStyles({ tone: "warm" }),
  "px-3 py-2 text-sm text-inkSoft shadow-none",
);
const userRuleCardClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "space-y-4 shadow-none",
);
const emptyStateClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "border-dashed py-5 text-sm leading-7 text-inkSoft shadow-none",
);
const messageCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "py-3 text-sm text-inkSoft shadow-none",
);
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
);
const deleteButtonClassName =
  "border-danger/40 bg-surface text-xs text-danger hover:border-danger hover:bg-surfaceHighlight hover:text-danger";

function formatRuleKindLabel(ruleKind: "token" | "pattern") {
  return ruleKind === "pattern" ? "句式模板" : "禁词";
}

function formatMatchModeLabel(matchMode: string) {
  return matchMode === "template" ? "模板匹配" : "精确包含";
}

export function LanguageGuardManager({
  initialRules,
  limit,
}: {
  initialRules: LanguageGuardRule[];
  limit: number | null;
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [ruleKind, setRuleKind] = useState<"token" | "pattern">("token");
  const [patternText, setPatternText] = useState("");
  const [rewriteHint, setRewriteHint] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRuleKind, setEditingRuleKind] = useState<"token" | "pattern">("token");
  const [editingPatternText, setEditingPatternText] = useState("");
  const [editingRewriteHint, setEditingRewriteHint] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const systemRules = useMemo(
    () => rules.filter((rule) => rule.scope === "system"),
    [rules],
  );
  const userRules = useMemo(
    () => rules.filter((rule) => rule.scope === "user"),
    [rules],
  );
  const tokenRules = userRules.filter((rule) => rule.ruleKind === "token");
  const patternRules = userRules.filter((rule) => rule.ruleKind === "pattern");
  const reachedLimit = limit != null && userRules.length >= limit;
  const remainingSlots = limit == null ? null : Math.max(limit - userRules.length, 0);
  const normalizedEditingPattern = normalizePattern(editingRuleKind, editingPatternText);
  const duplicateEditingRule = useMemo(
    () =>
      userRules.find(
        (rule) =>
          rule.id !== editingId
          && rule.ruleKind === editingRuleKind
          && rule.patternText.trim() === normalizedEditingPattern,
      ) ?? null,
    [editingId, editingRuleKind, normalizedEditingPattern, userRules],
  );

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (reachedLimit) {
      setMessage(`当前套餐最多只能配置 ${limit} 条自定义语言规则。`);
      return;
    }

    const normalizedPatternText = normalizePattern(ruleKind, patternText);
    if (!normalizedPatternText) {
      setMessage("规则内容不能为空。");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/language-guard-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleKind,
        matchMode: ruleKind === "pattern" ? "template" : "contains",
        patternText: normalizedPatternText,
        rewriteHint: rewriteHint.trim() || null,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok || !json.success) {
      setMessage(json.error || "添加语言守卫规则失败");
      return;
    }

    const created = json.data as LanguageGuardRule;
    setRules((current) => {
      const withoutExisting = current.filter((rule) => rule.id !== created.id);
      return [...withoutExisting.filter((rule) => rule.scope === "system"), created, ...withoutExisting.filter((rule) => rule.scope === "user" && rule.id !== created.id)];
    });
    setPatternText("");
    setRewriteHint("");
    setMessage("语言守卫规则已保存。");
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: string) {
    if (!window.confirm("确定要删除这条规则吗？")) return;

    setDeletingId(id);
    setMessage("");
    const response = await fetch(`/api/language-guard-rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const json = await response.json().catch(() => ({}));
    setDeletingId(null);

    if (!response.ok || !json.success) {
      setMessage(json.error || "删除语言守卫规则失败");
      return;
    }

    setRules((current) => current.filter((rule) => rule.id !== id));
    setMessage("语言守卫规则已删除。");
    startTransition(() => router.refresh());
  }

  function startEdit(rule: LanguageGuardRule) {
    setEditingId(rule.id);
    setEditingRuleKind(rule.ruleKind);
    setEditingPatternText(rule.patternText);
    setEditingRewriteHint(rule.rewriteHint || "");
    setMessage("");
  }

  function stopEdit() {
    setEditingId(null);
    setEditingPatternText("");
    setEditingRewriteHint("");
    setEditingRuleKind("token");
  }

  async function handleSaveEdit(rule: LanguageGuardRule) {
    const nextPatternText = normalizePattern(editingRuleKind, editingPatternText);
    if (!nextPatternText) {
      setMessage("规则内容不能为空。");
      return;
    }
    if (duplicateEditingRule) {
      setMessage("已存在相同规则，无需重复保存。");
      return;
    }
    setSavingEdit(true);
    setMessage("");
    const response = await fetch(`/api/language-guard-rules/${encodeURIComponent(rule.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleKind: editingRuleKind,
        matchMode: editingRuleKind === "pattern" ? "template" : "contains",
        patternText: nextPatternText,
        rewriteHint: editingRewriteHint.trim() || null,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSavingEdit(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "更新语言守卫规则失败");
      return;
    }
    const updated = json.data as LanguageGuardRule;
    setRules((current) => current.map((currentRule) => (currentRule.id === rule.id ? updated : currentRule)));
    stopEdit();
    setMessage("语言守卫规则已更新。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            label: "系统规则",
            value: String(systemRules.length),
            note: "系统默认规则提供整条写作链路的基础底线。",
          },
          {
            label: "我的规则",
            value: limit == null ? String(userRules.length) : `${userRules.length} / ${limit}`,
            note:
              remainingSlots == null
                ? "当前套餐不限制自定义规则数量。"
                : remainingSlots > 0
                  ? `还可继续补 ${remainingSlots} 条。`
                  : "当前自定义规则已达到套餐上限。",
          },
          {
            label: "句式占比",
            value: userRules.length > 0 ? `${Math.round((patternRules.length / userRules.length) * 100)}%` : "0%",
            note:
              userRules.length > 0
                ? "句式模板适合拦截固定机器腔和论证套路。"
                : "当前还没有形成个人语言规则结构。",
          },
        ].map((item) => (
          <article key={item.label} className={summaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <form onSubmit={handleCreate} className={createFormClassName}>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">
              添加自定义规则
            </div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
              先把最常见的机器腔词和固定句式收进规则库。
            </div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这里配置的是长期边界，不是一次性的审校补丁。保存后会在生成、审校和编辑三个阶段统一命中。
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
            <Select
              aria-label="规则类型"
              value={ruleKind}
              onChange={(event) => setRuleKind(event.target.value as "token" | "pattern")}
              className="bg-paperStrong disabled:bg-surfaceMuted"
            >
              <option value="token">禁词</option>
              <option value="pattern">句式模板</option>
            </Select>
            <Input
              aria-label={ruleKind === "pattern" ? "句式模板" : "禁词"}
              value={patternText}
              onChange={(event) => setPatternText(event.target.value)}
              placeholder={
                ruleKind === "pattern"
                  ? "例如：不是...而是..."
                  : "例如：颠覆性"
              }
              disabled={reachedLimit}
              className="disabled:bg-surfaceMuted"
            />
          </div>
          <Textarea
            value={rewriteHint}
            onChange={(event) => setRewriteHint(event.target.value)}
            placeholder="替代建议，例如：改成更具体的动作、事实或判断。"
            disabled={reachedLimit}
            className="min-h-[104px] bg-paperStrong disabled:bg-surfaceMuted"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm leading-6 text-inkSoft">
              {ruleKind === "pattern"
                ? "句式规则会把 `...` 自动规范成 `…`，用于匹配可变片段。"
                : "禁词会在生成、审校和编辑阶段统一命中。"}
            </div>
            <Button
              type="submit"
              disabled={submitting || reachedLimit}
              variant="primary"
            >
              {submitting ? "保存中…" : reachedLimit ? "已达上限" : "保存规则"}
            </Button>
          </div>
        </form>

        <aside className={coverageCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">当前覆盖</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={metaChipClassName}>系统默认 {systemRules.length} 条</span>
            <span className={metaChipClassName}>
              我的规则 {userRules.length}
              {limit == null ? " / 不限" : ` / ${limit}`}
            </span>
            <span className={mutedChipClassName}>禁词 {tokenRules.length} 条</span>
            <span className={mutedChipClassName}>句式模板 {patternRules.length} 条</span>
          </div>
          <div className={cn("mt-5", coverageNoteClassName)}>
            系统默认规则不可删除；自定义规则会在写作链路里优先以高优先级命中。
          </div>
        </aside>
      </div>

      <section className={sectionCardClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">系统默认</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">默认死刑词与句式规则</div>
          </div>
          <div className="text-sm text-inkMuted">{systemRules.length} 条</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {systemRules.map((rule) => (
            <span key={rule.id} className={systemRuleClassName}>
              {rule.patternText}
            </span>
          ))}
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">我的规则</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">个人死刑词库</div>
          </div>
          <div className="text-sm text-inkMuted">
            {userRules.length}
            {limit == null ? " / 不限" : ` / ${limit}`}
          </div>
        </div>
        {userRules.length > 0 ? (
          <div className="mt-4 space-y-3">
            {userRules.map((rule) => (
              <article key={rule.id} className={userRuleCardClassName}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={metaChipClassName}>{formatRuleKindLabel(rule.ruleKind)}</span>
                      <span className={mutedChipClassName}>{formatMatchModeLabel(rule.matchMode)}</span>
                    </div>
                    {editingId === rule.id ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                          <Select
                            aria-label="编辑规则类型"
                            value={editingRuleKind}
                            onChange={(event) => setEditingRuleKind(event.target.value as "token" | "pattern")}
                            className="bg-paperStrong"
                          >
                            <option value="token">禁词</option>
                            <option value="pattern">句式模板</option>
                          </Select>
                          <Input
                            aria-label="编辑规则内容"
                            value={editingPatternText}
                            onChange={(event) => setEditingPatternText(event.target.value)}
                            placeholder={editingRuleKind === "pattern" ? "例如：不是...而是..." : "例如：颠覆性"}
                            className="bg-paperStrong"
                          />
                        </div>
                        <Textarea
                          value={editingRewriteHint}
                          onChange={(event) => setEditingRewriteHint(event.target.value)}
                          placeholder="替代建议，例如：改成更具体的动作、事实或判断。"
                          className="min-h-[96px] bg-paperStrong"
                        />
                        {duplicateEditingRule ? (
                          <div className="text-sm text-danger">
                            已存在同类规则“{duplicateEditingRule.patternText}”，不建议重复保存。
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="mt-2 font-medium text-ink">{rule.patternText}</div>
                        <div className="mt-2 text-sm leading-7 text-inkSoft">
                          {rule.rewriteHint || "未提供替代建议。"}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingId === rule.id ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => void handleSaveEdit(rule)}
                          disabled={savingEdit}
                          variant="secondary"
                          size="sm"
                        >
                          {savingEdit ? "保存中…" : "保存"}
                        </Button>
                        <Button type="button" onClick={stopEdit} disabled={savingEdit} variant="secondary" size="sm">
                          取消
                        </Button>
                      </>
                    ) : (
                      <Button type="button" onClick={() => startEdit(rule)} variant="secondary" size="sm">
                        编辑
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => void handleDelete(rule.id)}
                      disabled={deletingId === rule.id || editingId === rule.id}
                      variant="secondary"
                      size="sm"
                      className={deleteButtonClassName}
                    >
                      {deletingId === rule.id ? "删除中…" : "删除"}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={cn("mt-4", emptyStateClassName)}>
            还没有自定义规则。先补 3 到 5 条你最常见的机器腔词，写作链路的约束感就会明显提升。
          </div>
        )}
      </section>

      {message ? (
        <div aria-live="polite" className={messageCardClassName}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
