import { expect, test } from "@playwright/test";

async function loginAsAdmin(baseURL: string, request: import("@playwright/test").APIRequestContext) {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      username: "huozi",
      password: "REDACTED_ADMIN_PASSWORD",
    },
  });
  expect(response.ok()).toBeTruthy();
  const setCookie = response.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  return String(setCookie).split(";")[0];
}

test("admin routing and topic radar endpoints are reachable after login", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);

  const me = await request.get(`${baseURL}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  expect(me.ok()).toBeTruthy();
  const meJson = await me.json();
  expect(meJson.data.username).toBe("huozi");

  const routing = await request.get(`${baseURL}/api/admin/ai-routing`, {
    headers: { Cookie: cookie },
  });
  expect(routing.ok()).toBeTruthy();
  const routingJson = await routing.json();
  expect(routingJson.data.routes.length).toBeGreaterThanOrEqual(5);

  const auditLogs = await request.get(`${baseURL}/api/admin/audit-logs`, {
    headers: { Cookie: cookie },
  });
  expect(auditLogs.ok()).toBeTruthy();
  const auditJson = await auditLogs.json();
  expect(Array.isArray(auditJson.data.logs)).toBeTruthy();

  const radar = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: cookie },
  });
  expect(radar.ok()).toBeTruthy();
  const radarJson = await radar.json();
  expect(Array.isArray(radarJson.data)).toBeTruthy();
});

test("writer core flow supports capture, generate, template extract and export", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);

  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 文稿",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const capture = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 碎片",
      content: "2026 年内容团队开始重新审视 AI 写作流程，核心变量是事实密度、语言辨识度和发布速度。",
    },
  });
  expect(capture.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/documents/${documentId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  expect(String(generatedJson.data.markdownContent || "")).toContain("E2E 文稿");

  const commanded = await request.post(`${baseURL}/api/documents/${documentId}/command`, {
    headers: { Cookie: cookie },
    data: {
      command: "为这篇文稿补 3 个更锋利的小标题",
    },
  });
  expect(commanded.ok()).toBeTruthy();
  const commandedJson = await commanded.json();
  expect(String(commandedJson.data.markdownContent || "")).toContain("E2E 文稿");

  const extracted = await request.post(`${baseURL}/api/templates/extract`, {
    headers: { Cookie: cookie },
    data: {
      url: `${baseURL}/pricing`,
    },
  });
  expect(extracted.ok()).toBeTruthy();
  const extractedJson = await extracted.json();
  expect(String(extractedJson.data.templateId || "")).toContain("external-");

  const exported = await request.get(`${baseURL}/api/documents/${documentId}/export?format=markdown`, {
    headers: { Cookie: cookie },
  });
  expect(exported.ok()).toBeTruthy();
  const markdown = await exported.text();
  expect(markdown).toContain("E2E 文稿");
});
