import { BannedWordsManager } from "@/components/writer-client";
import { BannedWordsStudio } from "@/components/writer-views";
import { getLanguageGuardRules } from "@/lib/language-guard";
import { requireWriterSession } from "@/lib/page-auth";

export default async function BannedWordsPage() {
  const { session } = await requireWriterSession();
  const rules = await getLanguageGuardRules(session.userId);
  return (
    <div className="space-y-8">
      <BannedWordsStudio />
      <BannedWordsManager rules={rules} />
    </div>
  );
}
