import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertBannedWordQuota } from "@/lib/plan-access";
import { addBannedWord, getBannedWords } from "@/lib/repositories";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const words = await getBannedWords(session.userId);
  return ok(words.map((word) => ({ id: word.id, word: word.word, createdAt: word.created_at })));
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertBannedWordQuota(session.userId);
    await addBannedWord(session.userId, body.word);
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "添加死刑词失败", 400);
  }
}
