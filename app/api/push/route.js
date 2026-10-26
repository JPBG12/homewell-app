import { NextResponse } from "next/server";
import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";

// Called by the database whenever a notification is created; sends it to that person's phones.
export async function POST(req) {
  if (!process.env.PUSH_WEBHOOK_SECRET || req.headers.get("x-push-secret") !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "Push keys are not set in Vercel." }, { status: 500 });
  webpush.setVapidDetails("mailto:contact@homewellinc.com", pub, priv);

  const { user_id, message, inspection_id } = await req.json();
  const admin = adminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", user_id);
  const payload = JSON.stringify({
    title: "HomeWell", body: message, tag: inspection_id ? `job-${inspection_id}` : undefined,
    url: inspection_id ? `/?open=${inspection_id}` : "/",
  });
  let sent = 0;
  await Promise.all((subs || []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); }
  }));
  return NextResponse.json({ sent });
}
