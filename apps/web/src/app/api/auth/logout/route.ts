import { serialize } from "cookie";
import { ok } from "@/lib/http";
import { getAuthCookieName } from "@/lib/security";

export async function POST() {
  const response = ok({ loggedOut: true });
  response.headers.set(
    "Set-Cookie",
    serialize(getAuthCookieName(), "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
    }),
  );
  return response;
}
