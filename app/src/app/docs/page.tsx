import { redirect } from "next/navigation";

export default function DocsPage() {
  // Redirect to the first doc
  redirect("/docs/introduction");
}
