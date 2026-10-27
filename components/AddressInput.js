"use client";
import { useEffect, useRef, useState } from "react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const Pin = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>);

// Address field with Google suggestions (when a Maps key is set) or past addresses otherwise.
export default function AddressInput({ value, onChange, onPick, pastAddresses }) {
  const [hits, setHits] = useState([]);
  const timer = useRef(), session = useRef(), box = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  function typed(text) {
    onChange(text);
    clearTimeout(timer.current);
    const t = text.trim();
    if (t.length < 3) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      if (KEY) {
        session.current ||= crypto.randomUUID();
        try {
          const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
            body: JSON.stringify({
              input: t, sessionToken: session.current, includedRegionCodes: ["us"],
              locationBias: { circle: { center: { latitude: 28.66, longitude: -81.3 }, radius: 50000 } },
            }),
          });
          const j = await r.json();
          setHits((j.suggestions || []).filter((s) => s.placePrediction).slice(0, 5)
            .map((s) => ({ label: s.placePrediction.text.text, placeId: s.placePrediction.placeId })));
        } catch { setHits([]); }
      } else {
        const words = t.toLowerCase().split(/\s+/);
        setHits((pastAddresses || []).filter((a) => words.every((w) => a.address.toLowerCase().includes(w))).slice(0, 5)
          .map((a) => ({ label: a.address, lat: a.lat, lng: a.lng, placeId: a.place_id })));
      }
    }, 250);
  }

  async function pick(h) {
    setHits([]);
    if (KEY && h.placeId && h.lat == null) {
      try {
        const r = await fetch(`https://places.googleapis.com/v1/places/${h.placeId}?sessionToken=${session.current || ""}`, {
          headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "formattedAddress,location" },
        });
        const j = await r.json();
        session.current = null;
        const address = (j.formattedAddress || h.label).replace(/, USA$/, "");
        onPick({ address, lat: j.location?.latitude ?? null, lng: j.location?.longitude ?? null, place_id: h.placeId });
        return;
      } catch {}
    }
    onPick({ address: h.label.replace(/, USA$/, ""), lat: h.lat ?? null, lng: h.lng ?? null, place_id: h.placeId ?? null });
  }

  return (
    <div className="f wide acwrap" ref={box}
      onBlur={() => setTimeout(() => { if (!box.current?.contains(document.activeElement)) setHits([]); }, 150)}>
      <label htmlFor="fad">Property address <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></label>
      <input id="fad" value={value} placeholder="Start typing a street address" autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={hits.length > 0}
        onChange={(e) => typed(e.target.value)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); box.current.querySelector(".suggest button")?.focus(); } }} />
      {hits.length > 0 && (
        <div className="suggest">
          {hits.map((h, k) => <button type="button" key={k} onClick={() => pick(h)}><Pin /><span>{h.label}</span></button>)}
          {!KEY && <small>Suggestions from past inspections. Google suggestions turn on once the Maps key is added.</small>}
        </div>
      )}
    </div>
  );
}
