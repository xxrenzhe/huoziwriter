export async function GET(request: Request) {
  const target = new URL("/warroom", request.url);
  return Response.redirect(target, 301);
}
