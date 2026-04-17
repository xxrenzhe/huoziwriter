function buildArticle(kind: string) {
  if (kind === "official") {
    return {
      title: "官方公告：研究工作流升级时间线",
      body: [
        "2023 年，官方公告第一次提出把研究阶段前置，避免正文只剩素材堆叠。",
        "2024 年白皮书继续强调阶段、节点、转折和历史演化，而不是只写单点现象。",
        "到 2025 年，官网更新明确写到：如果没有时间脉络和来源核查，判断不应直接写硬。",
      ].join(" "),
    };
  }
  if (kind === "industry") {
    return {
      title: "行业研究：内容团队为什么开始重建研究层",
      body: [
        "研究机构和行业数据库在 2024 年开始连续跟踪这一变化，认为内容流程正在从写作优先切到研究优先。",
        "多份行业分析把阶段变化、利益格局和供给侧差异列为关键变量，说明这不只是单篇文章技巧问题。",
        "报告指出，今年真正拉开差距的是谁能把历史节点与结构判断连起来。",
      ].join(" "),
    };
  }
  return {
    title: "竞品比较：同类工具、用户反馈与反例",
    body: [
      "对标、竞品、替代路径的比较表明，真正差异不是表面功能，而是研究骨架和组织能力。",
      "社区评论、用户反馈和体验帖子都在反复提到：如果只有支持性案例，没有反证或反例，文章还是会显得空。",
      "也有反向样本提醒，只有把比较、用户口碑差异和 why now 放在一起，判断才不会停在资料整理层。",
    ].join(" "),
  };
}

export async function GET(_: Request, { params }: { params: { kind: string } }) {
  const article = buildArticle(String(params.kind || "").trim());
  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${article.title}</title>
      </head>
      <body>
        <main>
          <article>
            <h1>${article.title}</h1>
            <p>${article.body}</p>
          </article>
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
