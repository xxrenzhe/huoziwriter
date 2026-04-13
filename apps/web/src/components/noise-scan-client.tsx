"use client";

import { useState } from "react";

type ScanResult = {
  score: number;
  level: "empty" | "low" | "medium" | "high";
  matchedBannedPhrases: string[];
  matchedEmptyPhrases: string[];
  matchedTransitions: string[];
  longSentenceCount: number;
  repeatedConnectorCount: number;
  findings: string[];
  suggestions: string[];
};

const SAMPLE_TEXT = "不可否认，在这个瞬息万变的时代，企业需要通过更高颗粒度的协同去赋能增长，最终形成价值闭环。";

export function NoiseScanClient() {
  const [content, setContent] = useState(SAMPLE_TEXT);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleScan() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/tools/ai-noise-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "扫描失败");
      return;
    }
    setResult(json.data);
  }

  const scoreTone =
    result?.level === "high"
      ? "text-cinnabar"
      : result?.level === "medium"
        ? "text-[#b36b00]"
        : "text-emerald-700";

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">输入草稿</div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="mt-4 min-h-[280px] w-full border border-dashed border-stone-300 p-5 text-sm leading-8 text-stone-700 outline-none"
          placeholder="粘贴一段草稿，一键检测老干部播音腔浓度。"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={handleScan} disabled={loading} className="bg-stone-900 px-5 py-3 text-sm text-white disabled:opacity-60">
            {loading ? "扫描中..." : "开始扫描"}
          </button>
          <button
            onClick={() => {
              setContent(SAMPLE_TEXT);
              setResult(null);
              setError("");
            }}
            className="border border-stone-300 bg-white px-5 py-3 text-sm text-stone-700"
          >
            载入示例
          </button>
        </div>
        {error ? <div className="mt-4 text-sm text-cinnabar">{error}</div> : null}
      </div>
      <div className="border border-cinnabar/30 bg-[#fffaf8] p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">扫描结果</div>
        <div className={`mt-4 font-serifCn text-5xl ${scoreTone}`}>{result ? `${result.score}%` : "--"}</div>
        <p className="mt-3 text-sm leading-7 text-stone-700">
          {result
            ? result.level === "high"
              ? "AI 味浓度偏高，建议立即删掉黑话和长句。"
              : result.level === "medium"
                ? "已经有明显机器腔，需要补事实、减空话。"
                : "语言污染度不高，继续补细节比继续改形容词更重要。"
            : "粘贴你的草稿，一键检测“老干部播音腔”浓度。"}
        </p>
        <ul className="mt-6 space-y-3 text-sm text-stone-700">
          {(result?.findings.length ? result.findings : ["命中死刑词、空话短语、长句和重复连接词后，这里会给出诊断。"]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {result ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="border border-stone-300/40 bg-white p-4 text-sm text-stone-700">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">命中词</div>
              <div className="mt-2">
                {[...result.matchedBannedPhrases, ...result.matchedEmptyPhrases, ...result.matchedTransitions].join(" / ") || "未命中"}
              </div>
            </div>
            <div className="border border-stone-300/40 bg-white p-4 text-sm text-stone-700">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">结构风险</div>
              <div className="mt-2">长句 {result.longSentenceCount} 句，重复连接词 {result.repeatedConnectorCount} 次</div>
            </div>
          </div>
        ) : null}
        <div className="mt-6 border border-stone-300/40 bg-white p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">修改建议</div>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
            {(result?.suggestions.length ? result.suggestions : ["扫描完成后，这里会给出具体的删改方向。"]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
