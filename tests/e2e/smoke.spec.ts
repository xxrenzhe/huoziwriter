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

async function loginWithPassword(baseURL: string, request: import("@playwright/test").APIRequestContext, input: {
  username: string;
  password: string;
}) {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: input,
  });
  expect(response.ok()).toBeTruthy();
  const setCookie = response.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  return String(setCookie).split(";")[0];
}

async function createE2EUser(baseURL: string, request: import("@playwright/test").APIRequestContext, adminCookie: string, input?: {
  planCode?: "free" | "pro" | "ultra";
}) {
  const username = `e2e_user_${Date.now()}`;
  const password = "REDACTED_ADMIN_PASSWORD";
  const response = await request.post(`${baseURL}/api/admin/users`, {
    headers: { Cookie: adminCookie },
    data: {
      username,
      password,
      role: "user",
      planCode: input?.planCode || "free",
      mustChangePassword: false,
    },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  return {
    id: Number(json.data.id),
    username,
    password,
  };
}

async function ensureAuthorPersona(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const listed = await request.get(`${baseURL}/api/author-personas`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  expect(Array.isArray(listedJson.data.catalog?.identity)).toBeTruthy();
  expect(Array.isArray(listedJson.data.catalog?.writingStyle)).toBeTruthy();
  const personas = Array.isArray(listedJson.data.personas) ? listedJson.data.personas : [];
  if (personas.length > 0) {
    return personas[0];
  }

  const created = await request.post(`${baseURL}/api/author-personas`, {
    headers: { Cookie: cookie },
    data: {
      name: `E2E 作者人设 ${Date.now()}`,
      identityTags: ["AI 产品经理"],
      writingStyleTags: ["经验分享"],
      isDefault: true,
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  expect(Array.isArray(createdJson.data.identityTags)).toBeTruthy();
  expect(Array.isArray(createdJson.data.writingStyleTags)).toBeTruthy();
  return createdJson.data;
}

async function ensureMockImageEngine(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const response = await request.put(`${baseURL}/api/admin/image-engine`, {
    headers: { Cookie: cookie },
    data: {
      baseUrl: `${baseURL}/api/tools/mock-image-engine`,
      model: "mock-cover-v1",
      apiKey: "mock-local-api-key",
      isEnabled: true,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function ensureMockWechatConnection(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const listResponse = await request.get(`${baseURL}/api/wechat/connections`, {
    headers: { Cookie: cookie },
  });
  expect(listResponse.ok()).toBeTruthy();
  const listJson = await listResponse.json();
  const existing = (Array.isArray(listJson.data) ? listJson.data : []).find(
    (item: { accountName?: string; originalId?: string }) =>
      item.accountName === "Mock 微信公众号" || item.originalId === "gh_mock_wechat",
  );
  if (existing) {
    return existing;
  }

  const created = await request.post(`${baseURL}/api/wechat/connections`, {
    headers: { Cookie: cookie },
    data: {
      accountName: "Mock 微信公众号",
      originalId: "gh_mock_wechat",
      appId: "mock_app_id",
      appSecret: "mock_app_secret",
      isDefault: true,
    },
  });
  expect(created.ok()).toBeTruthy();

  const reloaded = await request.get(`${baseURL}/api/wechat/connections`, {
    headers: { Cookie: cookie },
  });
  expect(reloaded.ok()).toBeTruthy();
  const reloadedJson = await reloaded.json();
  const connection = (Array.isArray(reloadedJson.data) ? reloadedJson.data : []).find(
    (item: { accountName?: string; originalId?: string }) =>
      item.accountName === "Mock 微信公众号" || item.originalId === "gh_mock_wechat",
  );
  expect(connection).toBeTruthy();
  return connection;
}

async function createPublishReadyDocument(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string, input?: {
  title?: string;
}) {
  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: input?.title || `E2E Mock 微信发布文稿 ${Date.now()}`,
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const selectedTitle = input?.title || "E2E Mock 微信发布文稿";

  const savedDocument = await request.patch(`${baseURL}/api/documents/${documentId}`, {
    headers: { Cookie: cookie },
    data: {
      title: selectedTitle,
      markdownContent: [
        `# ${selectedTitle}`,
        "",
        "2026 年，内容团队开始把核查、润色、封面和发布守门合并成一条稳定链路，目标是减少返工并提升公众号草稿箱成功率。",
        "",
        "如果事实核查没有前置，公众号写作会在最后一公里持续返工；如果封面和草稿箱发布没有闭环，团队就无法稳定复用整套内容生产流程。",
      ].join("\n"),
      status: "reviewed",
    },
  });
  expect(savedDocument.ok()).toBeTruthy();

  const outlineSeed = await request.patch(`${baseURL}/api/documents/${documentId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "发布链路大纲已确认。",
        workingTitle: selectedTitle,
        outlineSections: [
          { heading: "问题背景", goal: "说明为什么发布返工频繁", keyPoints: ["核查缺位会导致返工"], evidenceHints: ["来自正文"], transition: "从问题进入方法" },
          { heading: "解决路径", goal: "说明如何把守门前置", keyPoints: ["核查、润色、封面、发布串起来"], evidenceHints: ["来自正文"], transition: "从方法进入结果" },
        ],
        selection: {
          selectedTitle,
          selectedOpeningHook: "先抛结论再解释成本。",
          selectedTargetEmotion: "建立确定感。",
          selectedEndingStrategy: "结尾落到发布动作。",
        },
      },
    },
  });
  expect(outlineSeed.ok()).toBeTruthy();

  const deepWritingSeed = await request.patch(`${baseURL}/api/documents/${documentId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "深度写作执行卡已确认。",
        selectedTitle,
        sectionBlueprint: [
          { heading: "问题背景", goal: "点明返工来自哪里", paragraphMission: "先讲现象，再讲原因" },
          { heading: "解决路径", goal: "说明如何形成闭环", paragraphMission: "讲流程如何联动" },
        ],
        voiceChecklist: ["判断先行", "少讲套话", "句子尽量收短"],
        finalChecklist: ["不要超出事实边界", "结尾给出动作"],
      },
    },
  });
  expect(deepWritingSeed.ok()).toBeTruthy();

  const factCheckSaved = await request.patch(`${baseURL}/api/documents/${documentId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "发布前核查已收敛。",
        overallRisk: "low",
        checks: [
          {
            claim: "内容团队开始把核查、润色、封面和发布守门合并成一条稳定链路。",
            status: "verified",
            suggestion: "保留。",
          },
        ],
        evidenceCards: [],
        missingEvidence: [],
        personaAlignment: "当前正文与作者人设一致。",
        topicAlignment: "当前正文与主题一致。",
      },
    },
  });
  expect(factCheckSaved.ok()).toBeTruthy();

  const prosePolishSaved = await request.patch(`${baseURL}/api/documents/${documentId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "语言已压缩到可发布状态。",
        overallDiagnosis: "表达清晰。",
        strengths: ["结构清楚"],
        issues: [
          {
            type: "句子稍长",
            example: "首段有一处并列过长。",
            suggestion: "改成短句。",
          },
        ],
        rewrittenLead: "真正影响公众号交付速度的，不是不会生成，而是每次都要在核查、表达和发布之间反复返工。",
      },
    },
  });
  expect(prosePolishSaved.ok()).toBeTruthy();

  const workflowReady = await request.patch(`${baseURL}/api/documents/${documentId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "目标读者已经明确。",
        coreReaderLabel: "公众号作者",
        selection: {
          selectedReaderLabel: "公众号作者",
          selectedLanguageGuidance: "结论先行，少讲套话。",
          selectedBackgroundAwareness: "有基础实操经验",
          selectedReadabilityLevel: "兼顾专业",
          selectedCallToAction: "结尾给出发布动作。",
        },
      },
    },
  });
  expect(workflowReady.ok()).toBeTruthy();

  const coverGenerated = await request.post(`${baseURL}/api/images/cover`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      title: selectedTitle,
    },
  });
  expect(coverGenerated.ok()).toBeTruthy();
  const coverGeneratedJson = await coverGenerated.json();
  const coverSelected = await request.post(`${baseURL}/api/images/cover/select`, {
    headers: { Cookie: cookie },
    data: {
      candidateId: coverGeneratedJson.data.candidates[0].id,
    },
  });
  expect(coverSelected.ok()).toBeTruthy();

  return {
    documentId,
    selectedTitle,
  };
}

async function getFirstOfficialTemplateId(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const response = await request.get(`${baseURL}/api/templates`, {
    headers: { Cookie: cookie },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  const template = (Array.isArray(json.data) ? json.data : []).find(
    (item: { id?: string; ownerUserId?: number | null }) => item.ownerUserId == null && typeof item.id === "string" && item.id.trim(),
  );
  expect(template).toBeTruthy();
  return String(template.id);
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
  const sceneCodes = Array.isArray(routingJson.data.routes)
    ? routingJson.data.routes.map((item: { sceneCode?: string }) => String(item.sceneCode || ""))
    : [];
  expect(sceneCodes).toContain("audienceProfile");
  expect(sceneCodes).toContain("outlinePlan");
  expect(sceneCodes).toContain("deepWrite");
  expect(sceneCodes).toContain("factCheck");
  expect(sceneCodes).toContain("prosePolish");
  expect(sceneCodes).toContain("layoutExtract");
  expect(sceneCodes).toContain("publishGuard");

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
  if ((radarJson.data as Array<unknown>).length > 0) {
    const first = radarJson.data[0] as {
      relatedSourceNames?: unknown;
      relatedSourceUrls?: unknown;
      freshnessScore?: unknown;
      relevanceScore?: unknown;
      priorityScore?: unknown;
    };
    expect(Array.isArray(first.relatedSourceNames)).toBeTruthy();
    expect(Array.isArray(first.relatedSourceUrls)).toBeTruthy();
    expect(typeof first.freshnessScore === "number" || first.freshnessScore === null).toBeTruthy();
    expect(typeof first.relevanceScore === "number" || first.relevanceScore === null).toBeTruthy();
    expect(typeof first.priorityScore === "number" || first.priorityScore === null).toBeTruthy();
  }

  const radarAgain = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: cookie },
  });
  expect(radarAgain.ok()).toBeTruthy();
  const radarAgainJson = await radarAgain.json();
  expect(Array.isArray(radarAgainJson.data)).toBeTruthy();
  expect((radarJson.data as Array<{ title?: string }>).map((item) => item.title)).toEqual(
    (radarAgainJson.data as Array<{ title?: string }>).map((item) => item.title),
  );
});

test("topic radar visible count follows free pro ultra plan gates", async ({ request, baseURL }) => {
  const adminCookie = await loginAsAdmin(baseURL!, request);
  const freeUser = await createE2EUser(baseURL!, request, adminCookie, { planCode: "free" });
  const proUser = await createE2EUser(baseURL!, request, adminCookie, { planCode: "pro" });
  const ultraUser = await createE2EUser(baseURL!, request, adminCookie, { planCode: "ultra" });
  const freeCookie = await loginWithPassword(baseURL!, request, {
    username: freeUser.username,
    password: freeUser.password,
  });
  const proCookie = await loginWithPassword(baseURL!, request, {
    username: proUser.username,
    password: proUser.password,
  });
  const ultraCookie = await loginWithPassword(baseURL!, request, {
    username: ultraUser.username,
    password: ultraUser.password,
  });
  await ensureAuthorPersona(baseURL!, request, freeCookie);
  await ensureAuthorPersona(baseURL!, request, proCookie);
  await ensureAuthorPersona(baseURL!, request, ultraCookie);

  const freeRadar = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: freeCookie },
  });
  expect(freeRadar.ok()).toBeTruthy();
  const freeJson = await freeRadar.json();
  const freeCount = Array.isArray(freeJson.data) ? freeJson.data.length : 0;
  expect(freeCount).toBeLessThanOrEqual(1);

  const proRadar = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: proCookie },
  });
  expect(proRadar.ok()).toBeTruthy();
  const proJson = await proRadar.json();
  const proCount = Array.isArray(proJson.data) ? proJson.data.length : 0;
  expect(proCount).toBeLessThanOrEqual(5);
  expect(proCount).toBeGreaterThanOrEqual(freeCount);

  const ultraRadar = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: ultraCookie },
  });
  expect(ultraRadar.ok()).toBeTruthy();
  const ultraJson = await ultraRadar.json();
  const ultraCount = Array.isArray(ultraJson.data) ? ultraJson.data.length : 0;
  expect(ultraCount).toBeLessThanOrEqual(10);
  expect(ultraCount).toBeGreaterThanOrEqual(proCount);
});

test("first entry blocks core writer flow until author persona is configured", async ({ request, baseURL }) => {
  const adminCookie = await loginAsAdmin(baseURL!, request);
  const user = await createE2EUser(baseURL!, request, adminCookie, { planCode: "free" });
  const userCookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });

  const dashboard = await request.get(`${baseURL}/dashboard`, {
    headers: { Cookie: userCookie },
  });
  expect(dashboard.ok()).toBeTruthy();
  const dashboardHtml = await dashboard.text();
  expect(dashboardHtml).toContain("先配置你的写作身份，再进入系统。");
  expect(dashboardHtml).toContain("Author Setup Required");

  const radar = await request.get(`${baseURL}/api/topic-radar`, {
    headers: { Cookie: userCookie },
  });
  expect(radar.ok()).toBeFalsy();
  const radarJson = await radar.json();
  expect(String(radarJson.error || "")).toContain("请先配置至少 1 个默认作者人设");

  const createDocument = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: userCookie },
    data: {
      title: "未配置人设的文稿",
    },
  });
  expect(createDocument.ok()).toBeFalsy();
  const createDocumentJson = await createDocument.json();
  expect(String(createDocumentJson.error || "")).toContain("请先配置至少 1 个默认作者人设");
});

test("first success guide page and state API support onboarding progress", async ({ request, baseURL }) => {
  const adminCookie = await loginAsAdmin(baseURL!, request);
  const user = await createE2EUser(baseURL!, request, adminCookie, { planCode: "free" });
  const userCookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });
  await ensureAuthorPersona(baseURL!, request, userCookie);

  const page = await request.get(`${baseURL}/first-success`, {
    headers: { Cookie: userCookie },
  });
  expect(page.ok()).toBeTruthy();
  const pageHtml = await page.text();
  expect(pageHtml).toContain("把首篇文章走通");
  expect(pageHtml).toContain("建立作者人设");
  expect(pageHtml).toContain("走完首篇发布");

  const initialGuide = await request.get(`${baseURL}/api/first-success-guide`, {
    headers: { Cookie: userCookie },
  });
  expect(initialGuide.ok()).toBeTruthy();
  const initialGuideJson = await initialGuide.json();
  expect(Array.isArray(initialGuideJson.data.completedSteps)).toBeTruthy();
  expect(initialGuideJson.data.dismissedAt).toBeNull();

  const marked = await request.patch(`${baseURL}/api/first-success-guide`, {
    headers: { Cookie: userCookie },
    data: {
      action: "set_step",
      stepId: 2,
      completed: true,
    },
  });
  expect(marked.ok()).toBeTruthy();
  const markedJson = await marked.json();
  expect((markedJson.data.completedSteps as number[]).includes(2)).toBe(true);

  const dismissed = await request.patch(`${baseURL}/api/first-success-guide`, {
    headers: { Cookie: userCookie },
    data: {
      action: "dismiss",
    },
  });
  expect(dismissed.ok()).toBeTruthy();
  const dismissedJson = await dismissed.json();
  expect(String(dismissedJson.data.dismissedAt || "")).not.toBe("");

  const reopened = await request.patch(`${baseURL}/api/first-success-guide`, {
    headers: { Cookie: userCookie },
    data: {
      action: "reopen",
    },
  });
  expect(reopened.ok()).toBeTruthy();
  const reopenedJson = await reopened.json();
  expect(reopenedJson.data.dismissedAt).toBeNull();
  expect((reopenedJson.data.completedSteps as number[]).includes(2)).toBe(true);
});

test("writer core flow supports capture, generate, template extract and export", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);

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
  expect(String(extractedJson.data.config?.schemaVersion || "")).toBe("v2");
  expect(String(extractedJson.data.config?.layout?.backgroundStyle || "")).not.toBe("");
  expect(String(extractedJson.data.config?.typography?.titleStyle || "")).not.toBe("");
  expect(String(extractedJson.data.config?.blocks?.recommendationStyle || "")).not.toBe("");

  const templates = await request.get(`${baseURL}/api/templates`, {
    headers: { Cookie: cookie },
  });
  expect(templates.ok()).toBeTruthy();
  const templatesJson = await templates.json();
  expect(
    Array.isArray(templatesJson.data) &&
      templatesJson.data.some((item: { id?: string; ownerUserId?: number | null }) => item.id === extractedJson.data.templateId && item.ownerUserId != null),
  ).toBeTruthy();

  const preview = await request.post(`${baseURL}/api/documents/${documentId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {
      templateId: extractedJson.data.templateId,
    },
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  expect(Array.isArray(previewJson.data.templateSummary)).toBeTruthy();
  expect(previewJson.data.templateSummary.some((item: string) => item.includes("背景：") || item.includes("标题："))).toBeTruthy();
  expect(String(previewJson.data.finalHtml || "")).toContain("<article");

  const exported = await request.get(`${baseURL}/api/documents/${documentId}/export?format=markdown`, {
    headers: { Cookie: cookie },
  });
  expect(exported.ok()).toBeTruthy();
  const markdown = await exported.text();
  expect(markdown).toContain("E2E 文稿");
});

test("writer workflow supports stage artifacts from audience to deep writing", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  const persona = await ensureAuthorPersona(baseURL!, request, cookie);
  expect(persona).toBeTruthy();

  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 阶段产物文稿",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const capture = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "阶段产物素材",
      content: "2026 年，内容产品开始把选题、人设、受众、结构和事实核查接成一条可追踪工作流，关键约束是信息密度、可信度和发布效率。",
    },
  });
  expect(capture.ok()).toBeTruthy();

  const audience = await request.post(`${baseURL}/api/documents/${documentId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
  });
  expect(audience.ok()).toBeTruthy();
  const audienceJson = await audience.json();
  expect(String(audienceJson.data.stageCode)).toBe("audienceAnalysis");
  expect(Array.isArray(audienceJson.data.payload?.readerSegments)).toBeTruthy();

  const selectedReaderLabel = String(audienceJson.data.payload?.readerSegments?.[0]?.label || "").trim();
  const selectedLanguageGuidance = String(audienceJson.data.payload?.languageGuidance?.[0] || "").trim();
  const audienceSave = await request.patch(`${baseURL}/api/documents/${documentId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedReaderLabel,
          selectedLanguageGuidance,
          selectedBackgroundAwareness: String(audienceJson.data.payload?.backgroundAwarenessOptions?.[0] || "").trim() || null,
          selectedReadabilityLevel: String(audienceJson.data.payload?.readabilityOptions?.[0] || "").trim() || null,
          selectedCallToAction: String(audienceJson.data.payload?.recommendedCallToAction || "").trim() || "结尾给出下一步观察点。",
        },
      },
    },
  });
  expect(audienceSave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/documents/${documentId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  expect(String(outlineJson.data.stageCode)).toBe("outlinePlanning");
  expect(Array.isArray(outlineJson.data.payload?.outlineSections)).toBeTruthy();

  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 阶段产物文稿").trim();
  const outlineSave = await request.patch(`${baseURL}/api/documents/${documentId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/documents/${documentId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();
  expect(String(deepWritingJson.data.stageCode)).toBe("deepWriting");
  expect(String(deepWritingJson.data.payload?.selectedTitle || "")).not.toBe("");
  expect(Array.isArray(deepWritingJson.data.payload?.sectionBlueprint)).toBeTruthy();
  expect((deepWritingJson.data.payload?.sectionBlueprint || []).length).toBeGreaterThan(0);
  expect(Array.isArray(deepWritingJson.data.payload?.voiceChecklist)).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/documents/${documentId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  expect(String(generatedJson.data.markdownContent || "")).toContain(selectedTitle);

  const preview = await request.post(`${baseURL}/api/documents/${documentId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  expect(previewJson.data.publishGuard.canPublish).toBe(false);
  expect(Array.isArray(previewJson.data.publishGuard.checks)).toBeTruthy();
  expect(Array.isArray(previewJson.data.publishGuard.stageReadiness)).toBeTruthy();
  expect(typeof previewJson.data.publishGuard.aiNoise?.score).toBe("number");
  expect(typeof previewJson.data.publishGuard.materialReadiness?.attachedFragmentCount).toBe("number");
  expect(typeof previewJson.data.publishGuard.connectionHealth?.status).toBe("string");
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "outlinePlanning")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "deepWriting")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "wechatConnection")?.status).toBe("blocked");
  expect(["warning", "passed"]).toContain(String(checks.find((item) => item.key === "prosePolish")?.status || ""));
});

