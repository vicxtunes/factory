import { redirect } from "next/navigation";

import { Header } from "@/components/ui/Header";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { getDashboardSession } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Dashboard" };

export default async function DashboardLoginPage() {
  if (await getDashboardSession()) redirect("/dashboard");

  return (
    <>
      <Header surface="Dashboard" />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <LoginForm />
        <RoleSwitcher current="/dashboard/login" />
      </main>
    </>
  );
}
