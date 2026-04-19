import { redirect } from "next/navigation";

export default function LegacyEditorRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/articles/${params.id}`);
}
