import { createClient } from "@supabase/supabase-js";
import { createClient as createServer } from "./server";

// Server-only client with full access. Uses the secret key stored in Vercel.
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in Vercel.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Returns the signed-in admin's id, or null if the caller is not an active admin.
export async function requireAdmin() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  return data && data.role === "admin" && data.active ? user.id : null;
}
