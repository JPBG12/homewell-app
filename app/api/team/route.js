import { NextResponse } from "next/server";
import { adminClient, requireAdmin } from "@/lib/supabase/admin";

const deny = () => NextResponse.json({ error: "Only admins can manage the team." }, { status: 403 });
const fail = (e) => NextResponse.json({ error: e.message || String(e) }, { status: 400 });

// List team members with whether they have signed in yet.
export async function GET() {
  if (!(await requireAdmin())) return deny();
  try {
    const admin = adminClient();
    const [{ data: profiles, error }, { data: users }] = await Promise.all([
      admin.from("profiles").select("*").order("name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (error) throw error;
    const seen = Object.fromEntries((users?.users || []).map((u) => [u.id, u.last_sign_in_at]));
    return NextResponse.json(profiles.map((p) => ({ ...p, last_sign_in_at: seen[p.id] || null })));
  } catch (e) { return fail(e); }
}

// Add a person with a temporary password they change on first sign-in.
export async function POST(req) {
  if (!(await requireAdmin())) return deny();
  try {
    const { name, email, role, is_assessor, password } = await req.json();
    if (!name || !email || !password) throw new Error("Name, email and temporary password are required.");
    if (password.length < 8) throw new Error("Temporary password must be at least 8 characters.");
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(), password, email_confirm: true,
      user_metadata: { name, must_change_password: true },
      app_metadata: { name, role: role === "admin" ? "admin" : "inspector", is_assessor: !!is_assessor },
    });
    if (error) throw new Error(error.message.includes("already") ? "Someone already uses that email." : error.message);
    return NextResponse.json({ id: data.user.id });
  } catch (e) { return fail(e); }
}
