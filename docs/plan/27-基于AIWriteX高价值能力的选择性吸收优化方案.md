# HuoziWriter · 基于 AIWriteX 高价值能力的选择性吸收优化方案

> 状态：P0 热点链路已落地；P1 创意镜头运行时与工作区手动选择已落地；P1 参考文章融合运行时、自动化入口与素材面板覆盖已落地；P1/P2 模板 HTML 导入、体验审计、资产页/发布页入口与发布守卫已落地；P2 微信发布可靠性硬化与图片 prompt 复用资产链路已落地；上线验收口径见 `docs/plan/27-Plan27上线验收与真实冒烟清单.md`
> 版本：v1.2 · 2026-04-29
> 调研对象：`https://github.com/iniwap/AIWriteX`  
> 核心结论：不整体引入 AIWriteX，不复制其源码和模板；只吸收高价值产品机制，并在当前 TypeScript / Next.js / 现有自动化流水线内原生重写  
> 适用范围：中文热点源、选题雷达、创意维度、微信模板、参考文章融合、发布可靠性、图片资产工作流  

## 0. 一句话结论

AIWriteX 对当前项目最有价值的不是 CrewAI 运行时，也不是 Python 桌面壳，而是它围绕“公众号增长写作”做出的几个产品判断：

- 写公众号需要更强的中文热点入口
- 热点不能只看搜索结果，还要看平台榜单与时效信号
- 文章不能只生成正文，还要有模板、配图、发布和复盘闭环
- 去“通用 AI 味”的正确方向不是绕检测，而是强化作者姿态、表达变体、真实素材和人味细节

当前 HuoziWriter 已经具备更适合 SaaS 化的底座：

- 场景化 AI 网关
- 文章自动化编排
- 研究简报与证据包
- 写作状态核
- 公众号发布守卫
- 图片 brief 与资产持久化
- 作者人设、文风资产和结果回流

因此最佳策略是：

> 把 AIWriteX 当作竞品机制参考，而不是依赖库或上游框架；用当前项目已有架构重写 5 个高价值增量。

## 1. 边界与原则

### 1.1 明确不做

不做整体引入：

- 不引入 Python / CrewAI / AIForge 作为生产运行时
- 不把 AIWriteX 作为后台子进程调用
- 不复制 AIWriteX 源码中的热点采集、模板、发布工具或 UI 代码
- 不复制其内置 HTML 模板库
- 不引入“对抗 AI 检测”作为产品卖点

原因：

- 技术栈不匹配：当前项目是 Next.js / TypeScript / pnpm monorepo，AIWriteX 是 Python 桌面应用 + FastAPI + PyWebView。
- 当前项目已有更强的场景化网关与状态化流水线，CrewAI 的通用 agent 编排会增加复杂度但不提升核心质量。
- AIWriteX 虽包含 Apache-2.0 LICENSE，但 NOTICE 与部分源码头部包含非商业、分发和 SaaS 限制；当前项目若面向用户提供服务，应避免直接复制代码或模板。
- AIWriteX README 中部分能力宣传强于开源仓实际实现，不能把宣传当作可复用工程资产。

### 1.2 明确要做

只做产品机制级吸收：

- 重新实现中文热点源 Adapter
- 重新实现热点评分与“黑马信号”
- 把“维度化创意”转译为当前写作状态核的表达镜头
- 增强微信模板导入、预览、校验和私有模板资产
- 给参考文章融合增加可控强度
- 将微信发布边界条件整理为当前发布守卫和失败修复规则
- 将图片 prompt 实验室思路合并进现有图片 brief / 资产库

## 2. 当前项目基线

当前项目已经存在以下能力，新增方案必须复用这些底座：

- `apps/web/src/lib/ai-gateway.ts`：按 scene code 路由模型，支持 provider、fallback、shadow traffic 与观测。
- `apps/web/src/lib/article-automation-orchestrator.ts`：按阶段编排自动化文章生产线，包括选题、研究、标题、开头、深写作、事实修复、语言守卫、图片和发布。
- `apps/web/src/lib/topic-source-adapters.ts`：已有 topic source adapter 结构，适合扩展中文热点榜源。
- `apps/web/src/lib/research-source-search.ts`：已有 SearXNG 搜索接入，可补充搜索结果，不应被热点榜替代。
- `apps/web/src/lib/writing-state.ts`：已有文章原型、写作状态、节奏、证据模式和反模板规则。
- `apps/web/src/lib/layout-templates.ts`：已有模板版本、官方/私有模板与发布模板选择。
- `apps/web/src/lib/wechat-publish.ts`：已有微信发布幂等、发布守卫、视觉准备、同步日志与失败分类。
- `apps/web/src/lib/article-image-generator.ts`：已有图片 brief、生成、质量门槛、资产持久化和发布准备。

这意味着 AIWriteX 的价值不在“补一个完整系统”，而在“补当前系统最缺的输入源、表达维度和微信端体验”。

