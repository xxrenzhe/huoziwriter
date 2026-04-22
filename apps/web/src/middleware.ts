import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const staticRedirects = new Map<string, string>([
    ["/dashboard", "/warroom"],
    ["/review", "/reviews"],
  ]);
  const staticTarget = staticRedirects.get(pathname);
  if (staticTarget) {
    const target = request.nextUrl.clone();
    target.pathname = staticTarget;
    target.search = search;
    return NextResponse.redirect(target);
  }

  const editorMatch = pathname.match(/^\/editor\/([^/]+)(?:\/command)?$/);
  if (editorMatch) {
    const target = request.nextUrl.clone();
    target.pathname = `/articles/${editorMatch[1]}`;
    target.search = search;
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/review", "/editor/:path*"],
};
