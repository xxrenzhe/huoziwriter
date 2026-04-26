import { requireAdminSession } from "@/lib/page-auth";
import { getUsers } from "@/lib/repositories";
import { getDatabase } from "@/lib/db";

export default async function AdminBusinessPage() {
  await requireAdminSession();
  const users = await getUsers();
  const db = getDatabase();
  const fragments = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments");
  const documents = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents");
  const logs = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["总用户数", String(users.length), "后台手动发号的总量"],
          ["文稿总数", String(documents?.count ?? 0), "当前库中已创建文稿数"],
          ["微信成功同步", String(logs?.count ?? 0), "已写入草稿箱的发布次数"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </div>
      <article className="border border-stone-800 bg-[#171718] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">碎片资产</div>
        <div className="mt-4 font-serifCn text-4xl text-stone-100">{fragments?.count ?? 0}</div>
        <p className="mt-4 text-sm leading-7 text-stone-400">当前所有来源累积进库的碎片数量，用于衡量长期写作资产沉淀情况。</p>
      </article>
    </section>
  );
}