## 3. 高价值能力优先级矩阵

| 能力 | 价值 | 投入 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| 中文热点源 Adapter | 高 | 中 | 中 | P0，优先做 |
| 热点评分与黑马信号 | 高 | 中 | 中 | P0，和热点源一起做 |
| 创意维度镜头 | 中高 | 低中 | 低 | P1，复用写作状态核 |
| 微信模板导入/预览/校验 | 中高 | 中高 | 中 | P1/P2，适合产品体验升级 |
| 参考文章融合比例 | 中 | 低中 | 低 | P1，适合作为生成参数 |
| 微信发布边界条件增强 | 中 | 低 | 低 | P2，补可靠性 |
| 图片 Prompt 实验室 | 中 | 中 | 低 | P2，合并进资产中心 |
| CrewAI 多智能体 | 低 | 高 | 高 | 不做 |
| Python 桌面壳/手机机器人 | 低 | 高 | 高 | 不做 |
| AI 检测对抗 | 低 | 中 | 高 | 不做，改成风格真实度与语言守卫 |

## 4. P0：中文热点源 Adapter

### 4.0 本轮 review 后新增的硬约束

P0 不能直接从“抓 4 个热点源”开始，否则热度字段会在现有链路里丢失。先补三件基础设施：

1. `FetchedTopicCandidate` 增加 `sourceMeta`，至少保留 `provider / providerLabel / rank / heatValue / heatLabel / capturedAt`。
2. `topic_backlog_items` 增加 `source_meta_json`，并在 SQLite / Postgres schema bootstrap 和类型映射中同时落地。
3. 热点评分先做纯函数，不依赖实时网络；adapter 失败只影响该 provider，不影响已有 RSS / HN / V2EX / Remotive 链路。

只有这三件打通后，再接 Warroom、自动化起稿和 UI 展示，避免“文档有 provider，系统里看不到 provider”的半落地。

### 4.1 目标

把当前偏通用的信源体系补齐到更适合中文公众号选题：

- 微博热搜
- 抖音热点
- 小红书趋势
- 知乎热榜
- B站热门
- 今日头条热榜
- 百度热点
- 澎湃 / 虎扑 / 豆瓣等可选垂类

输出仍然进入当前统一结构：

```ts
type FetchedTopicCandidate = {
  title: string;
  sourceUrl: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  sourceMeta?: Record<string, unknown> | null;
};
```

第一阶段不追求所有平台都稳定可用，先做可降级、可观测、可配置。MVP 不把强登录或反爬明显的平台设为默认源。

### 4.2 实现策略

新增原生 TypeScript 模块：

- `apps/web/src/lib/chinese-hotspot-sources.ts`
- `apps/web/src/lib/chinese-hotspot-score.ts`
- `apps/web/src/lib/__tests__/chinese-hotspot-sources.test.ts`
- `apps/web/src/lib/__tests__/chinese-hotspot-score.test.ts`

扩展现有模块：

- `apps/web/src/lib/topic-source-adapters.ts`
- `apps/web/src/lib/topic-backlogs.ts`
- `apps/web/src/lib/topic-backlog-ideation.ts`
- `apps/web/src/app/admin/topic-sources/page.tsx`
- `apps/web/src/app/(writer)/settings/sources/page.tsx`

### 4.3 Adapter 设计

每个平台实现统一接口：

```ts
type ChineseHotspotProviderCode =
  | "weibo"
  | "douyin"
  | "xiaohongshu"
  | "zhihu"
  | "bilibili"
  | "toutiao"
  | "baidu"
  | "thepaper"
  | "hupu"
  | "douban";

type ChineseHotspotItem = {
  provider: ChineseHotspotProviderCode;
  providerLabel: string;
  title: string;
  url: string | null;
  rank: number | null;
  heatValue: number | null;
  heatLabel: string | null;
  summary: string | null;
  capturedAt: string;
};
```

再映射到 `FetchedTopicCandidate`，并把结构化热度信息放进 `sourceMeta` 或 backlog item metadata。

### 4.4 数据源原则

按稳定性分三档：

- A 档：公开 JSON / RSS / API 可稳定访问，优先接入。
- B 档：HTML 可解析但结构可能变化，允许作为可选源。
- C 档：强登录、强反爬、授权不清晰或频繁变化，不作为默认源。

默认启用 A/B 中稳定平台，其他平台放在 admin topic source 配置中由管理员手动启用。

### 4.5 安全与合规

- 不绕登录。
- 不绕反爬。
- 不采集用户隐私。
- 不持久化完整页面 HTML。
- 只保存选题标题、榜单位置、来源 URL、摘要和抓取时间。
- 对平台失败做降级，不阻塞自动化主链路。

### 4.6 验收标准

