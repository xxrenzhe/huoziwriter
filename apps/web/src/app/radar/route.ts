export async function GET(request: Request) {
  const target = new URL("/dashboard", request.url);
  return Response.redirect(target, 301);
}
