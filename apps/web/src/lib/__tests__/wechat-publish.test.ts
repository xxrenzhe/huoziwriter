import assert from "node:assert/strict";
import test from "node:test";

import { formatPublishFailureCode } from "../article-workspace-formatters";
import { encryptWechatConnection, publishWechatDraft } from "../wechat";
import { classifyPublishFailure } from "../wechat-publish";

test("classifyPublishFailure marks whitelist errors as dedicated code", () => {
  const failure = classifyPublishFailure(new Error("invalid ip 117.143.137.221 ipv6 ::ffff:117.143.137.221, not in whitelist rid: test"));
  assert.equal(failure.code, "ip_whitelist_blocked");
  assert.match(formatPublishFailureCode(failure.code), /IP 白名单未放行/);
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
