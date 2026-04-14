import { CommandConsoleClient } from "@/components/command-console-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { collectLanguageGuardHits, getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { requireWriterSession } from "@/lib/page-auth";
import { getDocumentById, getFragmentsByUser } from "@/lib/repositories";

type CommandPageProps = {
  params: {
    documentId: string;
  };
};

function buildCommands(markdownContent: string, languageGuardHits: Array<{ ruleKind: string }>) {
  const commands = [
    "把当前文稿改成更短句、更少修饰的专栏腔调",
    "为这篇文稿补 3 个更锋利的小标题",
    "基于碎片库补一个反常识案例，避免空泛结论",
  ];

  if (languageGuardHits.length > 0) {
    commands.unshift(
      languageGuardHits.some((item) => item.ruleKind === "pattern")
        ? "扫描并替换当前命中的语言守卫规则，重点清理死刑词和套话句式"
        : "扫描并替换当前命中的死刑词，保留事实信息",
    );
  }
  if (markdownContent.length < 300) {
    commands.unshift("沿着现有标题扩写正文，并优先补事实锚点");
  }
  return commands;
}

export default async function CommandPage({ params }: CommandPageProps) {
  const { session } = await requireWriterSession();
  const documentId = Number(params.documentId);
  const [document, fragments, languageGuardRules] = await Promise.all([
    getDocumentById(documentId, session.userId),
    getFragmentsByUser(session.userId),
    getLanguageGuardRules(session.userId),
  ]);

  if (!document) {
    notFound();
  }

  const latestFragments = fragments.slice(0, 4);
  const bannedWordList = getLanguageGuardTokenBlacklist(languageGuardRules);
  const languageGuardHits = collectLanguageGuardHits(document.markdown_content, languageGuardRules);
  const suggestedCommands = buildCommands(document.markdown_content, languageGuardHits);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Command Palette</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink">命令台已经接入当前文稿上下文，先告诉你现在最值得做什么。</h1>
        <div className="mt-6 border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">当前文稿</div>
          <div className="mt-3 font-serifCn text-2xl text-ink">{document.title}</div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            当前状态：{document.status}。正文长度约 {document.markdown_content.length} 字符，已挂载碎片 {latestFragments.length} 条，语言守卫词语规则 {bannedWordList.length} 个，当前命中 {languageGuardHits.length} 项。
          </p>
        </div>
        <div className="mt-6">
          <CommandConsoleClient documentId={document.id} commands={suggestedCommands} />
        </div>
        <div className="mt-6 rounded-none border border-dashed border-stone-300 bg-[#fffaf2] p-5 text-sm leading-7 text-stone-700">
          命令会复用当前文稿、最近碎片、语言守卫规则和排版基因一起做整篇改写。每次执行前系统都会先留一份快照，便于回滚。
        </div>
      </div>
      <aside className="space-y-4">
        <div className="border border-stone-300/40 bg-[#1a1a1a] p-5 text-stone-100">
          <div className="text-xs uppercase tracking-[0.26em] text-stone-500">最近可用碎片</div>
          <div className="mt-4 space-y-3">
            {latestFragments.length === 0 ? (
              <div className="border border-stone-800 bg-[#101011] p-4 text-sm leading-7 text-stone-300">还没有可挂载碎片，先去采集页补素材。</div>
            ) : (
              latestFragments.map((fragment) => (
                <div key={fragment.id} className="border border-stone-800 bg-[#101011] p-4 text-sm leading-7 text-stone-300">
                  {fragment.distilled_content}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="border border-stone-300/40 bg-[#f4efe6] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">快捷跳转</div>
          <div className="mt-4 space-y-3">
            <Link href={`/editor/${document.id}`} className="block border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white">
              返回编辑器继续写
            </Link>
            <Link href="/capture" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
              去采集页补碎片
            </Link>
          </div>
        </div>
      </aside>
    </section>
  );
}
