import { ArticleRouteShell } from "./_shell";

export default async function ArticlePage({
  params,
}: {
  params: { articleId: string };
}) {
  return <ArticleRouteShell articleId={params.articleId} />;
}
