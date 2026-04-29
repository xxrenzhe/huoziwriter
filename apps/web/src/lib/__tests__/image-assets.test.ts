import assert from "node:assert/strict";
import test from "node:test";

import { resolveBaoyuCompressionStrategy } from "../image-assets";
import { extractReusableImagePrompt, summarizeReusableImagePrompt } from "../image-prompt-assets";

test("resolveBaoyuCompressionStrategy lowers quality for large bitmap sources", () => {
  const strategy = resolveBaoyuCompressionStrategy({
    width: 4000,
    height: 3000,
    sourceByteLength: 8_000_000,
    sourceIsSvg: false,
  });

  assert.equal(strategy.compressedQuality, 78);
  assert.equal(strategy.thumbnailQuality, 70);
  assert.equal(strategy.targetMaxWidth, 1280);
  assert.equal(strategy.targetMaxHeight, 1600);
  assert.equal(strategy.resizeKernel, "lanczos3");
  assert.equal(strategy.sharpen, true);
});

test("resolveBaoyuCompressionStrategy preserves more quality for svg and alpha assets", () => {
  const svgStrategy = resolveBaoyuCompressionStrategy({
    width: 1200,
    height: 900,
    sourceByteLength: 120_000,
    sourceIsSvg: true,
  });
  const alphaStrategy = resolveBaoyuCompressionStrategy({
    width: 1200,
    height: 900,
    hasAlpha: true,
    sourceByteLength: 900_000,
    sourceIsSvg: false,
  });

  assert.equal(svgStrategy.compressedQuality, 88);
  assert.equal(svgStrategy.thumbnailQuality, 78);
  assert.equal(alphaStrategy.compressedQuality, 86);
  assert.equal(alphaStrategy.thumbnailQuality, 78);
});

test("extractReusableImagePrompt reads prompt metadata from visual manifests", () => {
  const prompt = extractReusableImagePrompt({
    manifest: {
      baoyu: {
        promptText: "一张适合公众号商业案例拆解的封面图",
        negativePrompt: "不要水印和错字",
        aspectRatio: "16:9",
      },
      promptHash: "hash-1",
      provider: "openai",
      model: "gpt-image-1",
    },
  });

  assert.equal(prompt?.prompt, "一张适合公众号商业案例拆解的封面图");
  assert.equal(prompt?.negativePrompt, "不要水印和错字");
  assert.equal(prompt?.promptHash, "hash-1");
  assert.equal(prompt?.provider, "openai");
  assert.equal(prompt?.model, "gpt-image-1");
  assert.equal(prompt?.aspectRatio, "16:9");
  assert.equal(summarizeReusableImagePrompt(prompt, 8), "一张适合公众号商...");
});

test("extractReusableImagePrompt prefers explicit row prompt over manifest prompt", () => {
  const prompt = extractReusableImagePrompt({
    prompt: "候选图数据库 prompt",
    manifest: {
      prompt: "旧 manifest prompt",
      model: "fallback",
    },
  });

  assert.equal(prompt?.prompt, "候选图数据库 prompt");
  assert.equal(prompt?.model, "fallback");
});
