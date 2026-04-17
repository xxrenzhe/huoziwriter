import { ArticleDetailPage } from "@/components/article-detail-page";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: { articleId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const requestedMainStepCode =
    typeof searchParams?.step === "string" && searchParams.step === "evidence"
      ? "evidence"
      : null;
  return <ArticleDetailPage params={{ articleId: params.articleId }} requestedMainStepCode={requestedMainStepCode} />;
}
