#!/usr/bin/env node

const adminConfig = {
  username: "huozi",
  email: "admin@huoziwriter.local",
  password: process.env.DEFAULT_ADMIN_PASSWORD || "REDACTED_ADMIN_PASSWORD",
  role: "admin",
  planCode: "ultra",
};

console.log("HuoziWriter 默认管理员配置");
console.log(`用户名: ${adminConfig.username}`);
console.log(`邮箱: ${adminConfig.email}`);
console.log(`角色: ${adminConfig.role}`);
console.log(`套餐: ${adminConfig.planCode}`);
console.log("密码来源: DEFAULT_ADMIN_PASSWORD 或默认值 REDACTED_ADMIN_PASSWORD");
console.log("下一步：在数据库接入完成后，将该脚本替换为真实的用户 upsert 初始化逻辑。");
