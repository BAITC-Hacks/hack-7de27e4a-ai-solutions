import { redirect } from "next/navigation";

/** All entry points use the approved, localized workspace and its shared session. */
export default function DemoPage() {
  redirect("/employee");
}
