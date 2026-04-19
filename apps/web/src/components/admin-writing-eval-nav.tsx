import Link from "next/link";
import { buttonStyles, cn } from "@huoziwriter/ui";
import { getAdminWritingEvalNavItems, type AdminWritingEvalSection } from "@/lib/admin-writing-eval-links";

const adminWritingEvalNavClassName = "flex gap-3";
const adminWritingEvalNavButtonClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "border-adminLineStrong bg-adminSurfaceMuted px-4 text-adminInk hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);

export function AdminWritingEvalNav({
  sections,
  className,
}: {
  sections: readonly AdminWritingEvalSection[];
  className?: string;
}) {
  return (
    <div className={cn(adminWritingEvalNavClassName, className)}>
      {getAdminWritingEvalNavItems(sections).map((item) => (
        <Link key={item.key} href={item.href} className={adminWritingEvalNavButtonClassName}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