- 至少 2 个稳定中文热点源可用，另有 2 个 provider 可以配置但默认关闭；确认稳定后再升为默认源。
- 单个热点源失败不会导致 topic sync 整体失败。
- 每条候选都有 provider、rank 或 capturedAt。
- topic backlog 能看出候选来自哪个热点平台。
- 相同标题跨平台出现时能合并或加权，不重复塞满列表。

## 5. P0：热点评分与黑马信号

### 5.1 目标

AIWriteX 的“流量预测 / 黑马挖掘”宣传不应照搬，但可以落地一个可解释的实用版：

> 用排名、跨平台重复、时间新鲜度、热度标签、题材匹配和历史重复惩罚，给候选选题生成一个可解释的 hotness score。

### 5.2 评分字段

新增评分结果：

```ts
type HotspotScore = {
  score: number;
  tier: "breaking" | "rising" | "steady" | "weak";
  reasons: string[];
  providerCount: number;
  bestRank: number | null;
  recencyMinutes: number | null;
  noveltyPenalty: number;
  sourceReliabilityScore: number;
};
```

建议评分维度：

- `rankScore`：排名越靠前越高。
- `crossPlatformScore`：多个平台同时出现加分。
- `recencyScore`：抓取越新越高。
- `heatValueScore`：平台有热度数字时加权。
- `topicFitScore`：与用户题材、系列、backlog 方向匹配时加分。
- `noveltyPenalty`：近期已写过、已入库、相似标题过多时降权。
- `sourceReliabilityScore`：来源越稳定越高。

### 5.3 黑马信号口径

不要宣称预测未来流量，只给“早期上升信号”：

- 排名不一定第一，但多个平台同时出现。
- 单平台排名快速前移。
- 标题包含新产品、新政策、新冲突、新版本、新人物动作。
- 与用户账号垂类强相关，但主流大平台还未完全刷屏。
- 当前知识库 / 历史文章中有可承接素材。

展示文案使用：

- `早期上升`
- `跨平台共振`
- `垂类机会`
- `可承接素材充足`

避免使用：

- `必爆`
- `预测 10w+`
- `提前 6 小时锁定`

### 5.4 接入位置

- Warroom 机会池：优先展示 `breaking / rising`。
- Topic backlog seed：把 `score / tier / reasons` 写入 item metadata。
- 自动化起稿：当用户没有指定题目时，可优先从高分候选中选。
- Admin topic sources：展示每个来源的最近成功率与候选质量。

### 5.5 验收标准

- 同一标题跨平台出现时分数高于单平台低排名候选。
- 最近已经写过的主题会降权。
- 评分原因可读，不能只有数字。
- 评分逻辑有纯函数测试。
- 失败来源不影响其他来源评分。
- 评分输入和输出不依赖数据库，数据库只负责保存快照和推荐结果。

### 5.6 已落地范围

截至 `2026-04-29`，P0 已完成以下工程落地：

- `FetchedTopicCandidate.sourceMeta` 已打通，中文热点 adapter 会保留 `provider / providerLabel / rank / heatValue / heatLabel / capturedAt / sourceKind`。
- `topic_items.source_meta_json`、`hot_event_clusters.source_meta_json`、`topic_recommendations.source_meta_json`、`topic_backlog_items.source_meta_json` 已补齐 SQLite / Postgres schema 与 legacy bootstrap。
- `hot_event_clusters` 会保存聚合后的 `hotspotScore`、`hotspotSources` 和 provider 摘要，推荐排序可直接读取，不再依赖 evidence 子表旁路。
- `topic_recommendations` 会持久化热点元信息，并把可读热点原因拼入推荐理由。
- 从选题雷达加入 backlog 时，热点推荐会写成 `sourceType: "hotspot"`，并把推荐分数、来源、相关链接和原始热点元信息写入 `sourceMeta.recommendation`。
- 已补充聚焦测试覆盖 adapter、纯评分函数、topic sync、topic recommendation 持久化和 backlog 元信息保存。
- 系统默认源已补入 2 个默认启用中文热点源：`百度热点`、`知乎热榜`；另补 `微博热搜`、`B站热门` 作为默认关闭的可配置源。
- 新增 `POST /api/admin/topic-sources/chinese-hotspots/sync`，用于只刷新中文热点源；复用现有 source connector 健康记录和单源失败降级逻辑。

这次落地修复的根因是：此前只在采集候选和 evidence payload 中保存热度字段，推荐表和 backlog seed 没有承接字段，导致自动写作后续阶段看不到“为什么这个热点值得写”。现在链路改为 `topic_items -> hot_event_clusters -> topic_recommendations -> topic_backlog_items` 全程持久化。

## 6. P1：创意维度镜头

### 6.1 目标

AIWriteX 的维度化创意系统包含文体、情绪、受众、视角、结构、节奏等维度。当前项目已经有更强的写作状态核，不需要新增独立 agent，只需要把这些维度产品化为“表达镜头”。

