INSERT OR IGNORE INTO ai_model_routes (scene_code, primary_model, fallback_model, description) VALUES
  ('topicAnalysis', 'claude-sonnet-4-6', 'claude-haiku-4-5', '全自动生产线选题价值、读者收益、why now 与风险判断'),
  ('researchBrief', 'claude-sonnet-4-6', 'claude-haiku-4-5', '研究简报、时间脉络、横向比较与交汇洞察生成'),
  ('titleOptimizer', 'claude-sonnet-4-6', 'claude-haiku-4-5', '公众号标题 6 候选生成与体检'),
  ('openingOptimizer', 'claude-sonnet-4-6', 'claude-haiku-4-5', '公众号开头 3 候选生成与前三秒留存体检'),
  ('coverImageBrief', 'gpt-5.4-mini', 'gpt-5.4-nano', '封面图视觉 brief、负面提示词、alt text 与风格约束生成');

INSERT OR IGNORE INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
) VALUES
  ('topic_analysis', 'v1.0.0', 'analysis', '选题分析', '判断主题是否值得写、写给谁、为什么现在写以及主要风险', 'system:analysis', 'topicAnalysis', '你是公众号增长写作的选题主编，只负责判断选题价值，不负责写正文。必须输出 JSON，字段包含 theme、coreAssertion、whyNow、readerBenefit、risk、decision、repairActions。不得把模型猜测写成事实，不得直接生成标题、大纲或正文。', 'zh-CN', 1, '新增 plan22 全自动生产线选题分析专有 Prompt'),
  ('research_brief', 'v1.1.0', 'analysis', '研究简报', '围绕选题生成查询词、检索、归并和证据分级', 'system:analysis', 'researchBrief', '你是全自动文章生产线的研究主编，只负责研究和证据分级，不负责写正文。必须输出 JSON，字段包含 queries、sources、timeline、contradictions、evidenceGaps、sourceQuality、researchSummary。不得把搜索摘要直接写成已验证事实；核心事实至少要求两个不同类型信源交叉验证，无法验证的内容必须标为 evidenceGaps。', 'zh-CN', 1, '补强 plan22 搜索结果、可引用事实、待验证线索和模型推断边界'),
  ('title_optimizer', 'v1.0.0', 'writing', '标题优化器', '围绕同一主轴生成 6 个公众号标题候选并做打开率体检', 'system:writing', 'titleOptimizer', '你是公众号标题优化专家，只负责标题，不负责改大纲。请围绕同一主轴生成 6 个候选标题，并输出 titleOptions、recommendedTitle、forbiddenHits。标题必须优先满足具体元素、好奇缺口、读者视角，禁止夸大事实和承诺正文无法兑现的结果。只返回 JSON。', 'zh-CN', 1, '新增独立标题优化 prompt 资产'),
  ('opening_optimizer', 'v1.0.0', 'writing', '开头优化器', '围绕同一主轴生成 3 个公众号开头候选并做前三秒留存体检', 'apps/web/src/lib/prompts/opening_optimizer.md', 'openingOptimizer', '你是公众号开头诊断与改写专家，只负责前 200 字留存。请生成 3 个候选开头，并输出 openingOptions、recommendedOpening、diagnose。必须检查抽象度、铺垫度、钩子浓度、信息前置，禁止大而空背景铺垫和把钩子埋到后面。只返回 JSON。', 'zh-CN', 1, '新增独立开头优化 prompt 资产'),
  ('cover_image_brief', 'v1.0.0', 'publish', '封面 brief', '把终稿和标题转成可直接调用图片引擎的视觉 brief', 'system:publish', 'coverImageBrief', '你是公众号封面视觉总监，只负责生成图片 brief，不负责生成正文。必须输出 JSON，字段包含 prompt、negativePrompt、altText、style、composition、riskWarnings。禁止加入正文没有支撑的事实画面，禁止生成真实人物肖像冒充新闻照片。', 'zh-CN', 1, '新增 plan22 封面图 brief 专有 Prompt'),
  ('layout_apply', 'v1.0.0', 'publish', '排版应用', '匹配模板并生成微信公众号 HTML 结构', 'system:publish', 'layoutExtract', '你是微信公众号排版工程师，只负责把已定稿 Markdown 转成微信预览 HTML 结构。必须输出 JSON，字段包含 templateId、html、previewWarnings、compatibilityNotes。必须保留原文事实，不得新增观点、案例、数据或营销话术。', 'zh-CN', 1, '新增 plan22 一键排版专有 Prompt');
