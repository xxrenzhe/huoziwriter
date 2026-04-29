type HumanVoiceSignals = {
  firstHandObservation?: string | null;
  feltMoment?: string | null;
  whyThisHitMe?: string | null;
  realSceneOrDialogue?: string | null;
  wantToComplain?: string | null;
  nonDelegableTruth?: string | null;
} | null;

function clean(value: unknown) {
  return String(value || "").trim();
}

function pickHumanSignal(signals?: HumanVoiceSignals) {
  if (!signals) return "";
  return [
    signals.realSceneOrDialogue,
    signals.firstHandObservation,
    signals.feltMoment,
    signals.whyThisHitMe,
    signals.wantToComplain,
    signals.nonDelegableTruth,
  ].map(clean).find(Boolean) || "";
}

export function buildHumanPracticalVoiceChecklist(input: {
  title?: string | null;
  targetReader?: string | null;
  personaSummary?: string | null;
  humanSignals?: HumanVoiceSignals;
}) {
  const targetReader = clean(input.targetReader) || "读者";
  const humanSignal = pickHumanSignal(input.humanSignals);
  return [
    humanSignal
      ? `开头和关键转折优先贴住这条真人信号：${humanSignal}。`
      : "没有明确一手经历时，用“我会先看什么 / 我最怕什么 / 这一步容易骗自己”这类判断动作，不要冒充亲历故事。",
    `把 ${targetReader} 当成坐在桌对面的人说话，少用报告腔，多用短判断、复盘现场和具体动作。`,
    "至少让读者看到一次真实压力：谁在亏、谁在急、谁在解释不动，别把情绪写成抽象感受词。",
    "每个核心判断后面至少补一个实操落点：我会查哪张表、先问哪个问题、怎么判断继续投还是停手。",
    "案例不能只写“有一次复盘”这种虚焦背景，必须写清谁说了什么、盯着哪张表、结果卡在了哪里。",
    "允许出现克制的第一人称经验句，但必须绑定真实材料或判断动作，例如“我更怕的是”“我会先把这类词单独拉出来看”。",
    "段落要像有经验的人在急着提醒同业：先说刺痛点，再说为什么，最后落到能立刻检查的一步；少上课，多共情。",
    "禁止写成行业报告、培训课、政策解读、百科定义或正式汇报；不要用“因此可以看出”“对于…而言”“在…过程中”撑语气。",
  ];
}

export function buildHumanPracticalVoiceGuide(input: {
  title?: string | null;
  targetReader?: string | null;
  personaSummary?: string | null;
  humanSignals?: HumanVoiceSignals;
}) {
  const lines = buildHumanPracticalVoiceChecklist(input);
  return ["人味实操表达硬约束：", ...lines.map((line, index) => `${index + 1}. ${line}`)].join("\n");
}
