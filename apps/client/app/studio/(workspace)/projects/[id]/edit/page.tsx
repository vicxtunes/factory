import { redirect } from "next/navigation";

// Editing a project opens over the project now; old links land there.
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/studio/projects/${encodeURIComponent((await params).id)}?edit`);
}
