export const STATUSES = [
  { k: "Scheduled", c: "--s-sched" }, { k: "Inspected", c: "--s-insp" }, { k: "Ready to Bill", c: "--s-ready" },
  { k: "Billed", c: "--s-billed" }, { k: "Completed Paid", c: "--s-paid" }, { k: "On Hold", c: "--s-hold" },
];
export const TYPES = ["Mold Assessment", "PRV", "Peace of Mind", "Other"];
export const BILLING = ["Cash Job", "Bill Vendor", "Bill Insurance", "Contractor", "Other"];
export const statusColor = (k) => (STATUSES.find((s) => s.k === k) || STATUSES[0]).c;

export const sameDay = (a, b) => a.toDateString() === b.toDateString();
export const fmtT = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const fmtD = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtLong = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
export function startOfWeek(dt) { const x = new Date(dt); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
const q = encodeURIComponent;
export const mapLinks = (a) => ({
  google: `https://www.google.com/maps/search/?api=1&query=${q(a)}`,
  apple: `https://maps.apple.com/?q=${q(a)}`,
  waze: `https://waze.com/ul?q=${q(a)}&navigate=yes`,
});
export function routeLinks(stops) {
  if (!stops.length) return null;
  const last = stops.at(-1).address, mid = stops.slice(0, -1).map((s) => s.address);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q(last)}${mid.length ? `&waypoints=${q(mid.join("|"))}` : ""}&travelmode=driving`,
    apple: `https://maps.apple.com/directions?destination=${q(last)}${mid.map((a) => `&waypoint=${q(a)}`).join("")}&mode=driving`,
  };
}
export function clientEmail(i, assessorName) {
  const d = new Date(i.scheduled_at);
  return `Subject: Your ${i.type} with HomeWell Services — ${fmtD(d)}

Hi ${i.client_name.split(" ")[0]},

Thank you for choosing HomeWell Services. This confirms your ${i.type} on ${fmtLong(d)} at ${fmtT(d)}.

Property: ${i.address}
Assessor: ${assessorName} (State Certified Mold Assessor)
Reference: ${i.code}

Please make sure we have access to all rooms, the attic and the A/C closet. Your report will be emailed within 2–3 business days after the inspection.

Thank you,
HomeWell Services, Inc.`;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