目标不是让文章花哨，而是解决两个问题：

- 同一套素材生成出来的文章风格过于稳定、像模板。
- 用户希望同题材能有不同表达打法，但不想手动写复杂 prompt。

### 6.2 新增概念

```ts
type CreativeLensCode =
  | "case_dissection"
  | "field_observation"
  | "sharp_opinion"
  | "warm_personal"
  | "experimental_walkthrough"
  | "counterintuitive_analysis"
  | "tool_operator"
  | "founder_memo";
```

每个 lens 映射到：

- 叙述姿态
- 读者距离
- 判断强度
- 情绪温度
- 段落呼吸
- 开头动作
- 证据偏好
- 禁止写法

这些字段直接复用 `writing-state.ts` 的 `WritingStateKernel`，不另建一套 prompt 系统。

### 6.3 接入方式

新增：

- `apps/web/src/lib/creative-lenses.ts`
- `apps/web/src/lib/__tests__/creative-lenses.test.ts`

扩展：

- `apps/web/src/lib/writing-state.ts`
- `apps/web/src/lib/generation.ts`
- `apps/web/src/lib/article-writing-context.ts`
- `apps/web/src/app/(writer)/articles/[articleId]/_shell.tsx`

运行时策略：

- 用户不选时，系统根据 strategy card、research brief、作者账本自动推荐。
- 用户可在稿件工作区选择 lens。
- lens 只影响写作执行卡和 prompt context，不改变已有文章阶段。
- lens 与作者文风冲突时，以作者高置信文风为准。

### 6.4 与“去 AI 味”的关系

不使用“AI 检测对抗”口径。改成三层可解释能力：

- 作者姿态：这篇是否像这个作者会说的话。
- 人味细节：是否有真实场景、具体动作、犹豫、代价、反证。
- 结构破板：是否避免过度工整的总分总、机械列表、万能转折。

这些能力可接入已有：

- language guard
- persona consistency audit
- information gain audit
- author outcome feedback ledger

### 6.5 验收标准

- 同一选题切换不同 lens，生成 brief 和 deep writing instruction 明显不同。
- lens 不会覆盖作者高置信文风约束。
- 默认推荐 lens 可解释。
- 至少 6 个 lens 有测试覆盖。

### 6.6 已落地范围

截至 `2026-04-29`，创意镜头已完成运行时和主要用户路径落地：

- 新增 `apps/web/src/lib/creative-lenses.ts`，内置 8 个 lens：案例拆解、现场观察、锐评判断、温热个人、实测走查、反常识分析、工具操盘、创始人备忘录。
- `buildWritingStateKernel` 已支持自动推荐和 `preferredCreativeLensCode` 手动指定；默认根据标题、正文、人类信号、研究简报、策略卡和文章原型推荐 lens。
- lens 会进入 `WritingStateKernel` 的叙述姿态、读者距离、判断强度、情绪温度、开头动作、章节节奏、证据组织、反结构规则和禁忌写法。
- lens 不替代作者文风资产：已有 `paragraphBreathingPattern / factDensity / emotionalIntensity / antiOutlineRules / tabooPatterns` 会优先保留，lens 只补方向和微调约束。
- deep writing fallback payload 和 normalize 链路已保留 `creativeLensCode / creativeLensLabel / creativeLensReason / creativeLensInstruction / creativeLensOptions`，后续正文生成器可以稳定拿到镜头信息。
- 稿件工作区深度写作阶段已支持手动选择 lens：切换后可重生写作执行卡，开始正文生成前也会检测未刷新的 lens override 并自动刷新执行卡。
- 自动化起稿入口已支持 `preferredCreativeLensCode`，创建 run 时会持久化到 `generation_settings_json`，并传入研究、深写作和自动化编排链路。
- `author_outcome_feedback_ledgers` 已新增 lens 维度的长期结果统计：`creativeLensSignals` 会记录每种镜头的样本数、正向样本、推荐命中和排序调整，`recommendations.creativeLens` 会形成作者级镜头偏好。
- `buildWritingStateKernel` 的自动 lens 推荐已读取作者历史结果：历史高命中镜头会进入评分和推荐原因，手动指定 `preferredCreativeLensCode` 仍保持最高优先级。
- 文章结果快照已回写 `recommendedCreativeLensCode / adoptedCreativeLensCode / followedCreativeLensRecommendation`，后续刷新作者结果账本时可判断这篇文章是否采用了系统推荐镜头。
- 深度写作工作区的 lens 选项会展示自动推荐和历史结果信号，避免创意镜头只停留在一次性选择，而是纳入长期胜率闭环。
- 新增 `apps/web/src/lib/__tests__/creative-lenses.test.ts`，覆盖自动推荐、同题材手动切换差异、6 个 lens 指令差异、文风资产优先级。
- 新增/扩展测试覆盖：`creative-lenses.test.ts`、`author-outcome-feedback-ledger.test.ts`、`article-outcome-runtime.test.ts`、`generation-author-outcome-feedback-guide.test.ts`。

