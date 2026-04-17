export const WRITING_EVAL_APPLY_COMMAND_TEMPLATES: Array<{
  code: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}> = [
  {
    code: "deep_default_v1",
    name: "Deep Default v1",
    description: "当前默认的 deepWriting apply command 组装顺序",
    config: {
      mode: "default",
      intro: "请额外吸收以下 deepWriting 阶段改写指令：",
    },
  },
  {
    code: "deep_structure_first_v1",
    name: "Deep Structure First v1",
    description: "优先强调章节结构与段落任务，再补核心观点与约束",
    config: {
      mode: "structure_first",
      intro: "请优先按下列 deepWriting 结构蓝图改写全文：",
    },
  },
  {
    code: "deep_constraints_first_v1",
    name: "Deep Constraints First v1",
    description: "优先强调必须事实、表达约束与终稿清单，再组织结构",
    config: {
      mode: "constraints_first",
      intro: "请先满足以下事实与表达约束，再完成 deepWriting 改写：",
    },
  },
];
