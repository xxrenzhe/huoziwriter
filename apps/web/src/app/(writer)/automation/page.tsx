import { ArticleAutomationCockpit } from "@/components/article-automation-cockpit";
import { requireWriterSession } from "@/lib/page-auth";
import { getArticleAutomationRunById, getArticleAutomationRunsByUser } from "@/lib/article-automation-runs";
import { getWechatConnections } from "@/lib/repositories";
import { getSeries } from "@/lib/series";

export default async function AutomationPage() {
  const { session } = await requireWriterSession();
  const [series, wechatConnections, runs] = await Promise.all([
    getSeries(session.userId),
    getWechatConnections(session.userId),
    getArticleAutomationRunsByUser(session.userId, 12),
  ]);
  const initialRunDetail = runs[0] ? await getArticleAutomationRunById(runs[0].id, session.userId) : null;

  return (
    <ArticleAutomationCockpit
      initialRuns={runs}
      initialRunDetail={initialRunDetail}
      seriesOptions={series}
      wechatConnections={wechatConnections.map((item) => ({
        id: item.id,
        accountName: item.account_name,
        originalId: item.original_id,
        status: item.status,
        isDefault: item.is_default === true || item.is_default === 1,
      }))}
    />
  );
}
