import { createHash } from "node:crypto";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getActiveTemplateById } from "@/lib/marketplace";
import { assertWechatTemplateAllowed } from "@/lib/plan-access";
import { evaluateArticlePublishGuard } from "@/lib/publish-guard";
import { getArticleById } from "@/lib/repositories";
import { renderMarkdownToWechatHtml } from "@/lib/rendering";
import { resolveTemplateRenderConfig, summarizeTemplateRenderConfig } from "@/lib/template-rendering";

function buildHash(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return createHash("sha1").update(value).digest("hex");
}

function buildTemplateSummary(template?: { config?: Record<string, unknown> } | null) {
  return summarizeTemplateRenderConfig(template, 9);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : article.title;
    const markdownContent =
      typeof body.markdownContent === "string" ? body.markdownContent : article.markdown_content;
    const templateId =
      body.templateId === null
        ? null
        : typeof body.templateId === "string" && body.templateId.trim()
          ? body.templateId.trim()
          : article.wechat_template_id;
    const wechatConnectionId = Number.isFinite(Number(body.wechatConnectionId)) ? Number(body.wechatConnectionId) : null;
    await assertWechatTemplateAllowed(session.userId, templateId);
    const template = templateId ? await getActiveTemplateById(templateId, session.userId) : null;
    const publishGuard = await evaluateArticlePublishGuard({
      articleId: article.id,
      userId: session.userId,
      templateId,
      wechatConnectionId,
    });
    const finalHtml = await renderMarkdownToWechatHtml(markdownContent, title, resolveTemplateRenderConfig(template));
    const savedHtml = article.html_content || "";
    const finalHtmlHash = buildHash(finalHtml);
    const savedHtmlHash = buildHash(savedHtml);
    const mismatchWarnings: string[] = [];

    if (title !== article.title) {
      mismatchWarnings.push("当前标题尚未保存，正式发布前会先保存标题并重新渲染。");
    }
    if (markdownContent !== article.markdown_content) {
      mismatchWarnings.push("当前正文尚未保存，正式发布前会先保存正文并重新渲染。");
    }
    if ((templateId || null) !== (article.wechat_template_id || null)) {
      mismatchWarnings.push("当前微信模板选择尚未保存，正式发布前会先保存模板并重新渲染。");
    }
    if (savedHtml && finalHtml !== savedHtml) {
      mismatchWarnings.push("已保存的 HTML 与最终发布渲染不一致，建议先刷新为最终发布效果。");
    }

    return ok({
      title,
      templateId,
      templateName: template?.name ?? null,
      templateVersion: template?.version ?? null,
      templateOwnerLabel: template ? (template.ownerUserId == null ? "官方模板库" : "你的个人空间") : null,
      templateSourceLabel: template?.sourceUrl
        ? (() => {
            try {
              return new URL(template.sourceUrl).hostname;
            } catch {
              return template.sourceUrl;
            }
          })()
        : template
          ? "系统模板库"
          : null,
      templateSummary: buildTemplateSummary(template),
      finalHtml,
      finalHtmlHash,
      savedHtmlHash,
      isConsistentWithSavedHtml: Boolean(savedHtml) && finalHtml === savedHtml,
      mismatchWarnings,
      publishGuard,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "生成发布预览失败", 400);
  }
}
