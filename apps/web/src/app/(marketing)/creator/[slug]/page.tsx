import { notFound } from "next/navigation";
import { CreatorProfile } from "@/components/marketing-views";
import { getCreatorProfileBySlug } from "@/lib/repositories";

export default async function CreatorHomePage({ params }: { params: { slug: string } }) {
  const creator = await getCreatorProfileBySlug(params.slug);
  if (!creator) {
    notFound();
  }
  return <CreatorProfile creator={creator} />;
}
