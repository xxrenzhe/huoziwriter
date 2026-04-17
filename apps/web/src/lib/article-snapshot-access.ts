import { getSnapshotRetentionDays } from "./plan-access";
import { getArticleById, getArticleSnapshots } from "./repositories";

export async function getArticleSnapshotAccessContext(userId: number, articleId: number) {
  const [article, retentionDays] = await Promise.all([
    getArticleById(articleId, userId),
    getSnapshotRetentionDays(userId),
  ]);

  return {
    article,
    retentionDays,
  };
}

export async function getAccessibleArticleSnapshots(userId: number, articleId: number) {
  const context = await getArticleSnapshotAccessContext(userId, articleId);
  if (!context.article) {
    return {
      ...context,
      snapshots: [],
    };
  }

  const snapshots = await getArticleSnapshots(articleId, { retentionDays: context.retentionDays });
  return {
    ...context,
    snapshots,
  };
}