## 7. P1/P2：微信模板导入、预览与校验

### 7.1 目标

AIWriteX 在微信公众号模板体验上有启发：模板不是简单样式，而是“发布成功率 + 手机阅读体验 + 账号视觉资产”。

当前项目已有 layout template 数据结构，下一步应补：

- 私有 HTML 模板导入
- 移动端微信预览
- 内联样式校验
- 暗色模式风险提示
- 图片位置与第一屏长度检查
- 模板版本管理

### 7.2 不做什么

- 不复制 AIWriteX 内置模板。
- 不内置来源不明的 HTML 模板。
- 不让模型直接生成不可控完整 HTML 后跳过校验。
- 不把模板编辑器做成无限复杂的网页设计器。

### 7.3 MVP 范围

新增“模板导入向导”：

1. 粘贴或上传 HTML。
2. 自动检测是否符合微信发布约束。
3. 提取标题、正文、引用、图片占位区域。
4. 生成模板摘要：色系、段落密度、首屏高度、图片槽位。
5. 存入私有模板版本。
6. 在发布前预览并进入 publish guard。

### 7.4 校验规则

第一版只做硬规则：

- 禁止外部脚本。
- 禁止不可控外链 CSS。
- 检查 `<style>` 或内联样式策略是否符合当前渲染器能力。
- 检查正文容器是否能承载 markdown render 结果。
- 检查移动端宽度。
- 检查图片 URL 是否可上传或已在资产库。
- 检查标题长度、摘要长度和封面图。

第二版再做体验规则：

- 首屏是否过长。
- 文字对比度是否过低。
- 暗色模式是否风险高。
- 段落间距是否过密。
- 图片是否过多或过少。

### 7.5 接入位置

- `apps/web/src/lib/layout-templates.ts`
- `apps/web/src/lib/template-rendering.ts`
- `apps/web/src/lib/publish-guard.ts`
- `apps/web/src/app/(writer)/settings/assets/page.tsx`
- `apps/web/src/app/(writer)/settings/publish/page.tsx`
- `apps/web/src/app/api/templates/route.ts`

### 7.6 验收标准

- 用户能创建一个私有模板版本。
- 模板能在稿件发布前被选择。
- 不合规模板不能进入发布。
- 发布日志能记录模板版本。
- 移动端预览和最终渲染配置一致。

### 7.7 已落地范围

截至 `2026-04-29`，模板导入已补齐“HTML 导入 + 审计 + 资产页入口 + 发布守卫承接”的主链路：

- 新增 `layout_template_import_audits` SQLite / Postgres migration 与 legacy bootstrap，记录 `template_id / version / user_id / status / issues_json / summary_json`。
- 新增 `apps/web/src/lib/template-import.ts`，支持粘贴 HTML 导入私有模板，导入前审计 script、外链 CSS、事件属性、移动端固定宽度、远程图片、低对比度、暗色模式、首屏密度、段落密度和图片密度风险。
- 新增 `POST /api/templates/import-html`，复用当前模板权限和私有模板额度控制；阻塞模板只落审计，不创建可用模板。
- 新增 `apps/web/src/components/template-html-import-panel.tsx`，在资产页显式提供 HTML 粘贴导入入口，导入后展示审计状态、风险项和关键体验指标。
- `publishGuard` 已读取最近一次模板导入审计：blocked 审计会阻断发布，warning 审计会提示发布风险。
- 新增 `apps/web/src/lib/__tests__/template-import.test.ts`，覆盖危险 HTML 阻断、移动端体验风险识别、合法 HTML 导入、blocked audit 不生成可用模板。

本轮补充：

- 发布设置页已接入同一套 `TemplateHtmlImportPanel`，发布配置区可提前导入和预检私有模板。

后续增强：

- 移动端预览仍可继续增强为像素级预览；当前已先把体验风险前置到模板导入审计模型。

## 8. P1：参考文章融合比例

### 8.1 目标

AIWriteX 有 `reference_ratio` 概念，用于控制参考文章借鉴比例。当前项目已有 URL grounding、fragment、evidence package 和 research brief，但缺少一个用户可理解的“参考强度”控制。

新增参数：

```ts
type ReferenceFusionMode = "inspiration" | "structure" | "evidence" | "close_read";
```

对应口径：

- `inspiration`：只借启发，不借结构和表达。
- `structure`：允许参考结构，但必须换论证路径和案例。
- `evidence`：优先抽取事实、数据、引用和反证。
- `close_read`：深度拆解参考文章，但必须显式生成差异化策略和避让清单。

### 8.2 接入现有阶段

- `topicAnalysis`：记录参考模式。
- `researchBrief`：按模式决定提取事实、结构或反证。
- `outlinePlanning`：如果是 structure 模式，生成“可借结构”和“必须避让”。
- `deepWrite`：注入避让清单，避免洗稿风险。
- `publishGuard`：检查是否过度贴近参考文章。

