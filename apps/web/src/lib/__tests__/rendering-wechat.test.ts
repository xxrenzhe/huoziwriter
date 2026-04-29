import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdownToWechatHtml } from "../rendering";

test("renderMarkdownToWechatHtml adds WeChat-friendly media, links and table styles", async () => {
  const html = await renderMarkdownToWechatHtml(
    [
      "段落里有一个 [链接](https://example.com/very/long/path)。",
      "",
      "![配图](https://example.com/image.png)",
      "",
      "| 指标 | 结果 |",
      "| --- | --- |",
      "| 转化 | 提升 |",
    ].join("\n"),
    "测试标题",
  );

  assert.match(html, /<img[^>]+display:block;width:100%;max-width:100%;height:auto/);
  assert.match(html, /<a href="https:\/\/example\.com\/very\/long\/path"[^>]+text-decoration:none/);
  assert.match(html, /<table[^>]+width:100%;border-collapse:collapse/);
  assert.match(html, /<th[^>]+background:#f7efe2/);
  assert.match(html, /<td[^>]+vertical-align:top/);
  assert.match(html, /word-break:break-word;overflow-wrap:anywhere/);
});

test("renderMarkdownToWechatHtml can omit body h1 for WeChat draft payloads", async () => {
  const title = "不要在正文重复出现的标题";
  const html = await renderMarkdownToWechatHtml(`正文第一段，不再手动写标题。`, title, null, {
    includeTitle: false,
  });

  assert.doesNotMatch(html, new RegExp(`<h1[^>]*>${title}</h1>`));
  assert.match(html, /正文第一段/);
});

test("renderMarkdownToWechatHtml strips duplicate leading markdown h1", async () => {
  const title = "Google 搜索广告里，最费预算的往往不是错词";
  const html = await renderMarkdownToWechatHtml(`# ${title}\n\n正文第一段。`, title);
  const h1Matches = html.match(/<h1/g) || [];

  assert.equal(h1Matches.length, 1);
  assert.match(html, /正文第一段/);
});

test("renderMarkdownToWechatHtml strips duplicate body h1 when wrapper title is omitted", async () => {
  const title = "不要在正文重复出现的标题";
  const html = await renderMarkdownToWechatHtml(`# ${title}\n\n正文第一段。`, title, null, {
    includeTitle: false,
  });

  assert.doesNotMatch(html, /<h1/g);
  assert.match(html, /正文第一段/);
});
