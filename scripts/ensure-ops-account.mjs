#!/usr/bin/env node

const opsConfig = {
  username: "huozi",
  email: "ops@huoziwriter.local",
  password: process.env.DEFAULT_OPS_PASSWORD || "REDACTED_ADMIN_PASSWORD",
  role: "ops",
  planCode: "ultra",
};

console.log("HuoziWriter 默认运维账号配置");
console.log(`用户名: ${opsConfig.username}`);
console.log(`邮箱: ${opsConfig.email}`);
console.log(`角色: ${opsConfig.role}`);
console.log(`套餐: ${opsConfig.planCode}`);
console.log("密码来源: DEFAULT_OPS_PASSWORD 或默认值 REDACTED_ADMIN_PASSWORD");
console.log("下一步：在数据库接入完成后，将该脚本替换为真实的用户 upsert 初始化逻辑。");