### 8.3 风险控制

必须加入：

- 参考来源记录。
- 差异化写作策略。
- 禁止复刻标题、开头、段落顺序和核心比喻。
- close_read 模式默认只对用户上传/授权资料开放。

### 8.4 验收标准

- 同一 URL 在不同 fusion mode 下产出的 research brief 字段不同。
- close_read 必须生成 avoidance list。
- publish guard 能识别缺少差异化策略的高风险参考模式。

### 8.5 已落地范围

本轮已完成运行时主链路和自动化入口，不只是发布前拦截：

- 新增 `apps/web/src/lib/reference-fusion.ts`，统一定义 `ReferenceFusionMode`、模式归一化、prompt 行、payload 归一化和高风险守卫。
- URL 起稿创建来源 fragment 时写入 `sourceMeta.referenceFusionMode=evidence` 和结构化 `referenceFusion`，避免来源文章只停留在原文摘录层。
- `topicAnalysis` 输出 `referenceFusionMode/referenceFusion`，先把参考融合意图记录在选题判断层。
- `researchBrief` 输出并归一化 `referenceFusion`，按 mode 改变研究提取重点；`close_read/structure` 默认带差异化策略和规避清单。
- `outlinePlanning` 继承 `referenceFusion`，结构借鉴模式显式写入可借结构和必须避开的路径。
- `deepWriting` 继承 `referenceFusion`，把 avoidance list 注入执行卡，要求正文重新组织，不围绕来源逐段复述。
- `publishGuard` 增加 `referenceFusion` 检查：`structure/close_read` 缺少规避清单、差异化策略或结构边界时阻断发布。
- 自动化 cockpit 已支持手动选择参考融合模式，创建 run 后持久化到 `generation_settings_json`，任务详情会展示本次选择。
- 大纲素材面板已支持单素材参考方式：创建、挂载或更新素材时可选择“只借灵感 / 借结构 / 抽证据 / 精读拆解”，并写入 fragment `sourceMeta.referenceFusionMode/referenceFusion`。
- `resolveReferenceFusionProfile` 已从素材层读取 reference fusion，多个素材存在不同模式时优先采用风险更高的模式，确保结构借鉴和精读拆解不会被证据模式稀释。
- 新增 `apps/web/src/lib/__tests__/reference-fusion.test.ts`，覆盖模式差异、`close_read` 默认规避清单、以及高风险缺边界阻断。
- 新增 fragment source meta 测试，覆盖素材级 reference fusion 持久化。

### 8.6 后续剩余

- 若未来开放 `close_read` 给普通 URL，需要补充授权来源标记；默认仍建议 URL 起稿走 `evidence`，把参考文章当证据包而不是结构模板。

## 9. P2：微信发布可靠性增强

### 9.1 当前判断

当前项目的微信发布链路已经强于 AIWriteX 的开源实现：

- 有连接状态。
- 有 token 加密与刷新。
- 有 idempotency key。
- 有 publish guard。
- 有同步日志。
- 有视觉准备。
- 有失败分类。

因此不需要迁移 AIWriteX 的微信发布代码，只需要补齐边界条件清单。

### 9.2 可吸收点

- 认证号与非认证号素材上传差异。
- 图片上传失败的更细错误归因。
- 多账号草稿同步的结果汇总。
- 封面图缺失时的默认兜底策略。
- 发布后轮询 URL 的异步状态记录。

### 9.3 接入位置

- `apps/web/src/lib/wechat.ts`
- `apps/web/src/lib/wechat-publish.ts`
- `apps/web/src/lib/publish-guard.ts`
- `apps/web/src/lib/article-automation-publish-repair.ts`

### 9.4 验收标准

- 认证号 / 非认证号图片上传路径都有回归测试或 mock 覆盖。
- 发布失败能明确归因到 token、IP 白名单、图片、内容、频率或上游错误。
- 同一文章同一模板重复发布能复用已有成功 media id。

### 9.5 已落地范围

截至 `2026-04-29`，微信发布链路已补齐第一版上线硬化：

- `publishWechatDraft` 在 token、封面上传、正文图片上传、草稿创建失败时保留微信 `errcode` 和操作阶段，避免只靠模糊文案分类。
- `classifyPublishFailure` 优先按微信 `errcode` 归因 IP 白名单、认证凭证、频率限制、媒体素材和内容格式问题，再退回文本匹配。
- 发布失败日志的 `articleVersionHash` 已和成功复用路径统一使用最终生效标题，避免 outline 选中标题和稿件原始标题不一致时影响重试/复用判断。
- `wechat-publish.test.ts` 已覆盖 IP 白名单、errcode 分类、封面与正文图片 mock 上传、上游 errcode 保留，以及同稿件同模板同连接的 media 复用 hash 边界。

