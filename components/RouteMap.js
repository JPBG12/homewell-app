"use client";
import { useEffect, useRef, useState } from "react";
import OsmMap from "./OsmMap";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
let loader;
function loadGoogle() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  loader ||= new Promise((resolve, reject) => {
    window.__hwMapsReady = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async&callback=__hwMapsReady`;
    s.async = true; s.onerror = reject;
    document.head.appendChild(s);
  });
  return loader;
}

// Google map of today's stops; falls back to OpenStreetMap if Google isn't available.
export default function RouteMap({ stops }) {
  const el = useRef(), map = useRef(), drawn = useRef([]);
  const [fallback, setFallback] = useState(!KEY);

  useEffect(() => {
    if (fallback) return;
    window.gm_authFailure = () => setFallback(true);
    let cancelled = false;
    loadGoogle().then((g) => {
      if (cancelled || !el.current) return;
      map.current ||= new g.Map(el.current, {
        center: { lat: 28.67, lng: -81.28 }, zoom: 11,
        disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false,
      });
      drawn.current.forEach((o) => o.setMap(null)); drawn.current = [];
      const pts = stops.filter((s) => s.lat != null && s.lng != null);
      const bounds = new g.LatLngBounds();
      pts.forEach((s) => {
        const n = stops.indexOf(s) + 1, pos = { lat: s.lat, lng: s.lng };
        drawn.current.push(new g.Marker({
          map: map.current, position: pos, title: `${n}. ${s.client_name}`,
          label: { text: String(n), color: "#46E3D5", fontWeight: "800", fontSize: "13px" },
          icon: { path: g.SymbolPath.CIRCLE, scale: 14, fillColor: "#1A1945", fillOpacity: 1, strokeColor: "#46E3D5", strokeWeight: 3 },
        }));
        bounds.extend(pos);
      });
      if (pts.length > 1) {
        drawn.current.push(new g.Polyline({
          map: map.current, path: pts.map((s) => ({ lat: s.lat, lng: s.lng })), strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#136AFF", scale: 3 }, offset: "0", repeat: "14px" }],
        }));
        map.current.fitBounds(bounds, 60);
      } else if (pts.length === 1) { map.current.setCenter(bounds.getCenter()); map.current.setZoom(14); }
    }).catch(() => setFallback(true));
    return () => { cancelled = true; };
  }, [stops, fallback]);

  if (fallback) return <OsmMap stops={stops} />;
  return <div ref={el} className="lmap" role="img" aria-label="Map of today's stops" />;
}
