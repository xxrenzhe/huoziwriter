export const STYLE_TEMPLATE_LIBRARY = [
  {
    id: "latepost-minimal",
    name: "晚点极简风",
    description: "偏报道感、低修饰、段落克制，适合商业评论和行业观察。",
    meta: "模板",
    config: {
      tone: "克制报道",
      paragraphLength: "short",
      titleStyle: "sharp",
      bannedPunctuation: ["！！！"],
    },
  },
  {
    id: "huozi-editorial",
    name: "活字新中式",
    description: "强调留白、衬线标题、正文行距宽，适合专栏长文。",
    meta: "版式",
    config: {
      tone: "留白专栏",
      paragraphLength: "medium",
      titleStyle: "serif",
      bannedPunctuation: [],
    },
  },
  {
    id: "anti-buzzwords",
    name: "黑话净化包",
    description: "预置空话与对应替换建议，适合在终稿阶段做语言降噪。",
    meta: "词库",
    config: {
      tone: "降噪净化",
      paragraphLength: "short",
      titleStyle: "plain",
      bannedWords: ["赋能", "底层逻辑", "不可否认"],
    },
  },
];
