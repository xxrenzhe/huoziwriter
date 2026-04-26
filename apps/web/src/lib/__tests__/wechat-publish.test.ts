import assert from "node:assert/strict";
import test from "node:test";

import { formatPublishFailureCode } from "../article-workspace-formatters";
import { classifyPublishFailure } from "../wechat-publish";

test("classifyPublishFailure marks whitelist errors as dedicated code", () => {
  const failure = classifyPublishFailure(new Error("invalid ip 117.143.137.221 ipv6 ::ffff:117.143.137.221, not in whitelist rid: test"));
  assert.equal(failure.code, "ip_whitelist_blocked");
  assert.match(formatPublishFailureCode(failure.code), /IP 白名单未放行/);
});
