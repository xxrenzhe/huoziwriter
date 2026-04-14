import { findUserById } from "./auth";

export type UserAccessScope = {
  userIds: number[];
};

export async function getUserAccessScope(userId: number): Promise<UserAccessScope> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  return {
    userIds: [userId],
  };
}
