"use client";
import { useEffect, useRef } from "react";

// Map of today's stops using OpenStreetMap tiles.
export default function RouteMap({ stops }) {
  const el = useRef(), map = useRef();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { scrollWheelZoom: false }).setView([28.67, -81.28], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
      }
      const m = map.current;
      m.eachLayer((l) => { if (!(l instanceof L.TileLayer)) m.removeLayer(l); });
      const pts = stops.filter((s) => s.lat != null && s.lng != null);
      pts.forEach((s) => {
        const n = stops.indexOf(s) + 1;
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: `<div class="pinnum">${n}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })
          .addTo(m).bindPopup(`${n}. ${s.client_name}`);
      });
      if (pts.length > 1) L.polyline(pts.map((s) => [s.lat, s.lng]), { color: "#136AFF", weight: 3, dashArray: "7 6" }).addTo(m);
      if (pts.length) m.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])).pad(0.3), { maxZoom: 14 });
    })();
    return () => { cancelled = true; };
  }, [stops]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return <div ref={el} className="lmap" role="img" aria-label="Map of today's stops" />;
}
