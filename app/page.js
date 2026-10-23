import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import App from "@/components/App";
import ChangePassword from "@/components/ChangePassword";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.must_change_password) return <ChangePassword first />;
  return <App userId={user.id} />;
}
