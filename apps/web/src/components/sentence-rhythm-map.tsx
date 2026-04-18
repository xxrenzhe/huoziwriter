import { useMemo } from "react";

export function SentenceRhythmMap({ text }: { text: string }) {
  const rhythm = useMemo(() => {
    if (!text) return [];
    const rawSentences = text.split(/[。！？\n.!?]+/).filter((s) => s.trim().length > 0);
    return rawSentences.map((s) => ({
      text: s.trim(),
      length: s.trim().length,
      bucket: s.trim().length > 45 ? "long" : s.trim().length < 12 ? "short" : "steady",
    }));
  }, [text]);

  if (rhythm.length === 0) {
    return (
      <div className="border border-stone-300 bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.12),transparent_28%),linear-gradient(180deg,#fffdfa_0%,#faf7f0_100%)] p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">句子呼吸感图谱</div>
        <div className="mt-3 font-serifCn text-2xl text-ink text-balance">先写出几句可读正文，再看呼吸是否自然。</div>
        <div className="mt-2 text-sm leading-7 text-stone-700">
          节奏图不适合在空白页上催你动笔。等正文出现后，它会帮你看出哪里一口气太长、哪里整段都落在同一节拍里。
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            "写到 3 至 5 句后再回来，判断会更准。",
            "先写判断或场景，短句会自然出现。",
            "要修机器味时，优先看长句和连续同节拍。",
          ].map((tip) => (
            <div key={tip} className="border border-stone-300/60 bg-white/80 px-3 py-3 text-xs leading-6 text-stone-600">
              {tip}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxLength = Math.max(...rhythm.map((s) => s.length), 1);
  const avgLength = Math.round(rhythm.reduce((sum, sentence) => sum + sentence.length, 0) / rhythm.length);
  const longCount = rhythm.filter((sentence) => sentence.bucket === "long").length;
  const shortCount = rhythm.filter((sentence) => sentence.bucket === "short").length;
  const steadyCount = rhythm.filter((sentence) => sentence.bucket === "steady").length;

  let currentRun = 1;
  let longestRun = 1;
  for (let index = 1; index < rhythm.length; index += 1) {
    if (rhythm[index]?.bucket === rhythm[index - 1]?.bucket) {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const rhythmHint =
    longCount >= Math.max(2, Math.ceil(rhythm.length / 4))
      ? "长句占比偏高，读者容易在同一口气里失去重音。"
      : longestRun >= 4
        ? "连续多句落在同一节拍，整体呼吸略显单调。"
        : shortCount === 0
          ? "几乎没有短句打断，适合补 1-2 句短促判断来提神。"
          : "长短句切换还算自然，可以继续保持。";

  return (
    <div className="w-full border border-stone-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">句子呼吸感图谱</div>
          <div className="mt-2 text-sm leading-7 text-stone-700">{rhythmHint}</div>
        </div>
        <div className="text-xs text-stone-500">共 {rhythm.length} 句</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="border border-stone-300/70 bg-[#faf7f0] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">平均句长</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{avgLength}</div>
        </div>
        <div className="border border-stone-300/70 bg-[#faf7f0] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">短句</div>
          <div className="mt-2 font-serifCn text-2xl text-[#576b95] text-balance">{shortCount}</div>
        </div>
        <div className="border border-stone-300/70 bg-[#faf7f0] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">平稳句</div>
          <div className="mt-2 font-serifCn text-2xl text-[#607a5b] text-balance">{steadyCount}</div>
        </div>
        <div className="border border-stone-300/70 bg-[#faf7f0] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">长句 / 连续</div>
          <div className="mt-2 font-serifCn text-2xl text-[#8f3136] text-balance">
            {longCount} / {longestRun}
          </div>
        </div>
      </div>

      <div className="mt-4 flex h-28 items-end gap-[3px] overflow-x-auto border border-stone-200 bg-[#fcfbf8] px-3 pb-3 pt-4">
        {rhythm.map((sentence, idx) => {
          const heightPercent = Math.max(10, (sentence.length / maxLength) * 100);
          const colorClass =
            sentence.bucket === "long"
              ? "bg-[#d8b0b2] hover:bg-cinnabar"
              : sentence.bucket === "short"
                ? "bg-[#a6b1c4] hover:bg-[#576b95]"
                : "bg-[#b0c4b1] hover:bg-emerald-600";

          return (
            <div
              key={idx}
              title={`第 ${idx + 1} 句：${sentence.length} 字\n"${sentence.text}"`}
              className={`w-2 shrink-0 cursor-pointer rounded-t-sm transition-all ${colorClass}`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#a6b1c4]" />
          短促有力
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#b0c4b1]" />
          长度适中
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#d8b0b2]" />
          容易疲劳 (&gt;45 字)
        </div>
      </div>

      {(longCount > 0 || longestRun >= 4) && (
        <div className="mt-3 border-l-2 border-cinnabar pl-3 text-xs leading-6 text-stone-600">
          {longCount > 0
            ? "发现较长句子。机器生成文本常把判断压进过长的一口气里，拆句后会更像人写。"
            : "连续句长过于一致，建议插入短句、问句或更直接的判断，打破模板节奏。"}
        </div>
      )}
    </div>
  );
}
