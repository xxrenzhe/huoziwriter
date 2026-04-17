export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[72vh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative mb-8 h-40 w-40">
        <div className="absolute inset-0 border border-stone-300/50 bg-[#f4efe6]" />
        <div className="absolute left-8 top-8 h-24 w-24 border border-stone-700 bg-[#1f1f1d]" />
        <div className="absolute left-14 top-14 h-12 w-12 border border-stone-300 bg-[#faf7f0]" />
        <div className="absolute -right-2 top-10 h-16 w-16 rotate-12 border border-cinnabar/40 bg-white/80" />
      </div>
      <div className="text-xs uppercase tracking-[0.32em] text-cinnabar">404</div>
      <h1 className="mt-4 font-serifCn text-5xl font-semibold text-ink md:text-6xl">这页纸被风吹走了</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
        或许是被 AI 当作废话删除了。这里什么都没有。回首页继续看，或者直接回到作战台继续推进稿件。
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <a href="/dashboard" className="bg-cinnabar px-6 py-3 text-sm text-white">回到作战台</a>
        <a href="/" className="border border-stone-300 bg-[#faf7f0] px-6 py-3 text-sm text-ink">回到首页</a>
      </div>
    </div>
  );
}
