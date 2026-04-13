import { findUserById } from "./auth";
import { getDatabase } from "./db";
import { getCurrentSubscriptionForUser } from "./repositories";

export type UserAccessScope = {
  userIds: number[];
  isTeamShared: boolean;
};

export async function getUserAccessScope(userId: number): Promise<UserAccessScope> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  const subscription = await getCurrentSubscriptionForUser(userId);
  const effectivePlanCode =
    !subscription
      ? user.plan_code
      : subscription.status === "active"
        ? subscription.plan_code
        : "free";

  if (effectivePlanCode !== "team") {
    return {
      userIds: [userId],
      isTeamShared: false,
    };
  }

  const db = getDatabase();
  const members = await db.query<{ id: number }>(
    `SELECT u.id
     FROM users u
     LEFT JOIN subscriptions s ON s.id = (
       SELECT MAX(latest.id) FROM subscriptions latest WHERE latest.user_id = u.id
     )
     WHERE u.is_active = ?
       AND (
         (s.id IS NOT NULL AND s.status = ? AND s.plan_code = ?)
         OR (s.id IS NULL AND u.plan_code = ?)
       )
     ORDER BY u.id ASC`,
    [true, "active", "team", "team"],
  );
  const userIds = members.map((member) => member.id);
  return {
    userIds: userIds.length > 0 ? userIds : [userId],
    isTeamShared: true,
  };
}
