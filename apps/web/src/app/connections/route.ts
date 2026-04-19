export async function GET(request: Request) {
  const target = new URL("/settings/publish", request.url);
  return Response.redirect(target, 301);
}
