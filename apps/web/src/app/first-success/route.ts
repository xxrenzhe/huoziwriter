const GONE_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

export async function GET() {
  return new Response("该页面已下线，不再对外开放。", { status: 410, headers: GONE_HEADERS });
}
