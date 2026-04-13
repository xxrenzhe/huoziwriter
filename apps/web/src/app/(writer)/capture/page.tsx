import { CaptureForms } from "@/components/writer-client";
import { CaptureStudio } from "@/components/writer-views";
import { getUserAccessScope } from "@/lib/access-scope";
import { requireWriterSession } from "@/lib/page-auth";
import { getFragmentsByUser } from "@/lib/repositories";

export default async function CapturePage() {
  const { session } = await requireWriterSession();
  const [fragments, scope] = await Promise.all([getFragmentsByUser(session.userId), getUserAccessScope(session.userId)]);

  return (
    <div className="space-y-8">
      <CaptureStudio />
      {scope.isTeamShared ? (
        <section className="border border-stone-300/40 bg-white p-5 text-sm leading-7 text-stone-700 shadow-ink">
          当前为团队共享碎片池模式。你采集的新碎片会写入自己的账号，但本页会同时展示团队内 {scope.userIds.length} 个账号的共享碎片。
        </section>
      ) : null}
      <CaptureForms />
      <section className="space-y-3">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">最近碎片</div>
        {fragments.slice(0, 8).map((fragment) => (
          <div key={fragment.id} className="border border-stone-300/40 bg-white p-5 shadow-ink">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-stone-500">
              <span>{fragment.source_type}</span>
              {fragment.user_id !== session.userId ? (
                <span className="border border-stone-300 bg-[#faf7f0] px-2 py-0.5 text-[10px] tracking-[0.18em] text-stone-600">共享</span>
              ) : null}
            </div>
            <div className="mt-3 font-serifCn text-2xl text-ink">{fragment.title || "未命名碎片"}</div>
            <p className="mt-3 text-sm leading-7 text-stone-700">{fragment.distilled_content}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
