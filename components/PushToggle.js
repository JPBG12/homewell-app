"use client";
import { useEffect, useState } from "react";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
function keyBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// "Turn on phone notifications" panel shown in the Notifications sheet.
export default function PushToggle({ supabase, userId, toast }) {
  const [state, setState] = useState("checking"); // checking | unsupported | install | off | on | blocked
  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !KEY) return setState(ios && !standalone ? "install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
      const j = sub.toJSON();
      await supabase.from("push_subscriptions").delete().eq("endpoint", j.endpoint);
      const { error } = await supabase.from("push_subscriptions").insert({ user_id: userId, endpoint: j.endpoint, keys: j.keys });
      if (error) throw error;
      setState("on"); toast("Phone notifications are on");
    } catch (e) { toast(`Couldn't turn on notifications: ${e.message}`); }
  }
  async function turnOff() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off"); toast("Phone notifications are off on this device");
  }

  if (state === "checking" || state === "unsupported") return null;
  return (
    <div className="panel">
      {state === "install" && <p className="sub" style={{ margin: 0 }}>To get alerts on this iPhone, open this site in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. Open HomeWell from the home screen and come back here.</p>}
      {state === "blocked" && <p className="sub" style={{ margin: 0 }}>Notifications are blocked for HomeWell. On iPhone, open <b>Settings → Notifications → HomeWell</b> and turn on Allow Notifications.</p>}
      {state === "off" && <div className="row" style={{ justifyContent: "space-between" }}><div><b>Phone notifications</b><p className="locknote" style={{ margin: "2px 0 0" }}>Get an alert even when the app is closed.</p></div><button className="btn sm" onClick={turnOn}>Turn on</button></div>}
      {state === "on" && <div className="row" style={{ justifyContent: "space-between" }}><div><b>Phone notifications are on</b><p className="locknote" style={{ margin: "2px 0 0" }}>For this device.</p></div><button className="btn ghost sm" onClick={turnOff}>Turn off</button></div>}
    </div>
  );
}
