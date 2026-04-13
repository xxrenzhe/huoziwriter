import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAdminKnowledgeCardRevisions } from "@/lib/knowledge";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const revisions = await getAdminKnowledgeCardRevisions(Number(params.id));
    return ok(
      revisions.map((revision) => ({
        id: revision.id,
        revisionNo: revision.revision_no,
        compiledPayload: revision.compiled_payload_json,
        changeSummary: revision.change_summary,
        createdAt: revision.created_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}