test("writer workflow can apply fact check and prose polish artifacts back to document", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);

  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 核查润色闭环文稿",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const capture = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "核查润色素材",
      content: "2026 年，越来越多公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线，以减少空话、误引和发布返工。",
    },
  });
  expect(capture.ok()).toBeTruthy();

  const audience = await request.post(`${baseURL}/api/documents/${documentId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
  });
  expect(audience.ok()).toBeTruthy();
  const audienceJson = await audience.json();
  const audienceSave = await request.patch(`${baseURL}/api/documents/${documentId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedReaderLabel: String(audienceJson.data.payload?.readerSegments?.[0]?.label || "").trim() || null,
          selectedLanguageGuidance: String(audienceJson.data.payload?.languageGuidance?.[0] || "").trim() || null,
          selectedBackgroundAwareness: String(audienceJson.data.payload?.backgroundAwarenessOptions?.[0] || "").trim() || null,
          selectedReadabilityLevel: String(audienceJson.data.payload?.readabilityOptions?.[0] || "").trim() || null,
          selectedCallToAction: String(audienceJson.data.payload?.recommendedCallToAction || "").trim() || "结尾给出执行建议。",
        },
      },
    },
  });
  expect(audienceSave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/documents/${documentId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 核查润色闭环文稿").trim();
  const outlineSave = await request.patch(`${baseURL}/api/documents/${documentId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/documents/${documentId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/documents/${documentId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();

  const factCheck = await request.post(`${baseURL}/api/documents/${documentId}/stages/factCheck`, {
    headers: { Cookie: cookie },
  });
  expect(factCheck.ok()).toBeTruthy();

  const factCheckPatched = await request.patch(`${baseURL}/api/documents/${documentId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "关键事实表述已经收敛为稳妥口径。",
        overallRisk: "low",
        checks: [
          {
            claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
            status: "verified",
            suggestion: "保留这条表述。",
          },
          {
            claim: "这能减少空话、误引和发布返工。",
            status: "opinion",
            suggestion: "保留判断语气，不要写成绝对结论。",
          },
        ],
        evidenceCards: [
          {
            claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
            supportLevel: "strong",
            evidenceItems: [
              {
                title: "核查润色素材",
                excerpt: "越来越多公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
                sourceType: "manual",
                sourceUrl: null,
                rationale: "来自当前已采集素材，可支持正文主张。",
              },
            ],
          },
        ],
        missingEvidence: [],
        personaAlignment: "当前正文与作者人设一致。",
        topicAlignment: "当前正文与主题主轴一致。",
        selection: {
          claimDecisions: [
            {
              claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
              action: "keep",
              note: "保留事实表达。",
            },
          ],
        },
      },
    },
  });
  expect(factCheckPatched.ok()).toBeTruthy();

  const factCheckApplied = await request.post(`${baseURL}/api/documents/${documentId}/stages/factCheck/apply`, {
    headers: { Cookie: cookie },
  });
  expect(factCheckApplied.ok()).toBeTruthy();
  const factCheckAppliedJson = await factCheckApplied.json();
  expect(String(factCheckAppliedJson.data.stageCode || "")).toBe("factCheck");
  expect(String(factCheckAppliedJson.data.applyMode || "")).toBe("targeted");
  expect(String(factCheckAppliedJson.data.markdownContent || "")).toContain(selectedTitle);

  const prosePolish = await request.post(`${baseURL}/api/documents/${documentId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
  });
  expect(prosePolish.ok()).toBeTruthy();

  const prosePolishPatched = await request.patch(`${baseURL}/api/documents/${documentId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "语言节奏已经更紧，开头抓力更强。",
        overallDiagnosis: "信息密度成立，但首段还可以更直接。",
        strengths: ["信息密度够高", "判断句比较集中"],
        issues: [
          {
            type: "开头发力不足",
            example: "第一段进入判断稍慢。",
            suggestion: "先抛出结论，再解释为什么公众号作者要把核查与排版绑在一起。",
          },
        ],
        rewrittenLead: "真正拖慢公众号写作的，不是不会生成，而是每次都要在事实、语气和排版之间来回返工。",
        punchlines: ["把核查、语言守卫和排版拆开，返工就会回来。"],
        rhythmAdvice: ["第二段改短句", "结尾保留一个判断句做收束"],
      },
    },
  });
  expect(prosePolishPatched.ok()).toBeTruthy();

  const prosePolishApplied = await request.post(`${baseURL}/api/documents/${documentId}/stages/prosePolish/apply`, {
    headers: { Cookie: cookie },
  });
  expect(prosePolishApplied.ok()).toBeTruthy();
  const prosePolishAppliedJson = await prosePolishApplied.json();
  expect(String(prosePolishAppliedJson.data.stageCode || "")).toBe("prosePolish");
  expect(String(prosePolishAppliedJson.data.applyMode || "")).toBe("targeted");
  expect(String(prosePolishAppliedJson.data.markdownContent || "")).toContain("公众号");

  const preview = await request.post(`${baseURL}/api/documents/${documentId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "alignment")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "prosePolish")?.status).toBe("passed");
});

test("settings page exposes workspace asset center summary", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);

  const response = await request.get(`${baseURL}/settings`, {
    headers: { Cookie: cookie },
  });
  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain("个人空间资产");
  expect(html).toContain("资产状态");
  expect(html).toContain("待处理事项");
  expect(html).toContain("最近沉淀");
  expect(html).toContain("图片资产空间");
});

test("workspace asset pages expose knowledge cards and image assets", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);

  const fragmentOne = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "知识卡碎片 A",
      content: "AI 团队正在把事实核查、风格润色和发布守门合并成统一流程，以减少公众号返工。",
    },
  });
  expect(fragmentOne.ok()).toBeTruthy();

  const fragmentTwo = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "知识卡碎片 B",
      content: "当选题、证据和发布连接不在一个闭环里时，创作者会在最后一公里反复返工。",
    },
  });
  expect(fragmentTwo.ok()).toBeTruthy();

  const compiled = await request.post(`${baseURL}/api/knowledge/compile`, {
    headers: { Cookie: cookie },
  });
  expect(compiled.ok()).toBeTruthy();
  const compiledJson = await compiled.json();
  const knowledgeTitle = String(compiledJson.data.title || "");
  expect(knowledgeTitle).not.toBe("");

  const { selectedTitle } = await createPublishReadyDocument(baseURL!, request, cookie, {
    title: "E2E 图片资产页文稿",
  });

  const knowledgePage = await request.get(`${baseURL}/knowledge?cardId=${compiledJson.data.id}`, {
    headers: { Cookie: cookie },
  });
  expect(knowledgePage.ok()).toBeTruthy();
  const knowledgeHtml = await knowledgePage.text();
  expect(knowledgeHtml).toContain("主题档案");
  expect(knowledgeHtml).toContain(knowledgeTitle);
  expect(knowledgeHtml).not.toContain("共享范围");
  expect(knowledgeHtml).not.toContain("个人作用域");

  const assetsPage = await request.get(`${baseURL}/assets`, {
    headers: { Cookie: cookie },
  });
  expect(assetsPage.ok()).toBeTruthy();
  const assetsHtml = await assetsPage.text();
  expect(assetsHtml).toContain("图片资产");
  expect(assetsHtml).toContain("图片资产空间");
  expect(assetsHtml).toContain(selectedTitle);
});

test("workspace fragment and connection pages expose personal asset entries", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);
  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);

  const fragment = await request.post(`${baseURL}/api/capture/manual`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 碎片资产",
      content: "这是一条用于验证个人空间碎片页的素材输入。",
    },
  });
  expect(fragment.ok()).toBeTruthy();

  const fragmentsPage = await request.get(`${baseURL}/fragments`, {
    headers: { Cookie: cookie },
  });
  expect(fragmentsPage.ok()).toBeTruthy();
  const fragmentsHtml = await fragmentsPage.text();
  expect(fragmentsHtml).toContain("碎片素材");
  expect(fragmentsHtml).toContain("E2E 碎片资产");

  const connectionsPage = await request.get(`${baseURL}/connections`, {
    headers: { Cookie: cookie },
  });
  expect(connectionsPage.ok()).toBeTruthy();
  const connectionsHtml = await connectionsPage.text();
  expect(connectionsHtml).toContain("发布连接");
  expect(connectionsHtml).toContain(String(connection.accountName || "Mock 微信公众号"));
});

test("internal scheduler topic sync route supports idempotent window trigger", async ({ request, baseURL }) => {
  const response = await request.post(`${baseURL}/api/internal/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 6,
      force: true,
    },
  });
  expect(response.ok()).toBeTruthy();

  const json = await response.json();
  expect(typeof json.data.windowLabel).toBe("string");
  expect(String(json.data.windowLabel)).toContain("北京时间");
  expect(typeof json.data.syncWindowStart).toBe("string");
  expect(json.data.scheduledSourceCount).toBeGreaterThanOrEqual(0);
});

