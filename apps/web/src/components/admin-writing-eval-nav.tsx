import Link from "next/link";
import { uiPrimitives } from "@huoziwriter/ui";
import { getAdminWritingEvalNavItems, type AdminWritingEvalSection } from "@/lib/admin-writing-eval-links";

export function AdminWritingEvalNav({
  sections,
  className = "flex gap-3",
}: {
  sections: readonly AdminWritingEvalSection[];
  className?: string;
}) {
  return (
    <div className={className}>
      {getAdminWritingEvalNavItems(sections).map((item) => (
        <Link key={item.key} href={item.href} className={uiPrimitives.adminSecondaryButton}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
