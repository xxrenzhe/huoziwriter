export const MARKETING_PROJECT_SURFACE_PATH = "/opengraph-image";
export const MARKETING_PROJECT_SURFACE_ALT = "Huozi Writer 项目主视觉，展示作战台、正文编辑与微信草稿箱发布链路。";

export const MARKETING_PROJECT_SURFACE_SIZE = {
  width: 1200,
  height: 630,
} as const;

const paper = "rgb(248, 244, 236)";
const paperStrong = "rgb(241, 234, 223)";
const line = "rgb(111, 91, 83)";
const ink = "rgb(36, 33, 31)";
const inkSoft = "rgb(95, 86, 80)";
const cinnabar = "rgb(167, 48, 50)";
const cinnabarSoft = "rgba(167, 48, 50, 0.14)";
const jade = "rgb(52, 122, 104)";
const amber = "rgb(175, 117, 35)";

function panelBase(options: {
  x: number;
  y: number;
  width: number;
  height: number;
  background?: string;
  border?: string;
  radius?: number;
  shadow?: string;
}) {
  return {
    display: "flex" as const,
    flexDirection: "column" as const,
    position: "absolute" as const,
    left: options.x,
    top: options.y,
    width: options.width,
    height: options.height,
    borderRadius: options.radius ?? 18,
    background: options.background ?? "rgba(255,255,255,0.78)",
    border: `1px solid ${options.border ?? "rgba(111,91,83,0.18)"}`,
    boxShadow: options.shadow ?? "0 18px 50px rgba(44, 33, 28, 0.12)",
    overflow: "hidden" as const,
  };
}

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  const color = tone === "danger" ? cinnabar : tone === "success" ? jade : ink;
  const background = tone === "danger" ? cinnabarSoft : tone === "success" ? "rgba(52,122,104,0.12)" : "rgba(36,33,31,0.06)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 118,
        padding: "12px 14px",
        borderRadius: 14,
        background,
        border: "1px solid rgba(111,91,83,0.10)",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 0.4, color: inkSoft }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export function MarketingProjectSurface() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        background: paper,
        color: ink,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 54,
          top: 52,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: 470,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            padding: "8px 14px",
            borderRadius: 999,
            border: `1px solid ${cinnabarSoft}`,
            background: "rgba(255,255,255,0.65)",
            color: cinnabar,
            fontSize: 12,
            letterSpacing: 1.2,
          }}
        >
          REAL CHINESE WRITING SYSTEM
        </div>
        <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 700 }}>
          Huozi Writer
        </div>
        <div style={{ fontSize: 28, lineHeight: 1.35, color: inkSoft }}>
          把素材采集、结构生成、语言净化和微信草稿箱发布，
          接回同一条中文写作生产线。
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          <MetricChip label="作战台" value="选题优先级" />
          <MetricChip label="稿件链路" value="6 步执行卡" />
          <MetricChip label="发布结果" value="微信草稿箱" tone="success" />
        </div>
      </div>

      <div style={panelBase({ x: 560, y: 64, width: 254, height: 490, background: "rgba(255,255,255,0.80)" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 12px", borderBottom: "1px solid rgba(111,91,83,0.12)" }}>
          <div style={{ fontSize: 14, letterSpacing: 0.6, color: inkSoft }}>WARROOM</div>
          <div style={{ width: 72, height: 8, borderRadius: 999, background: cinnabarSoft }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
          {[
            ["今天写什么", "AI 霸主换位，为什么真正危险的是账单和时间差"],
            ["在推什么", "副业赚钱 X 线程，已补 3 条外链验证"],
            ["等什么结果", "公众号草稿箱回写与配图质检"],
          ].map(([label, text], index) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 14,
                borderRadius: 14,
                background: index === 0 ? "rgba(167,48,50,0.09)" : "rgba(36,33,31,0.04)",
                border: `1px solid ${index === 0 ? "rgba(167,48,50,0.18)" : "rgba(111,91,83,0.10)"}`,
              }}
            >
              <div style={{ fontSize: 12, color: inkSoft }}>{label}</div>
              <div style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 600 }}>{text}</div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 4,
            }}
          >
            <MetricChip label="信源" value="X + 外链" tone="danger" />
            <MetricChip label="爆款分" value="93 / 100" tone="success" />
          </div>
        </div>
      </div>

      <div style={panelBase({ x: 754, y: 114, width: 320, height: 360, background: "rgba(255,255,255,0.90)" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 10px", borderBottom: "1px solid rgba(111,91,83,0.12)" }}>
          <div style={{ fontSize: 14, letterSpacing: 0.6, color: inkSoft }}>DEEP WRITING</div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: cinnabar }} />
            <div style={{ width: 10, height: 10, borderRadius: 999, background: amber }} />
            <div style={{ width: 10, height: 10, borderRadius: 999, background: jade }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18 }}>
          <div style={{ fontSize: 22, lineHeight: 1.35, fontWeight: 700 }}>
            这不是一篇“AI 行业新闻”，而是一张已经开始倾斜的胜负看板。
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <MetricChip label="Anthropic" value="300 亿" tone="success" />
            <MetricChip label="OpenAI" value="240 亿" tone="danger" />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: 14,
              borderRadius: 14,
              background: "rgba(36,33,31,0.04)",
            }}
          >
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              开头先抛胜负和数字，再拆企业收入、算力账单和路线裂痕。
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: inkSoft }}>
              语言守卫：禁用空泛总结、报告腔和说教句式。
            </div>
          </div>
        </div>
      </div>

      <div style={panelBase({ x: 852, y: 452, width: 278, height: 126, background: "rgba(28,97,82,0.92)", border: "rgba(28,97,82,0.92)", shadow: "0 18px 42px rgba(28,97,82,0.24)" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18, color: "white" }}>
          <div style={{ fontSize: 13, letterSpacing: 0.5, opacity: 0.84 }}>WECHAT DRAFT READY</div>
          <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 700 }}>
            封面、信息图、知识漫画与正文
            已进入公众号草稿箱。
          </div>
        </div>
      </div>
    </div>
  );
}
