"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message.includes("banned") ? "This account has been turned off. Contact Sarah or Tati."
        : "That email and password don't match. Check for typos and try again.");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div id="login">
      <form className="lcard" onSubmit={signIn}>
        <div className="lhead">
          <img src="/logo.png" alt="HomeWell logo" />
          <h1>HomeWell</h1>
          <p>Inspections</p>
        </div>
        <div className="f">
          <label htmlFor="lemail">Email</label>
          <input id="lemail" type="email" required autoComplete="username" placeholder="you@homewellinc.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="lpass">Password</label>
          <input id="lpass" type="password" required autoComplete="current-password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="lerr">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button className="linkbtn" type="button" onClick={() => setHelp(!help)}>Forgot password?</button>
        {help && <p className="locknote" style={{ textAlign: "center", margin: 0 }}>Ask Sarah or Tati to set a temporary password for you in Settings. You'll choose a new one when you sign in.</p>}
        <p className="locknote" style={{ textAlign: "center", margin: 0 }}>You stay signed in on this device until you sign out.</p>
      </form>
    </div>
  );
}