后续上线观察：

- 真实公众号侧仍需用认证号和非认证号各跑一次草稿箱推送，确认当前账号权限下 `add_material` 与 `uploadimg` 的行为差异。
- 若后续接入更多微信错误码，可继续扩展 `classifyPublishFailure` 的 errcode 表，不需要改发布主链路。

## 10. P2：图片 Prompt 实验室与资产库增强

### 10.1 目标

AIWriteX 的图片工作流启发点是：图片不只是生成一次，而是作为账号资产长期沉淀。

当前项目已有图片 brief 和 asset file，下一步应补：

- prompt 版本记录
- prompt 复用
- 风格 preset
- 失败 prompt 回收
- 文章图片自动入库
- 资产中心中按文章、题材、风格检索

### 10.2 接入方式

扩展现有：

- `apps/web/src/lib/article-image-generator.ts`
- `apps/web/src/lib/article-visual-repository.ts`
- `apps/web/src/lib/image-assets.ts`
- `apps/web/src/app/(writer)/settings/assets/page.tsx`
- `apps/web/src/app/admin/image-engine/page.tsx`

### 10.3 验收标准

- 每张文章图能回溯 prompt、模型、aspect ratio、brief 和文章。
- 用户能从历史图中复用 prompt。
- 失败图片能标记原因并用于后续 negative prompt。
- 资产中心能区分封面图、文中图、信息图和本地 SVG 图。

### 10.4 已落地范围

截至 `2026-04-29`，图片资产工作流已补齐第一版 prompt 复用闭环：

- 新增 `apps/web/src/lib/image-prompt-assets.ts`，统一从 `asset_files.manifest_json`、封面图、候选图和 `article_visual_briefs` 中提取可复用 prompt、negative prompt、promptHash、provider、model 和 aspect ratio。
- `getAssetFilesByUser` 已把图片资产和对应 prompt 元数据一起返回，资产中心不再只能展示图片文件本身。
- `apps/web/src/components/asset-center-client.tsx` 已在图片库存卡片展示 prompt 摘要、模型、服务、比例和 promptHash，并提供复制 prompt 入口。
- 封面候选生成和自动封面修复写入 asset manifest 时会同步 prompt、provider、model、endpoint / size 等复现信息，新生成资产天然可复用。
- `apps/web/src/lib/__tests__/image-assets.test.ts` 覆盖 prompt 元数据提取、摘要和显式 prompt 优先级。

## 11. 数据模型增量草案

### 11.1 中文热点记录

实际实现必须同时支持 SQLite 和 Postgres。下面是逻辑字段，不是最终单库 DDL：

```sql
CREATE TABLE chinese_hotspot_snapshots (
  id PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_label TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  rank INTEGER,
  heat_value REAL,
  heat_label TEXT,
  summary TEXT,
  captured_at TEXT NOT NULL,
  raw_meta_json TEXT,
  created_at TEXT NOT NULL
);
```

### 11.2 选题热度评分

```sql
CREATE TABLE topic_hotspot_scores (
  id PRIMARY KEY,
  topic_backlog_item_id,
  topic_lead_id,
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  score REAL NOT NULL,
  tier TEXT NOT NULL,
  provider_count INTEGER NOT NULL,
  best_rank INTEGER,
  reasons_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
```

现有 `topic_backlog_items` 需要新增：

```sql
source_meta_json JSON/JSONB/TEXT
```

用途：

- 保存热点 provider、rank、heat、capturedAt 和 score。
- 支撑 backlog、Warroom 和自动化起稿解释推荐原因。
- 避免把热点字段塞进 `summary` 或 `strategy_draft_json` 造成职责混乱。

### 11.3 创意镜头

第一阶段可不建表，内置代码配置即可。后续若开放用户自定义，再新增：

```sql
CREATE TABLE creative_lenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER,
  lens_code TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 11.4 模板导入审计

```sql
CREATE TABLE layout_template_import_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

## 12. API 增量草案

### 12.1 热点源刷新

```http
POST /api/admin/topic-sources/chinese-hotspots/sync
```

用途：

- 管理员手动刷新中文热点源。
- 返回每个平台成功 / 失败 / 候选数。

### 12.2 热点评分预览

```http
POST /api/topic-backlogs/hotspot-score-preview
```

用途：

- 对候选标题计算分数。
- 用于前端解释为什么推荐这个选题。

### 12.3 创意镜头推荐

```http
POST /api/articles/[id]/creative-lens/recommend
```

用途：

- 根据文章题材、作者文风、策略卡和历史结果推荐 lens。

### 12.4 模板导入

```http
POST /api/templates/import-html
```

用途：

- 导入私有 HTML 模板。
- 返回校验结果和模板摘要。

## 13. 实施路线图

### M0：调研落地与安全边界

目标：

