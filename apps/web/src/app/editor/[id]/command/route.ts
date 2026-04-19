export async function GET(request: Request, { params }: { params: { id: string } }) {
  const target = new URL(`/articles/${params.id}`, request.url);
  target.search = new URL(request.url).search;
  return Response.redirect(target, 301);
}
