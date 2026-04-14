import { CaptureForms } from "@/components/writer-client";
import { CaptureStudio } from "@/components/writer-views";
import { requireWriterSession } from "@/lib/page-auth";
import { getFragmentsByUser } from "@/lib/repositories";

export default async function CapturePage() {
  const { session } = await requireWriterSession();
  const fragments = await getFragmentsByUser(session.userId);

  return (
    <div className="space-y-8">
      <CaptureStudio />
      <CaptureForms />
      <section className="space-y-3">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">最近碎片</div>
        {fragments.slice(0, 8).map((fragment) => (
          <div key={fragment.id} className="border border-stone-300/40 bg-white p-5 shadow-ink">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-stone-500">
              <span>{fragment.source_type}</span>
            </div>
            <div className="mt-3 font-serifCn text-2xl text-ink">{fragment.title || "未命名碎片"}</div>
            <p className="mt-3 text-sm leading-7 text-stone-700">{fragment.distilled_content}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
