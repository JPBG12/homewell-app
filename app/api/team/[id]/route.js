import { NextResponse } from "next/server";
import { adminClient, requireAdmin } from "@/lib/supabase/admin";

const deny = () => NextResponse.json({ error: "Only admins can manage the team." }, { status: 403 });
const fail = (e) => NextResponse.json({ error: e.message || String(e) }, { status: 400 });

// Edit name, email, role, assessor flag, or set a new temporary password.
export async function PATCH(req, { params }) {
  const me = await requireAdmin(); if (!me) return deny();
  try {
    const { id } = await params;
    const { name, email, role, is_assessor, password, active } = await req.json();
    const admin = adminClient();
    const authUpdate = {};
    if (email) { authUpdate.email = email.trim().toLowerCase(); authUpdate.email_confirm = true; }
    if (password) {
      if (password.length < 8) throw new Error("Temporary password must be at least 8 characters.");
      authUpdate.password = password; authUpdate.user_metadata = { must_change_password: true };
    }
    if (active === true) authUpdate.ban_duration = "none";
    if (Object.keys(authUpdate).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
      if (error) throw new Error(error.message.includes("already") ? "Someone already uses that email." : error.message);
    }
    const row = {};
    if (name) row.name = name.trim();
    if (email) row.email = email.trim().toLowerCase();
    if (role && id !== me) row.role = role === "admin" ? "admin" : "inspector";
    if (typeof is_assessor === "boolean") row.is_assessor = is_assessor;
    if (active === true) row.active = true;
    if (Object.keys(row).length) {
      const { error } = await admin.from("profiles").update(row).eq("id", id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

// Remove: block sign-in but keep their past inspections.
export async function DELETE(req, { params }) {
  const me = await requireAdmin(); if (!me) return deny();
  try {
    const { id } = await params;
    if (id === me) throw new Error("You can't remove yourself.");
    const admin = adminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (error) throw error;
    await admin.from("profiles").update({ active: false }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
