import { redirect } from "next/navigation";

export default function SettingsAuthorBacklogsPage() {
  redirect("/settings/author?panel=backlogs#topic-backlogs");
}
