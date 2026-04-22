import { ArticleDetailPage } from "@/components/article-detail-page";

export async function ArticleRouteShell({
  articleId,
}: {
  articleId: string;
}) {
  return <ArticleDetailPage articleId={articleId} />;
}
