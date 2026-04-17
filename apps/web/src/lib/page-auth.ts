import { redirect } from "next/navigation";
import { ensureUserSession, findUserById } from "./auth";

export async function requireWriterSession() {
  const session = await ensureUserSession();
  if (!session) {
    redirect("/login");
  }
  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login");
  }
  if (user.must_change_password) {
    redirect("/change-password");
  }
  return { session, user };
}

export async function requireAdminSession() {
  const { session, user } = await requireWriterSession();
  if (session.role !== "admin") {
    redirect("/dashboard");
  }
  return { session, user };
}
