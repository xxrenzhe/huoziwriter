import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getAuthCookieName, hashPassword, signSession, verifyPassword, verifySession } from "./security";

type DbUserRow = {
  id: number;
  username: string;
  email: string | null;
  password_hash: string | null;
  display_name: string | null;
  role: string;
  plan_code: string;
  must_change_password: number | boolean;
  is_active: number | boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbUser = Omit<DbUserRow, "role"> & {
  role: ManagedUserRole;
};

export type ManagedUserRole = "admin" | "user";

export type AuthUser = {
  userId: number;
  username: string;
  role: ManagedUserRole;
};

export function normalizeManagedUserRole(value: unknown): ManagedUserRole {
  return String(value || "").trim().toLowerCase() === "user" ? "user" : "admin";
}

export function toStoredManagedUserRole(role: ManagedUserRole) {
  return role;
}

function mapDbUser(row: DbUserRow | null | undefined): DbUser | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    role: normalizeManagedUserRole(row.role),
  };
}

export async function findUserByUsername(username: string) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return mapDbUser(await db.queryOne<DbUserRow>("SELECT * FROM users WHERE username = ?", [username]));
}

export async function findUserById(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return mapDbUser(await db.queryOne<DbUserRow>("SELECT * FROM users WHERE id = ?", [userId]));
}

export async function getEffectivePlanCodeForUser(userId: number, fallbackPlanCode: string) {
  const db = getDatabase();
  const latest = await db.queryOne<{ plan_code: string; status: string }>(
    "SELECT plan_code, status FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [userId],
  );
  if (!latest) {
    return fallbackPlanCode;
  }
  return latest.status === "active" ? latest.plan_code : "free";
}

export async function ensureUserSession(request?: NextRequest): Promise<AuthUser | null> {
  try {
    await ensureExtendedProductSchema();
    const token = request?.cookies.get(getAuthCookieName())?.value ?? cookies().get(getAuthCookieName())?.value;
    if (!token) {
      return null;
    }
    const session = verifySession(token);
    return {
      ...session,
      role: normalizeManagedUserRole(session.role),
    };
  } catch {
    return null;
  }
}

export async function requireAdminAccess(request?: NextRequest) {
  const session = await ensureUserSession(request);
  if (!session || session.role !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function loginWithPassword(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user || !user.password_hash) {
    throw new Error("用户名或密码错误");
  }
  if (!user.is_active) {
    throw new Error("账户已停用");
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new Error("用户名或密码错误");
  }

  const token = signSession({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const db = getDatabase();
  await db.exec("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    new Date().toISOString(),
    user.id,
  ]);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      planCode: await getEffectivePlanCodeForUser(user.id, user.plan_code),
      mustChangePassword: Boolean(user.must_change_password),
    },
  };
}

export async function createUser(input: {
  username: string;
  email?: string | null;
  password: string;
  displayName?: string | null;
  role?: ManagedUserRole;
  planCode?: string;
  mustChangePassword?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO users (
      username, email, password_hash, display_name, role, plan_code, must_change_password, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.username,
      input.email ?? null,
      passwordHash,
      input.displayName ?? null,
      toStoredManagedUserRole(input.role ?? "user"),
      input.planCode ?? "free",
      input.mustChangePassword ?? true,
      true,
      now,
      now,
    ],
  );
  await syncUserSubscription(result.lastInsertRowid!, input.planCode ?? "free", true);

  const user = await findUserById(result.lastInsertRowid!);
  if (!user) {
    throw new Error("创建用户失败");
  }
  return user;
}

export async function syncUserSubscription(userId: number, planCode: string, isActive: boolean) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const latest = await db.queryOne<{
    id: number;
    plan_code: string;
    status: string;
  }>("SELECT id, plan_code, status FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1", [userId]);

  if (!latest) {
    await db.exec(
      `INSERT INTO subscriptions (user_id, plan_code, status, start_at, end_at, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        planCode,
        isActive ? "active" : "inactive",
        isActive ? now : null,
        isActive ? null : now,
        "manual",
        now,
        now,
      ],
    );
    return;
  }

  if (!isActive) {
    await db.exec(
      `UPDATE subscriptions
       SET plan_code = ?, status = ?, end_at = ?, updated_at = ?
       WHERE id = ?`,
      [planCode, "inactive", now, now, latest.id],
    );
    return;
  }

  if (latest.status === "active" && latest.plan_code === planCode) {
    await db.exec(
      `UPDATE subscriptions
       SET end_at = NULL, updated_at = ?
       WHERE id = ?`,
      [now, latest.id],
    );
    return;
  }

  if (latest.status === "active") {
    await db.exec(
      `UPDATE subscriptions
       SET status = ?, end_at = ?, updated_at = ?
       WHERE id = ?`,
      ["ended", now, now, latest.id],
    );
  }

  await db.exec(
    `INSERT INTO subscriptions (user_id, plan_code, status, start_at, end_at, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, planCode, "active", now, null, "manual", now, now],
  );
}

export async function changeUserPassword(input: {
  userId: number;
  currentPassword: string;
  nextPassword: string;
}) {
  const user = await findUserById(input.userId);
  if (!user || !user.password_hash) {
    throw new Error("用户不存在");
  }

  const valid = await verifyPassword(input.currentPassword, user.password_hash);
  if (!valid) {
    throw new Error("当前密码错误");
  }

  const nextPassword = input.nextPassword.trim();
  if (nextPassword.length < 8) {
    throw new Error("新密码至少需要 8 位");
  }
  if (nextPassword === input.currentPassword) {
    throw new Error("新密码不能与当前密码相同");
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE users
     SET password_hash = ?, must_change_password = ?, updated_at = ?
     WHERE id = ?`,
    [await hashPassword(nextPassword), false, now, input.userId],
  );

  return findUserById(input.userId);
}
