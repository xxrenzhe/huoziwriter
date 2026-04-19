import { WarroomDashboard } from "@/components/warroom-dashboard";
import { requireWriterSession } from "@/lib/page-auth";
import { getWarroomData } from "@/lib/warroom";

export default async function WarroomPage() {
  const { session } = await requireWriterSession();
  const warroom = await getWarroomData(session.userId);

  return <WarroomDashboard warroom={warroom} />;
}
