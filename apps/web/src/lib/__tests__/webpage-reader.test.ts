import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { fetchWebpageArticle } from "../webpage-reader";

async function withHtmlServer<T>(html: string, run: (url: string) => Promise<T>) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try {
    return await run(`http://127.0.0.1:${port}/article`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("fetchWebpageArticle extracts WeChat js_content and metadata title", async () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>fallback title</title>
        <meta property="og:title" content="谷歌搜索意图的本质" />
      </head>
      <body>
        <div class="nav">不应该进入正文的导航</div>
        <div id="js_content">
          <p>关键词只是表层，搜索意图才决定流量价值。</p>
          <section><p>四类常见意图包括 Information、Commercial Investigation、Transactional 和 Navigational。</p></section>
          <p>做 Google Ads 时，先判断用户到底想知道、比较、购买还是直达品牌。</p>
        </div>
      </body>
    </html>
  `;

  await withHtmlServer(html, async (url) => {
    const article = await fetchWebpageArticle(url);
    assert.equal(article.sourceTitle, "谷歌搜索意图的本质");
    assert.match(article.rawText, /搜索意图才决定流量价值/);
    assert.match(article.rawText, /Commercial Investigation/);
    assert.doesNotMatch(article.rawText, /不应该进入正文的导航/);
  });
});

test("fetchWebpageArticle rejects login pages as source material", async () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>登录 / 注册</title></head>
      <body>
        <main>
          <h1>登录 / 注册</h1>
          <p>手机号登录 密码登录 验证码登录</p>
        </main>
      </body>
    </html>
  `;

  await withHtmlServer(html, async (url) => {
    await assert.rejects(
      () => fetchWebpageArticle(url.replace("/article", "/signin?next=%2Fquestion")),
      /登录或注册门槛/,
    );
  });
});
