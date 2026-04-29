import assert from "node:assert/strict";
import test from "node:test";

import { formatPublishFailureCode } from "../article-workspace-formatters";
import { encryptWechatConnection, publishWechatDraft } from "../wechat";
import { buildArticleVersionHash, classifyPublishFailure } from "../wechat-publish";

test("classifyPublishFailure marks whitelist errors as dedicated code", () => {
  const failure = classifyPublishFailure(new Error("invalid ip 117.143.137.221 ipv6 ::ffff:117.143.137.221, not in whitelist rid: test"));
  assert.equal(failure.code, "ip_whitelist_blocked");
  assert.match(formatPublishFailureCode(failure.code), /IP 白名单未放行/);
});

test("classifyPublishFailure uses WeChat errcode before loose message matching", () => {
  assert.equal(classifyPublishFailure(new Error("微信错误 40001（获取 access_token）: invalid credential")).code, "auth_failed");
  assert.equal(classifyPublishFailure(new Error("微信错误 40164（获取 access_token）: invalid ip not in whitelist")).code, "ip_whitelist_blocked");
  assert.equal(classifyPublishFailure(new Error("微信错误 45009（新增草稿）: reach max api daily quota")).code, "rate_limited");
  assert.equal(classifyPublishFailure(new Error("微信错误 40007（新增草稿）: invalid media_id")).code, "media_failed");
});

test("buildArticleVersionHash keeps media reuse scoped to same template and connection", () => {
  const base = {
    articleId: 42,
    title: "上线稳定性测试",
    markdownContent: "正文内容",
    templateId: "template-a",
    wechatConnectionId: 1,
  };

  assert.equal(buildArticleVersionHash(base), buildArticleVersionHash({ ...base }));
  assert.notEqual(buildArticleVersionHash(base), buildArticleVersionHash({ ...base, templateId: "template-b" }));
  assert.notEqual(buildArticleVersionHash(base), buildArticleVersionHash({ ...base, wechatConnectionId: 2 }));
  assert.notEqual(buildArticleVersionHash(base), buildArticleVersionHash({ ...base, markdownContent: "正文内容已修改" }));
});

test("publishWechatDraft rewrites inline images and uses the prepared cover as thumb source", async () => {
  const credentials = encryptWechatConnection({
    appId: "mock_app",
    appSecret: "mock_secret",
  });
  const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

  const result = await publishWechatDraft({
    connection: {
      id: 1,
      user_id: 1,
      account_name: "Mock WeChat",
      original_id: null,
      app_id_encrypted: credentials.appIdEncrypted,
      app_secret_encrypted: credentials.appSecretEncrypted,
      access_token_encrypted: null,
      access_token_expires_at: null,
      status: "valid",
    },
    title: "一篇图片完整的文章",
    markdownContent: `正文开头\n\n![文中配图](${imageDataUrl})`,
    coverImageUrl: imageDataUrl,
  });

  const requestSummary = result.requestSummary as {
    articles: Array<{ content: string; thumb_media_id: string }>;
    imageUploadSummary: { coverImageUrl: string | null; contentImageCount: number };
  };
  assert.equal(requestSummary.imageUploadSummary.coverImageUrl, imageDataUrl);
  assert.equal(requestSummary.imageUploadSummary.contentImageCount, 1);
  assert.match(requestSummary.articles[0].thumb_media_id, /^mock_thumb_/);
  assert.match(requestSummary.articles[0].content, /https:\/\/mock\.weixin\.qq\.com\/uploadimg\//);
  assert.doesNotMatch(requestSummary.articles[0].content, /data:image\/png;base64/);
});

test("publishWechatDraft preserves upstream errcode and operation for classification", async () => {
  const credentials = encryptWechatConnection({
    appId: "real_app_for_error_test",
    appSecret: "real_secret_for_error_test",
  });
  const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/cgi-bin/token")) {
      return new Response(JSON.stringify({ access_token: "real_access_token_for_error_test", expires_in: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ errcode: 40164, errmsg: "invalid ip 117.143.137.221, not in whitelist" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => publishWechatDraft({
        connection: {
          id: 1,
          user_id: 1,
          account_name: "Real WeChat",
          original_id: null,
          app_id_encrypted: credentials.appIdEncrypted,
          app_secret_encrypted: credentials.appSecretEncrypted,
          access_token_encrypted: null,
          access_token_expires_at: null,
          status: "valid",
        },
        title: "微信错误分类测试",
        markdownContent: "正文",
        coverImageUrl: imageDataUrl,
      }),
      (error: unknown) => {
        const failure = classifyPublishFailure(error);
        assert.equal(failure.code, "ip_whitelist_blocked");
        assert.match(error instanceof Error ? error.message : "", /微信错误 40164/);
        assert.match(error instanceof Error ? error.message : "", /上传封面图/);
        return true;
      },
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
