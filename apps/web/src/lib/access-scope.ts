import { findUserById } from "./auth";
import { getDatabase } from "./db";

export type UserAccessScope = {
  userIds: number[];
  isTeamShared: boolean;
};

export async function getUserAccessScope(userId: number): Promise<UserAccessScope> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  if (user.plan_code !== "team") {
    return {
      userIds: [userId],
      isTeamShared: false,
    };
  }

  const db = getDatabase();
  const members = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE plan_code = ? AND is_active = ? ORDER BY id ASC",
    ["team", true],
  );
  const userIds = members.map((member) => member.id);
  return {
    userIds: userIds.length > 0 ? userIds : [userId],
    isTeamShared: true,
  };
}
