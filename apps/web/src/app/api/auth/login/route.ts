import { serialize } from "cookie";
import { loginWithPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAuthCookieName } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await loginWithPassword(body.username, body.password);
    const response = ok(result.user);
    response.headers.set(
      "Set-Cookie",
      serialize(getAuthCookieName(), result.token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 14,
      }),
    );
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "登录失败", 401);
  }
}
