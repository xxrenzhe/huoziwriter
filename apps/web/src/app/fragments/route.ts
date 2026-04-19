export async function GET(request: Request) {
  const target = new URL("/settings/assets", request.url);
  return Response.redirect(target, 301);
}
