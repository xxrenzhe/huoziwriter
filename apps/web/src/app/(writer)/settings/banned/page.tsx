import { BannedWordsManager } from "@/components/writer-client";
import { BannedWordsStudio } from "@/components/writer-views";
import { getUserAccessScope } from "@/lib/access-scope";
import { requireWriterSession } from "@/lib/page-auth";
import { getBannedWords } from "@/lib/repositories";

export default async function BannedWordsPage() {
  const { session } = await requireWriterSession();
  const [words, scope] = await Promise.all([getBannedWords(session.userId), getUserAccessScope(session.userId)]);
  return (
    <div className="space-y-8">
      <BannedWordsStudio />
      {scope.isTeamShared ? (
        <section className="border border-stone-300/40 bg-white p-5 text-sm leading-7 text-stone-700 shadow-ink">
          当前为团队共享词库模式。这里展示的是团队可见死刑词去重结果，新增时会自动避免写入重复词。
        </section>
      ) : null}
      <BannedWordsManager words={words.map((word) => ({ id: word.id, word: word.word }))} />
    </div>
  );
}
