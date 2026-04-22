import assert from "node:assert/strict";
import test from "node:test";

import {
  GatewayProviderError,
  classifyGatewayError,
  executeWithRetry,
  getRetryDelayMs,
  shouldRunShadowTraffic,
} from "../ai-gateway";

test("classifyGatewayError marks rate limit, 5xx and timeout as retryable", () => {
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "openai",
        model: "gpt-4o-mini",
        status: 429,
        message: "rate limited",
      }),
    ),
    "retryable",
  );
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        status: 503,
        message: "unavailable",
      }),
    ),
    "retryable",
  );
  assert.equal(classifyGatewayError(new DOMException("timed out", "TimeoutError")), "retryable");
});

test("classifyGatewayError marks auth errors as fatal and unknown errors as fallback", () => {
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: 401,
        message: "unauthorized",
      }),
    ),
    "fatal",
  );
  assert.equal(classifyGatewayError(new Error("missing api key")), "fallback");
});

test("getRetryDelayMs prefers retry-after over exponential backoff", () => {
  const rateLimitError = new GatewayProviderError({
    provider: "openai",
    model: "gpt-4o-mini",
    status: 429,
    retryAfterMs: 5_000,
    message: "rate limited",
  });
  assert.equal(getRetryDelayMs(1, rateLimitError), 5_000);
  assert.equal(
    getRetryDelayMs(
      2,
      new GatewayProviderError({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        status: 500,
        message: "server error",
      }),
    ),
    1_500,
  );
});

test("executeWithRetry waits retry-after once and succeeds on the second attempt", async () => {
  let callCount = 0;
  const delays: number[] = [];
  const result = await executeWithRetry(
    async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new GatewayProviderError({
          provider: "openai",
          model: "gpt-4o-mini",
          status: 429,
          retryAfterMs: 5_000,
          message: "rate limited",
        });
      }
      return "ok";
    },
    {
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result.value, "ok");
  assert.equal(result.attemptCount, 2);
  assert.deepEqual(delays, [5_000]);
});

test("executeWithRetry stops immediately on fatal auth errors", async () => {
  let callCount = 0;
  const delays: number[] = [];
  await assert.rejects(
    executeWithRetry(
      async () => {
        callCount += 1;
        throw new GatewayProviderError({
          provider: "openai",
          model: "gpt-4o-mini",
          status: 401,
          message: "unauthorized",
        });
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    ),
  );

  assert.equal(callCount, 1);
  assert.deepEqual(delays, []);
});

test("shouldRunShadowTraffic buckets users by userId and percentage", () => {
  assert.equal(shouldRunShadowTraffic(null, 10), false);
  assert.equal(shouldRunShadowTraffic(42, 0), false);
  assert.equal(shouldRunShadowTraffic(9, 10), true);
  assert.equal(shouldRunShadowTraffic(10, 10), false);
  assert.equal(shouldRunShadowTraffic(109, 10), true);
});
