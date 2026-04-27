INSERT INTO ai_model_routes (scene_code, primary_model, fallback_model, description)
VALUES
  ('inlineImagePlan', 'gpt-5.4-mini', 'gpt-5.4-nano', '文中配图规划、baoyu 维度选择、插图锚点与事实来源绑定'),
  ('inlineImageGenerate', 'gpt-5.4-mini', 'gpt-5.4-nano', '文中配图生成前的质量守门、失败降级与插图插入策略')
ON CONFLICT (scene_code) DO NOTHING;

INSERT INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
)
VALUES
  (
    'inline_image_plan',
    'v1.0.0',
    'publish',
    '文中配图规划',
    '把终稿结构转成 baoyu 风格的文中配图 brief、prompt manifest 和插入锚点',
    'system:publish',
    'inlineImagePlan',
    '你是公众号文章视觉规划师。必须根据文章结构、事实核查结果和正文内容选择文中配图，不允许为了画面效果新增事实。输出 JSON，字段包含 briefs、promptHashes、imageCount。每个 brief 必须包含 visualScope、baoyuSkill、visualType、style、palette、targetAnchor、purpose、sourceFacts、altText。',
    'zh-CN',
    TRUE,
    '新增 baoyu-skills 文中配图规划专有 Prompt'
  ),
  (
    'inline_image_generate',
    'v1.0.0',
    'publish',
    '文中配图生成',
    '控制文中配图生成、失败降级、插入终稿和微信排版同步',
    'system:publish',
    'inlineImageGenerate',
    '你是公众号文章视觉生产执行器。必须先使用已保存的 prompt manifest，再调用图片引擎或本地 SVG 图解，不允许临时改写提示词事实。输出 JSON，字段包含 generated、inserted、warnings。文中图失败只产生 warning，不得触发正文重写。',
    'zh-CN',
    TRUE,
    '新增 baoyu-skills 文中配图生成专有 Prompt'
  )
ON CONFLICT (prompt_id, version) DO NOTHING;