- 明确不引入 AIWriteX 运行时。
- 建立源码 / 模板不复制的工程边界。
- 将本方案纳入 `docs/plan` 状态索引。

验收：

- 本文档完成。
- 后续 bead 按能力拆解，而不是以“集成 AIWriteX”为任务。

### M1：中文热点源 MVP

目标：

- 实现 4 个稳定中文热点源。
- 统一输出候选。
- 接入 topic source sync 和 topic backlog seed。

验收：

- 至少 4 个 provider 可返回候选。
- 单 provider 失败不影响整体。
- 有单测覆盖解析、去重和失败降级。

### M2：热点评分与 Warroom 接入

目标：

- 实现 `HotspotScore`。
- 在 Warroom / backlog 中展示推荐原因。
- 支持跨平台共振和历史重复降权。

验收：

- 评分原因可读。
- 高分候选排序稳定。
- 最近写过的主题能降权。

### M3：创意维度镜头

目标：

- 内置 6-8 个 creative lens。
- 接入 writing state 和 generation prompt context。
- 工作区可选择或自动推荐。

验收：

- lens 切换影响 deep writing instruction。
- lens 与作者文风冲突时不会覆盖作者约束。
- 有推荐原因。

### M4：参考文章融合比例

目标：

- URL 起稿或参考资料中加入 fusion mode。
- research brief / outline / deepWrite / publishGuard 都能识别该模式。

验收：

- close_read 模式必须输出避让清单。
- publish guard 对缺少差异化策略的稿件阻断。

### M5：模板导入与发布预览

目标：

- 支持私有 HTML 模板导入。
- 支持移动端预览和校验。
- 发布守卫能拦截高风险模板。

验收：

- 私有模板能创建版本。
- 不合规模板不能发布。
- 发布日志记录模板版本。

### M6：图片资产工作流增强

目标：

- 图片 prompt 和生成参数可复用。
- 资产中心能按文章、题材、风格管理图片。

验收：

- 每张图可追溯 prompt / brief / provider / model。
- 用户能复用历史 prompt。

## 14. 风险与应对

### 14.1 数据源不稳定

风险：

- 中文热点榜页面结构变化快。
- 部分平台可能限流或不可访问。

应对：

- 每个 provider 独立失败。
- 保存最近成功快照。
- 配置 provider 健康状态。
- 不把热点源作为唯一选题入口，仍保留 RSS、IMA、WeWe、SearXNG 和手动输入。

### 14.2 许可证和授权风险

风险：

- AIWriteX NOTICE 对分发和 SaaS 有额外限制。
- 模板和部分源码头部有附加条款。

应对：

- 不复制源码。
- 不复制模板。
- 只借鉴机制。
- 需要引用时只链接原仓库和 README，不把代码并入项目。

### 14.3 生成质量被“热点化”带偏

风险：

- 过度追热点会降低作者长期定位。
- 热点标题容易诱导空泛跟风。

应对：

- 热点评分必须结合用户垂类、历史文章和素材承接能力。
- Warroom 中区分“热点可写”和“适合你写”。
- 自动化起稿必须经过 research brief 和 evidence gate。

### 14.4 创意镜头导致风格漂移

风险：

- lens 太强会覆盖作者人设。

应对：

- 作者高置信风格优先级高于 lens。
- persona consistency audit 继续作为生成后检查。
- outcome ledger 记录哪些 lens 对作者有效。

### 14.5 模板导入引入发布失败

风险：

- 用户导入的 HTML 可能微信不兼容。

应对：

- 导入时校验。
- 发布前再次校验。
- 模板版本可禁用。
- 发布失败分类要能定位模板问题。

## 15. 推荐 bead 拆解

后续建议按以下 bead 拆，不要创建“集成 AIWriteX”这种大任务：

1. `Implement Chinese hotspot source adapters`
2. `Add hotspot scoring and topic ranking`
3. `Expose hotspot reasons in Warroom and backlogs`
4. `Add creative lens runtime mapping`
5. `Add reference fusion mode to article automation`
6. `Add private HTML template import audit`
7. `Harden WeChat publish edge-case classification`
8. `Add visual prompt reuse in asset center`

每个 bead 都应包含：

- 目标模块
- 明确验收测试
- 不复制 AIWriteX 源码 / 模板的备注
- 回滚方式

## 16. 最终取舍

最推荐先做：

1. 中文热点源 Adapter
2. 热点评分与黑马信号
3. 创意维度镜头
4. 参考文章融合比例

这四项最贴当前项目主链路，能直接增强“选题进入、写作差异化、研究融合和自动化起稿质量”。

模板导入、微信发布边界和图片 prompt 实验室也有价值，但更偏体验和资产管理，适合在 P0/P1 稳定后推进。

不建议投入 CrewAI、多智能体重构、Python 子服务、桌面 GUI 或手机机器人。它们会扩大系统复杂度，却不能解决当前项目最核心的生成质量和公众号增长问题。
