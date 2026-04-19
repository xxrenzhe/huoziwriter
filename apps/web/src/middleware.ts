import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "huoziwriter_session";

export function middleware(request: NextRequest) {
  if (!request.cookies.has(AUTH_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = "/warroom";
  target.search = "";
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/"],
};
