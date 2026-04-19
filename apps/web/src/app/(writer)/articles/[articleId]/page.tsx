import { ArticleDetailPage } from "@/components/article-detail-page";
import { isArticleMainStepCode, type ArticleMainStepCode } from "@/lib/article-workflow-registry";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: { articleId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const rawStep = typeof searchParams?.step === "string"
    ? searchParams.step
    : Array.isArray(searchParams?.step)
      ? searchParams?.step[0]
      : null;
  const requestedMainStepCode: ArticleMainStepCode | null = rawStep && isArticleMainStepCode(rawStep) ? rawStep : null;
  return <ArticleDetailPage params={{ articleId: params.articleId }} requestedMainStepCode={requestedMainStepCode} />;
}
