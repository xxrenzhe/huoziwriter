export async function GET(request: Request) {
  const target = new URL("/settings", request.url);
  target.hash = "publishing-connections";
  return Response.redirect(target, 301);
}
