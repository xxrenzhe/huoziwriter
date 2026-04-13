export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center border border-stone-300/40 bg-white px-6 py-12 text-center shadow-ink">
      <div className="text-xs uppercase tracking-[0.32em] text-cinnabar">404</div>
      <h1 className="mt-4 font-serifCn text-5xl font-semibold text-ink md:text-6xl">这页纸被风吹走了。</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-stone-700">
        可能是链接失效，也可能是被系统当成废话删掉了。回首页继续看，或者直接回到工作台落笔。
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <a href="/" className="bg-cinnabar px-6 py-3 text-sm text-white">回到首页</a>
        <a href="/dashboard" className="border border-stone-300 bg-[#faf7f0] px-6 py-3 text-sm text-ink">进入工作台</a>
      </div>
    </div>
  );
}
