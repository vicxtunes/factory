import { redirect } from "next/navigation";

// "New project" opens over the projects list now; old links land there.
export default function NewProjectPage() {
  redirect("/studio/projects?new");
}
