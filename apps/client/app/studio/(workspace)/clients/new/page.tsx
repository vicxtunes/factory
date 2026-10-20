import { redirect } from "next/navigation";

// "New client" opens over the clients list now; old links land there.
export default function NewStudioClientPage() {
  redirect("/studio/clients?new");
}
