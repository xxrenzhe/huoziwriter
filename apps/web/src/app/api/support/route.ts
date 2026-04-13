import { fail, ok } from "@/lib/http";
import { createSupportMessage } from "@/lib/repositories";

const ALLOWED_ISSUE_TYPES = new Set(["product", "billing", "wechat", "business", "feedback"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const issueType = String(body.issueType || "").trim();
    const description = String(body.description || "").trim();
    const sourcePage = body.sourcePage ? String(body.sourcePage) : "/support";

    if (!name) {
      return fail("请填写名字");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("请填写有效邮箱");
    }
    if (!ALLOWED_ISSUE_TYPES.has(issueType)) {
      return fail("请选择问题类型");
    }
    if (description.length < 10) {
      return fail("请至少提供 10 个字的详细描述");
    }

    const messageId = await createSupportMessage({
      name,
      email,
      issueType,
      description,
      sourcePage,
    });

    return ok({
      id: messageId,
      status: "open",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "提交失败", 400);
  }
}
