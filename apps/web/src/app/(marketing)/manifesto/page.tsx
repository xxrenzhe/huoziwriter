export default function ManifestoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="border border-stone-300/40 bg-white px-6 py-12 text-center shadow-ink md:px-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center border border-cinnabar/40 bg-cinnabar/5 text-xs uppercase tracking-[0.28em] text-cinnabar">
          印
        </div>
        <h1 className="mt-6 font-serifCn text-5xl font-semibold leading-tight text-ink md:text-6xl text-balance">文字不该是算法的排泄物</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 text-stone-700">
          活字不是把大模型套进一个更好看的壳里，而是给中文写作重新造一条生产线。机器负责脏活，判断、立场和语感仍然必须来自人。
        </p>
      </section>

      <section className="mx-auto max-w-3xl border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="space-y-10 text-lg leading-10 text-stone-700">
          <section>
            <h2 className="font-serifCn text-3xl font-semibold text-ink text-balance">为什么做活字？因为我们受够了“总而言之”。</h2>
            <p className="mt-4">
              今天的大多数 AI 写作工具，只是在把一套更高效的空话生成器卖给写作者。它们不要求你拥有真实素材，不要求你做结构判断，也不在乎你写出来的东西有没有人味。
            </p>
          </section>

          <blockquote className="border-l-4 border-cinnabar bg-[#f5f4ef] px-6 py-5 font-serifCn text-2xl leading-10 text-ink text-balance">
            我们坚信，AI 只是印书机的活字盘，而灵魂必须来自你的记忆、观察与判断。
          </blockquote>

          <section>
            <h2 className="font-serifCn text-3xl font-semibold text-ink text-balance">我们反对什么</h2>
            <p className="mt-4">
              我们反对把抽象套话误认为深刻，把数据抄写误认为分析，把排版模板误认为风格。活字希望把生成约束、事实召回、语言净化和微信排版都放进同一套系统里，而不是交给十几个互相割裂的工具。
            </p>
          </section>

          <section>
            <h2 className="font-serifCn text-3xl font-semibold text-ink text-balance">我们的判断</h2>
            <p className="mt-4">
              AI 是印书机的活字盘，不是作者本人。它应该服务于你的判断，而不是反过来让你替它擦屁股。你提供素材、立场与语感，系统才有资格替你加速。
            </p>
          </section>
        </div>

        <div className="mt-12 flex items-end justify-between gap-4 border-t border-stone-200 pt-8">
          <div>
            <div className="font-serifCn text-3xl text-ink text-balance">独立开发者：阿水</div>
            <div className="mt-2 text-sm uppercase tracking-[0.24em] text-stone-500">HuoZi Writer Manifesto</div>
          </div>
          <div className="flex h-14 w-14 items-center justify-center border border-cinnabar bg-cinnabar/5 text-cinnabar">
            朱印
          </div>
        </div>
      </section>
    </div>
  );
}
