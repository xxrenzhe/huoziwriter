export async function GET(request: Request) {
  const target = new URL("/articles", request.url);
  return Response.redirect(target, 301);
}
