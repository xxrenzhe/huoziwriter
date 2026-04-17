#!/usr/bin/env node

const adminConfig = {
  username: "huozi",
  email: "admin@huoziwriter.local",
  password: String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim(),
  displayName: "Huozi Admin",
  role: "admin",
  planCode: "ultra",
};

console.log("HuoziWriter 默认后台账号配置");
console.log(`用户名: ${adminConfig.username}`);
console.log(`邮箱: ${adminConfig.email}`);
console.log(`显示名: ${adminConfig.displayName}`);
console.log(`角色: ${adminConfig.role}`);
console.log(`套餐: ${adminConfig.planCode}`);
console.log(`密码已配置: ${adminConfig.password ? "yes" : "no"}`);
console.log("密码来源: DEFAULT_ADMIN_PASSWORD（必填）");
console.log("下一步：在数据库接入完成后，将该脚本替换为真实的用户 upsert 初始化逻辑。");