test("internal scheduler topic sync route supports compensation retry windows", async ({ request, baseURL }) => {
  const response1815 = await request.post(`${baseURL}/api/internal/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 18,
      windowMinute: 15,
      force: true,
    },
  });
  expect(response1815.ok()).toBeTruthy();

  const json1815 = await response1815.json();
  expect(String(json1815.data.windowLabel)).toContain("补偿窗口");
  expect(String(json1815.data.windowLabel)).toContain("18:15");
  expect(String(json1815.data.syncWindowStart)).toContain("T18:15:00+08:00");

  const response0645 = await request.post(`${baseURL}/api/internal/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 6,
      windowMinute: 45,
      force: true,
    },
  });
  expect(response0645.ok()).toBeTruthy();

  const json0645 = await response0645.json();
  expect(String(json0645.data.windowLabel)).toContain("补偿窗口");
  expect(String(json0645.data.windowLabel)).toContain("06:45");
  expect(String(json0645.data.syncWindowStart)).toContain("T06:45:00+08:00");
});

test("admin topic source sync records failures and supports retry window", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  const sourceName = `E2E 失败信源 ${Date.now()}`;

  const created = await request.post(`${baseURL}/api/admin/topic-sources`, {
    headers: { Cookie: cookie },
    data: {
      name: sourceName,
      homepageUrl: "http://127.0.0.1:1/e2e-topic-sync-fail",
      sourceType: "news",
      priority: 1,
    },
  });
  expect(created.ok()).toBeTruthy();

  const listed = await request.get(`${baseURL}/api/admin/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  const source = (Array.isArray(listedJson.data) ? listedJson.data : []).find((item: { name?: string }) => item.name === sourceName);
  expect(source).toBeTruthy();

  const synced = await request.post(`${baseURL}/api/admin/topic-sources/${source.id}/sync`, {
    headers: { Cookie: cookie },
    data: {
      limitPerSource: 1,
    },
  });
  expect(synced.ok()).toBeTruthy();
  const syncedJson = await synced.json();
  expect(String(syncedJson.data.status || "")).toBe("failed");
  expect(Number(syncedJson.data.failedSourceCount || 0)).toBe(1);
  expect(Number(syncedJson.data.runId || 0)).toBeGreaterThan(0);

  const listedAfterFailure = await request.get(`${baseURL}/api/admin/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listedAfterFailure.ok()).toBeTruthy();
  const listedAfterFailureJson = await listedAfterFailure.json();
  const failedSource = (Array.isArray(listedAfterFailureJson.data) ? listedAfterFailureJson.data : []).find(
    (item: { name?: string }) => item.name === sourceName,
  );
  expect(failedSource).toBeTruthy();
  expect(String(failedSource.status || "")).toBe("degraded");
  expect(Number(failedSource.attemptCount || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(failedSource.consecutiveFailures || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(failedSource.healthScore || 0)).toBeLessThan(100);
  expect(String(failedSource.lastError || "")).not.toBe("");
  expect(String(failedSource.degradedReason || "")).not.toBe("");
  expect(failedSource.nextRetryAt).toBeTruthy();

  const retried = await request.post(`${baseURL}/api/admin/topic-sync/${syncedJson.data.runId}/retry`, {
    headers: { Cookie: cookie },
    data: {
      limitPerSource: 1,
    },
  });
  expect(retried.ok()).toBeTruthy();
  const retriedJson = await retried.json();
  expect(Number(retriedJson.data.retriedSourceCount || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(retriedJson.data.failedSourceCount || 0)).toBeGreaterThanOrEqual(1);
});

test("admin seeded topic sources cover first-wave source types", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);

  const listed = await request.get(`${baseURL}/api/admin/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();

  const listedJson = await listed.json();
  const systemSources = (Array.isArray(listedJson.data) ? listedJson.data : []).filter(
    (item: { connectorScope?: string | null }) => (item.connectorScope ?? "system") === "system",
  );
  const sourceTypes = new Set(
    systemSources.map((item: { sourceType?: string | null }) => String(item.sourceType || "news").toLowerCase()),
  );

  expect(sourceTypes.has("youtube")).toBeTruthy();
  expect(sourceTypes.has("reddit")).toBeTruthy();
  expect(sourceTypes.has("podcast")).toBeTruthy();
  expect(sourceTypes.has("spotify")).toBeTruthy();
  expect(sourceTypes.has("rss")).toBeTruthy();
  expect(sourceTypes.has("blog")).toBeTruthy();
  expect(sourceTypes.has("news")).toBeTruthy();
});

test("admin object storage presets can be saved and tested", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);

  const saved = await request.put(`${baseURL}/api/admin/object-storage`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "s3-compatible",
      providerPreset: "cloudflare-r2",
      endpoint: "https://example-account.r2.cloudflarestorage.com",
      bucketName: "huoziwriter-e2e",
      region: "auto",
      accessKeyId: "e2e-access-key",
      secretAccessKey: "e2e-secret-access-key",
      publicBaseUrl: "https://pub-e2e.r2.dev",
      pathPrefix: "e2e/assets",
      isEnabled: false,
    },
  });
  expect(saved.ok()).toBeTruthy();
  const savedJson = await saved.json();
  expect(String(savedJson.data.providerPreset || "")).toBe("cloudflare-r2");
  expect(String(savedJson.data.providerName || "")).toBe("s3-compatible");
  expect(String(savedJson.data.effectiveProvider || "")).toBe("local");

  const loaded = await request.get(`${baseURL}/api/admin/object-storage`, {
    headers: { Cookie: cookie },
  });
  expect(loaded.ok()).toBeTruthy();
  const loadedJson = await loaded.json();
  expect(String(loadedJson.data.providerPreset || "")).toBe("cloudflare-r2");
  expect(String(loadedJson.data.region || "")).toBe("auto");

  const savedAws = await request.put(`${baseURL}/api/admin/object-storage`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "s3-compatible",
      providerPreset: "aws-s3",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucketName: "huoziwriter-e2e",
      region: "us-east-1",
      accessKeyId: "e2e-aws-access-key",
      secretAccessKey: "e2e-aws-secret-key",
      publicBaseUrl: "https://huoziwriter-e2e.s3.us-east-1.amazonaws.com",
      pathPrefix: "wechat/assets",
      isEnabled: false,
    },
  });
  expect(savedAws.ok()).toBeTruthy();
  const savedAwsJson = await savedAws.json();
  expect(String(savedAwsJson.data.providerPreset || "")).toBe("aws-s3");
  expect(String(savedAwsJson.data.region || "")).toBe("us-east-1");

  const loadedAws = await request.get(`${baseURL}/api/admin/object-storage`, {
    headers: { Cookie: cookie },
  });
  expect(loadedAws.ok()).toBeTruthy();
  const loadedAwsJson = await loadedAws.json();
  expect(String(loadedAwsJson.data.providerPreset || "")).toBe("aws-s3");
  expect(String(loadedAwsJson.data.region || "")).toBe("us-east-1");

  const tested = await request.post(`${baseURL}/api/admin/object-storage/test`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "local",
      providerPreset: "local",
      isEnabled: true,
    },
  });
  expect(tested.ok()).toBeTruthy();
  const testedJson = await tested.json();
  expect(String(testedJson.data.provider || "")).toBe("local");
});

test("cover image workflow returns two candidates and can select one into document assets", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);

  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 封面图闭环文稿",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const generated = await request.post(`${baseURL}/api/images/cover`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      title: "E2E 封面图闭环文稿",
    },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  expect(Array.isArray(generatedJson.data.candidates)).toBeTruthy();
  expect(generatedJson.data.candidates).toHaveLength(2);
  expect(String(generatedJson.data.candidates[0].imageUrl || "")).toContain("/generated-assets/");
  expect(String(generatedJson.data.candidates[1].imageUrl || "")).toContain("/generated-assets/");
  expect(Number(generatedJson.data.candidates[0].assetFileId || 0)).toBeGreaterThan(0);
  expect(Number(generatedJson.data.candidates[1].assetFileId || 0)).toBeGreaterThan(0);
  expect(Number(generatedJson.data.storageQuota?.usedBytes || 0)).toBeGreaterThan(0);
  expect(Number(generatedJson.data.storageQuota?.limitBytes || 0)).toBeGreaterThan(0);

  const selected = await request.post(`${baseURL}/api/images/cover/select`, {
    headers: { Cookie: cookie },
    data: {
      candidateId: generatedJson.data.candidates[0].id,
    },
  });
  expect(selected.ok()).toBeTruthy();
  const selectedJson = await selected.json();
  expect(String(selectedJson.data.imageUrl || "")).toContain("/generated-assets/");
  expect(Number(selectedJson.data.assetFileId || 0)).toBeGreaterThan(0);

  const preview = await request.post(`${baseURL}/api/documents/${documentId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("passed");
});

test("style extractor can analyze a page and save it as writing style profile", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);

  const extracted = await request.post(`${baseURL}/api/tools/style-extractor`, {
    headers: { Cookie: cookie },
    data: {
      url: `${baseURL}/pricing`,
    },
  });
  expect(extracted.ok()).toBeTruthy();
  const extractedJson = await extracted.json();
  expect(String(extractedJson.data.summary || "")).not.toBe("");
  expect(String(extractedJson.data.imitationPrompt || "")).not.toBe("");
  expect(Array.isArray(extractedJson.data.toneKeywords)).toBeTruthy();
  expect(Array.isArray(extractedJson.data.structurePatterns)).toBeTruthy();

  const saved = await request.post(`${baseURL}/api/writing-style-profiles`, {
    headers: { Cookie: cookie },
    data: {
      name: `E2E 风格资产 ${Date.now()}`,
      analysis: extractedJson.data,
    },
  });
  expect(saved.ok()).toBeTruthy();
  const savedJson = await saved.json();
  expect(Number(savedJson.data.id || 0)).toBeGreaterThan(0);
  expect(savedJson.data.saved).toBe(true);

  const listed = await request.get(`${baseURL}/api/writing-style-profiles`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  expect(Array.isArray(listedJson.data)).toBeTruthy();
  expect((listedJson.data as Array<{ id: number }>).some((item) => item.id === savedJson.data.id)).toBeTruthy();
});

test("public style extractor allows guest analysis with visitor quota metadata", async ({ request, baseURL }) => {
  const extracted = await request.post(`${baseURL}/api/tools/style-extractor`, {
    headers: {
      "x-forwarded-for": `203.0.113.${(Date.now() % 200) + 1}`,
    },
    data: {
      url: `${baseURL}/pricing`,
    },
  });
  expect(extracted.ok()).toBeTruthy();
  const extractedJson = await extracted.json();
  expect(String(extractedJson.data.summary || "")).not.toBe("");
  expect(extractedJson.data.canSaveProfile).toBe(false);
  expect(extractedJson.data.viewerPlanCode).toBeNull();
  expect(Number(extractedJson.data.quota?.limit || 0)).toBe(1);
  expect(Number(extractedJson.data.quota?.used || 0)).toBeGreaterThanOrEqual(1);
});

test("pricing page only exposes free pro ultra plans without team residue", async ({ request, baseURL }) => {
  const page = await request.get(`${baseURL}/pricing`);
  expect(page.ok()).toBeTruthy();
  const html = await page.text();
  expect(html).toContain("Free");
  expect(html).toContain("Pro");
  expect(html).toContain("Ultra");
  expect(html).not.toContain("team");
  expect(html).not.toContain("Team");
});

test("topic source managers no longer expose X as a configurable source option", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);

  const radarPage = await request.get(`${baseURL}/radar`, {
    headers: { Cookie: cookie },
  });
  expect(radarPage.ok()).toBeTruthy();
  const radarHtml = await radarPage.text();
  expect(radarHtml).not.toContain('<option value="x">X</option>');

  const adminPage = await request.get(`${baseURL}/admin`, {
    headers: { Cookie: cookie },
  });
  expect(adminPage.ok()).toBeTruthy();
  const adminHtml = await adminPage.text();
  expect(adminHtml).not.toContain('<option value="x">X</option>');
});

