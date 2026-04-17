function buildLink(kind: "official" | "industry" | "comparison") {
  return `/api/tools/mock-research-source/${kind}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "研究补源").trim() || "研究补源";
  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>Mock Research Search - ${query}</title>
      </head>
      <body>
        <main>
          <a href="${buildLink("official")}">${query} 官方说明与时间节点</a>
          <a href="${buildLink("industry")}">${query} 行业观察与研究机构拆解</a>
          <a href="${buildLink("comparison")}">${query} 竞品比较与用户反馈</a>
        </main>
      </body>
    </html>
  `.trim();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
