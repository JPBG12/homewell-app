"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePassword({ first, onDone }) {
  const [p1, setP1] = useState(""), [p2, setP2] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (p1.length < 8) return setErr("Use at least 8 characters.");
    if (p1 !== p2) return setErr("The two passwords don't match.");
    setBusy(true); setErr("");
    const { error } = await createClient().auth.updateUser({ password: p1, data: { must_change_password: false } });
    if (error) { setErr(error.message.includes("different") ? "Choose a password different from the temporary one." : error.message); setBusy(false); return; }
    if (onDone) onDone(); else window.location.href = "/";
  }
  const form = (
    <form className="lcard" onSubmit={save} style={first ? undefined : { boxShadow: "none", padding: 0, border: 0, background: "none" }}>
      {first && <div className="lhead"><img src="/logo.png" alt="HomeWell logo" /><h1>Welcome to HomeWell</h1><p>Choose your password</p></div>}
      <div className="f"><label htmlFor="np1">New password</label><input id="np1" type="password" autoComplete="new-password" required value={p1} onChange={(e) => setP1(e.target.value)} /></div>
      <div className="f"><label htmlFor="np2">Type it again</label><input id="np2" type="password" autoComplete="new-password" required value={p2} onChange={(e) => setP2(e.target.value)} /></div>
      {err && <p className="lerr">{err}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      {first && <p className="locknote" style={{ textAlign: "center", margin: 0 }}>Your iPhone can save this password and fill it in with Face ID.</p>}
    </form>
  );
  return first ? <div id="login">{form}</div> : form;
}
