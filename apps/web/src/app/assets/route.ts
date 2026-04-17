export async function GET(request: Request) {
  const target = new URL("/settings", request.url);
  target.hash = "asset-center";
  return Response.redirect(target, 301);
}
