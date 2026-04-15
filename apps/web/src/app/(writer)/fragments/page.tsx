import Link from "next/link";
import { WriterOverview } from "@/components/writer-views";
import { hasAuthorPersona } from "@/lib/author-personas";
import { requireWriterSession } from "@/lib/page-auth";
import { getFragmentsByUser } from "@/lib/repositories";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "暂未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSourceType(value: string) {
  if (value === "manual") return "手动输入";
  if (value === "url") return "链接抓取";
  if (value === "screenshot") return "截图 OCR";
  return value || "未知来源";
}

export default async function FragmentsPage() {
  const { session } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }

  const fragments = await getFragmentsByUser(session.userId);
  const urlCount = fragments.filter((item) => item.source_type === "url").length;
  const screenshotCount = fragments.filter((item) => item.source_type === "screenshot").length;
  const manualCount = fragments.length - urlCount - screenshotCount;

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="碎片素材"
        title="所有链接、手动输入和截图，都应该先沉淀成可复用碎片。"
        description="这里显示个人空间里可直接挂载到大纲、写作、核查和主题档案的素材碎片。先让素材可复用，再谈生成是否稳定。"
        metrics={[
          { label: "碎片总数", value: String(fragments.length), note: "所有采集方式最终都统一写入同一个碎片池。" },
          { label: "链接 / 截图", value: `${urlCount} / ${screenshotCount}`, note: "证据型素材优先影响事实核查和档案编译。" },
          { label: "手动输入", value: String(manualCount), note: "会议记录、观点摘录和临时灵感也属于正式素材。" },
        ]}
        cards={[
          { title: "统一入池", description: "不要让截图、链接、手打文本分散在三个孤立位置。", meta: "Pool" },
          { title: "先脱水再挂载", description: "碎片应该是可读、可引用、可搜索的原子材料，而不是原始噪音。", meta: "Distill" },
          { title: "优先复用", description: "大纲、深写和事实核查都应优先消费碎片池，而不是重复临时粘贴。", meta: "Reuse" },
        ]}
      />

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">素材池</div>
            <div className="mt-3 font-serifCn text-3xl text-ink">当前共沉淀 {fragments.length} 条碎片素材。</div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              如果这里还是空的，先去采集页补链接、手动输入或截图。没有素材时，后续大纲、核查和主题档案都会变得不稳定。
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/capture" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
              去采集中心补素材
            </Link>
            <Link href="/dashboard" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
              返回工作台
            </Link>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {fragments.length > 0 ? fragments.map((fragment) => (
            <article key={fragment.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                <span>{formatSourceType(fragment.source_type)}</span>
                <span className="border border-stone-300 bg-white px-2 py-1">Fragment #{fragment.id}</span>
                <span>录入时间 {formatDateTime(fragment.created_at)}</span>
              </div>
              <div className="mt-3 font-serifCn text-2xl text-ink">{fragment.title || "未命名碎片"}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">{fragment.distilled_content}</div>
              <div className="mt-4 space-y-2 text-xs leading-6 text-stone-500">
                {fragment.source_url ? <div>来源链接：{fragment.source_url}</div> : null}
                {fragment.screenshot_path ? <div>截图路径：{fragment.screenshot_path}</div> : null}
              </div>
            </article>
          )) : (
            <div className="border border-dashed border-stone-300 bg-[#fffdfa] px-5 py-6 text-sm leading-7 text-stone-600">
              还没有任何碎片素材。去采集页录入第一条后，这里会开始积累你的证据池和观点池。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