test("wechat publish route can publish to mock draft box when publish guard passes", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);
  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);
  const { documentId, selectedTitle } = await createPublishReadyDocument(baseURL!, request, cookie, {
    title: "E2E Mock 微信发布文稿",
  });

  const publishPreview = await request.post(`${baseURL}/api/documents/${documentId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {
      wechatConnectionId: connection.id,
    },
  });
  expect(publishPreview.ok()).toBeTruthy();
  const previewJson = await publishPreview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "outlinePlanning")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "deepWriting")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "alignment")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "prosePolish")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("passed");
  expect(["passed", "warning"]).toContain(String(checks.find((item) => item.key === "wechatConnection")?.status || ""));

  const published = await request.post(`${baseURL}/api/wechat/publish`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      wechatConnectionId: connection.id,
      digest: "E2E mock publish digest",
      author: "Huozi Writer E2E",
    },
  });
  expect(published.ok()).toBeTruthy();
  const publishedJson = await published.json();
  expect(String(publishedJson.data.mediaId || "")).toContain("mock_media_");
});

test("wechat publish can resume after adding missing connection", async ({ request, baseURL }) => {
  const adminCookie = await loginAsAdmin(baseURL!, request);
  await ensureMockImageEngine(baseURL!, request, adminCookie);
  const user = await createE2EUser(baseURL!, request, adminCookie, {
    planCode: "ultra",
  });
  const cookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });
  await ensureAuthorPersona(baseURL!, request, cookie);
  const templateId = await getFirstOfficialTemplateId(baseURL!, request, cookie);
  const { documentId } = await createPublishReadyDocument(baseURL!, request, cookie, {
    title: "E2E 缺连接后恢复发布",
  });

  const firstPublish = await request.post(`${baseURL}/api/wechat/publish`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      templateId,
    },
  });
  expect(firstPublish.ok()).toBeFalsy();
  const firstPublishJson = await firstPublish.json();
  expect(String(firstPublishJson.data?.code || "")).toBe("connection_missing");

  const pending = await request.get(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(pending.ok()).toBeTruthy();
  const pendingJson = await pending.json();
  expect(String(pendingJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");
  expect(String(pendingJson.data.pendingPublishIntent?.templateId || "")).toBe(templateId);

  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);

  const preflight = await request.post(`${baseURL}/api/wechat/preflight`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      wechatConnectionId: connection.id,
      templateId,
    },
  });
  expect(preflight.ok()).toBeTruthy();
  const preflightJson = await preflight.json();
  expect(Boolean(preflightJson.data.canPublish)).toBe(true);
  expect(String(preflightJson.data.connectionHealth?.status || "")).toBe("valid");

  const resumed = await request.post(`${baseURL}/api/wechat/publish/retry`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      wechatConnectionId: connection.id,
      templateId,
    },
  });
  expect(resumed.ok()).toBeTruthy();
  const resumedJson = await resumed.json();
  expect(Boolean(resumedJson.data.retried)).toBe(true);
  expect(String(resumedJson.data.mediaId || "")).toContain("mock_media_");

  const reloadedPending = await request.get(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(reloadedPending.ok()).toBeTruthy();
  const reloadedPendingJson = await reloadedPending.json();
  expect(reloadedPendingJson.data.pendingPublishIntent).toBeNull();
});

test("publish intent can be persisted and cleared through workflow state", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 待恢复发布意图",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const saved = await request.put(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
    data: {
      templateId: "official-essay",
      createdAt: "2026-04-14T10:00:00.000Z",
      reason: "missing_connection",
    },
  });
  expect(saved.ok()).toBeTruthy();
  const savedJson = await saved.json();
  expect(String(savedJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(savedJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");

  const loaded = await request.get(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(loaded.ok()).toBeTruthy();
  const loadedJson = await loaded.json();
  expect(String(loadedJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(loadedJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");

  const cleared = await request.delete(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(cleared.ok()).toBeTruthy();
  const clearedJson = await cleared.json();
  expect(clearedJson.data.pendingPublishIntent).toBeNull();
});

test("wechat publish without connection persists missing-connection intent", async ({ request, baseURL }) => {
  const cookie = await loginAsAdmin(baseURL!, request);
  await ensureAuthorPersona(baseURL!, request, cookie);

  const created = await request.post(`${baseURL}/api/documents`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 缺连接发布意图",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const documentId = createdJson.data.id as number;
  expect(documentId).toBeGreaterThan(0);

  const publish = await request.post(`${baseURL}/api/wechat/publish`, {
    headers: { Cookie: cookie },
    data: {
      documentId,
      templateId: "official-essay",
    },
  });
  expect(publish.ok()).toBeFalsy();
  const publishJson = await publish.json();
  expect(String(publishJson.error || "")).toContain("当前还没有可用公众号连接");
  expect(String(publishJson.data?.code || "")).toBe("connection_missing");

  const pending = await request.get(`${baseURL}/api/documents/${documentId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(pending.ok()).toBeTruthy();
  const pendingJson = await pending.json();
  expect(String(pendingJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(pendingJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");
});
