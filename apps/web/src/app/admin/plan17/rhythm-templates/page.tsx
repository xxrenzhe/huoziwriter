import { AdminPlan17RhythmTemplatesClient } from "@/components/admin-plan17-rhythm-templates-client";
import { listArchetypeRhythmTemplates } from "@/lib/archetype-rhythm";
import { requireAdminSession } from "@/lib/page-auth";

export default async function AdminPlan17RhythmTemplatesPage() {
  await requireAdminSession();
  const templates = await listArchetypeRhythmTemplates();

  return <AdminPlan17RhythmTemplatesClient initialTemplates={templates} />;
}
