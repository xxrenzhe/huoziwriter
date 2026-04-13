type AdminMetric = {
  label: string;
  value: string;
  note: string;
};

export function AdminOverview({
  title,
  description,
  metrics,
  panels,
}: {
  title: string;
  description: string;
  metrics: AdminMetric[];
  panels: Array<{ title: string; description: string; meta?: string }>;
}) {
  return (
    <div className="space-y-8">
      <section className="border border-stone-800 bg-stone-950 p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Admin Operations</div>
        <h1 className="mt-4 font-serifCn text-4xl text-stone-100 md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-400">{description}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="border border-stone-800 bg-[#161616] p-5">
            <div className="text-xs uppercase tracking-[0.26em] text-stone-500">{metric.label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{metric.value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{metric.note}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {panels.map((panel) => (
          <article key={panel.title} className="border border-stone-800 bg-[#171718] p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{panel.meta ?? "模块"}</div>
            <h2 className="mt-4 font-serifCn text-2xl text-stone-100">{panel.title}</h2>
            <p className="mt-4 text-sm leading-7 text-stone-400">{panel.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

export function UsersAdminTable() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["总用户数", "128", "全部由管理员手动创建"],
          ["执毫 / 藏锋", "61", "当前付费主力套餐"],
          ["待强制改密", "9", "首次登录后必须更新密码"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </div>
      <section className="border border-stone-800 bg-[#171718]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">User Management</div>
            <h1 className="mt-3 font-serifCn text-3xl text-stone-100">账号只发不放，套餐和状态在后台统一调度。</h1>
          </div>
          <button className="border border-cinnabar bg-cinnabar px-4 py-2 text-sm text-white">创建用户</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-stone-950 text-stone-500">
              <tr>
                {["用户名", "角色", "套餐", "到期时间", "状态", "最近登录"].map((head) => (
                  <th key={head} className="px-6 py-4 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["huozi", "admin", "团队", "2099-12-31", "启用", "2026-04-12 08:42"],
                ["yanmo018", "user", "游墨", "2026-05-12", "启用", "2026-04-11 21:16"],
                ["zhihao023", "user", "执毫", "2026-10-03", "锁定", "2026-04-09 14:20"],
                ["cangfeng011", "user", "藏锋", "2027-01-01", "启用", "2026-04-12 10:08"],
              ].map((row) => (
                <tr key={row[0]} className="border-t border-stone-800">
                  <td className="px-6 py-4 text-stone-100">{row[0]}</td>
                  <td className="px-6 py-4 text-stone-400">{row[1]}</td>
                  <td className="px-6 py-4 text-stone-400">{row[2]}</td>
                  <td className="px-6 py-4 text-stone-400">{row[3]}</td>
                  <td className={`px-6 py-4 ${row[4] === "锁定" ? "text-cinnabar" : "text-emerald-400"}`}>{row[4]}</td>
                  <td className="px-6 py-4 text-stone-400">{row[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export function PromptsAdminBoard() {
  return (
    <section className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
      <aside className="border border-stone-800 bg-[#171718] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">场景列表</div>
        <div className="mt-4 space-y-2 text-sm">
          {["灵魂注入引擎", "选题雷达", "死刑词净化", "微信排版器"].map((item, index) => (
            <div
              key={item}
              className={`border px-4 py-3 ${index === 0 ? "border-cinnabar bg-cinnabar text-white" : "border-transparent bg-stone-950 text-stone-400"}`}
            >
              {item}
            </div>
          ))}
        </div>
      </aside>
      <div className="border border-stone-800 bg-[#111214] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-stone-800 pb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Prompt Versions</div>
            <h1 className="mt-3 font-serifCn text-3xl text-stone-100">v2.3 当前生效 · 反 AI 腔调强化版</h1>
          </div>
          <button className="border border-stone-700 px-4 py-2 text-sm text-stone-300">新建版本</button>
        </div>
        <div className="mt-5 min-h-[360px] border border-stone-800 bg-[#0b0b0c] p-5 font-mono text-sm leading-7 text-stone-300">
          <p>{"{{ system }} 你是一名中文专栏写作编辑。"}</p>
          <p className="mt-3">禁止使用：赋能、底层逻辑、不可否认、毋庸置疑。</p>
          <p className="mt-3">若输入缺事实，请先召回碎片，再生成，不允许空泛补写。</p>
        </div>
      </div>
      <aside className="border border-stone-800 bg-[#171718] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">沙盒测试</div>
        <div className="mt-4 space-y-3 text-sm text-stone-400">
          <div className="border border-stone-800 bg-stone-950 p-4">大纲节点：行业在降价，利润在出血</div>
          <div className="border border-stone-800 bg-stone-950 p-4">碎片：芯片报价连续三周下跌</div>
          <div className="border border-stone-800 bg-stone-950 p-4 text-stone-300">
            输出预览：你不能再用“长期主义”来掩盖利润崩塌。
          </div>
        </div>
      </aside>
    </section>
  );
}

export function RoutingAdminBoard() {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border border-stone-800 bg-[#171718] p-6">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Model Routing</div>
        <h1 className="mt-4 font-serifCn text-4xl text-stone-100">把生成、净化、事实提取、微信排版拆成独立路由策略。</h1>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-stone-500">
              <tr>
                {["场景", "主模型", "回退模型", "触发条件"].map((head) => (
                  <th key={head} className="pb-4 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["碎片脱水", "gemini-3.0-flash-lite", "gemini-3.0-flash", "URL / OCR 入库"],
                ["正文生成", "claude-sonnet-4-6", "claude-haiku-4-5", "普通生成请求"],
                ["死刑词复勘", "gpt-5.4-mini", "gpt-5.4-nano", "命中风险词"],
                ["微信排版", "自研 HTML 渲染", "模板降级", "推送草稿箱"],
              ].map((row) => (
                <tr key={row[0]} className="border-t border-stone-800">
                  <td className="py-4 text-stone-100">{row[0]}</td>
                  <td className="py-4 text-stone-400">{row[1]}</td>
                  <td className="py-4 text-stone-400">{row[2]}</td>
                  <td className="py-4 text-stone-400">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="border border-stone-800 bg-stone-950 p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">扩展预留</div>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-400">
          <li>未来接入外部支付与订阅回调</li>
          <li>未来如果要增强外部采集，再单独评估服务端抓取与任务编排扩容</li>
          <li>未来做团队级模型预算控制</li>
        </ul>
      </aside>
    </section>
  );
}

export function FinanceAdminBoard() {
  return (
    <section className="grid gap-4 lg:grid-cols-4">
      {[
        ["游墨", "￥0", "50 条碎片，1 次/日生成，文本配图建议"],
        ["执毫", "￥108/月", "10 次/日生成，微信草稿箱同步，无限死刑词库"],
        ["藏锋", "￥298/月", "高配额生成，100 次封面图，多个公众号"],
        ["团队", "定制", "共享碎片池、共享词库、未来多人协作"],
      ].map(([name, price, note], index) => (
        <article
          key={name}
          className={`border p-6 ${index === 1 ? "border-cinnabar bg-cinnabar text-white" : "border-stone-800 bg-[#171718] text-stone-100"}`}
        >
          <div className="text-xs uppercase tracking-[0.24em] opacity-70">Plan</div>
          <h1 className="mt-4 font-serifCn text-3xl">{name}</h1>
          <div className="mt-4 text-3xl">{price}</div>
          <p className="mt-4 text-sm leading-7 opacity-80">{note}</p>
        </article>
      ))}
    </section>
  );
}

export function BusinessAdminBoard() {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["本月 MRR", "￥38,620", "当前只做内部套餐结构，不接真实支付通道"],
          ["活跃作者", "84", "过去 30 天产生至少一次生成或同步"],
          ["微信同步成功率", "97.4%", "草稿箱推送失败主要来自 token 失效"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">增长漏斗</div>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-400">
            <li>访问首页 4,280</li>
            <li>进入 AI 废话扫描仪 1,320</li>
            <li>管理员发号 168</li>
            <li>升级执毫 54</li>
          </ul>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">经营提醒</div>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-400">
            <li>执毫转藏锋转化偏低，可能与真实图片额度有关。</li>
            <li>微信绑定完成率受 appId / appSecret 填写复杂度影响。</li>
            <li>Prompt 新版本需要先过沙盒测试再激活。</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
