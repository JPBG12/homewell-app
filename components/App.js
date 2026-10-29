"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  STATUSES, TYPES, BILLING, statusColor, sameDay, fmtT, fmtD, fmtDY, fmtLong, startOfWeek, mapLinks, routeLinks, clientEmail, copyText, displayId,
} from "@/lib/constants";
import AddressInput from "./AddressInput";
import ChangePassword from "./ChangePassword";
import PushToggle from "./PushToggle";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <div className="lmap" /> });
const supabase = createClient();
const PAGE = 100; // cards shown at a time in the Inspections list

/* ───────── icons ───────── */
const Pin = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>);
const I = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  all: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  route: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3z" /><path d="M9 7v13M15 4v13" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>,
};

/* ───────── small pieces ───────── */
function Sheet({ onClose, children }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true"><div className="grab" />{children}</div>
    </div>
  );
}
const Close = ({ onClose }) => <button className="x" onClick={onClose} aria-label="Close">×</button>;
const StatusPill = ({ s }) => <span className="pill" style={{ "--c": `var(${statusColor(s)})` }}>{s}</span>;

function Card({ i, name, showAssessor, onOpen }) {
  const noAddr = !i.address;
  const d = new Date(i.scheduled_at), [t, ap] = fmtT(d).split(" ");
  return (
    <button className="card" onClick={() => onOpen(i.id)}>
      <div className="time"><b>{t}</b>{ap}</div>
      <div className="cbody">
        <div className="ctop"><span className="cname">{i.client_name}</span><StatusPill s={i.status} /></div>
        <div className="addr"><Pin /><span>{noAddr ? "No address on file" : i.address}</span></div>
        <div className="meta">
          {i.type && <span className="chip">{i.type}</span>}
          {showAssessor && <span className="chip">{name}</span>}
          <span className="chip">{fmtDY(d)}</span>
        </div>
      </div>
    </button>
  );
}

/* ───────── app ───────── */
export default function App({ userId }) {
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [refs, setRefs] = useState([]);
  const [apptHours, setApptHours] = useState(2);
  const [items, setItems] = useState([]);
  const [notis, setNotis] = useState([]);
  const [view, setView] = useState("today");
  const [listStatus, setListStatus] = useState("All"); // filter the Inspections list opens with
  const [sheet, setSheet] = useState(null); // {kind, id}
  const [toastMsg, setToastMsg] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const toastTimer = useRef();

  const toast = useCallback((t) => { clearTimeout(toastTimer.current); setToastMsg(t); toastTimer.current = setTimeout(() => setToastMsg(""), 2600); }, []);

  const loadTeam = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("name");
    if (data) { setTeam(data); setMe(data.find((p) => p.id === userId) || null); }
  }, [userId]);
  const loadRefs = useCallback(async () => {
    const { data } = await supabase.from("referral_sources").select("*").eq("active", true).order("name");
    if (data) setRefs(data);
  }, []);
  const loadItems = useCallback(async () => {
    // Load every job since day one, 1000 at a time (Supabase sends at most 1000 per request).
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("inspections").select("*")
        .order("scheduled_at").order("id").range(from, from + 999);
      if (error) { setLoadErr(error.message); return; }
      all.push(...data);
      if (data.length < 1000) break;
    }
    setItems(all);
  }, []);
  const loadNotis = useCallback(async () => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (data) setNotis(data);
  }, [userId]);

  useEffect(() => {
    loadTeam(); loadRefs(); loadItems(); loadNotis();
    supabase.from("app_settings").select("appt_hours").single().then(({ data }) => data && setApptHours(+data.appt_hours));
    const ch = supabase.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "inspections" }, () => loadItems())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => { loadNotis(); toast(p.new.message); })
      .subscribe();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onFocus = () => { loadItems(); loadNotis(); };
    addEventListener("focus", onFocus);
    return () => { supabase.removeChannel(ch); removeEventListener("focus", onFocus); };
  }, [userId, loadTeam, loadRefs, loadItems, loadNotis, toast]);

  // Opening the app from a phone notification: /?open=<job id>
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("open"));
    if (id && items.some((x) => x.id === id)) { setSheet({ kind: "detail", id }); history.replaceState(null, "", "/"); }
  }, [items]);

  const byId = useMemo(() => Object.fromEntries(team.map((p) => [p.id, p])), [team]);
  const nameOf = (id) => byId[id]?.name || "Unassigned";
  const isAdmin = me?.role === "admin";
  const assessors = useMemo(() => team.filter((p) => p.active && p.is_assessor), [team]);
  const mine = useMemo(() => (isAdmin ? items : items.filter((i) => i.assessor_id === userId)), [items, isAdmin, userId]);
  const open = (id) => setSheet({ kind: "detail", id });
  const close = useCallback(() => setSheet(null), []);

  if (loadErr) return <div className="loading"><p>Couldn't load inspections: {loadErr}</p></div>;
  if (!me) return <div className="loading"><p>Loading…</p></div>;
  if (!me.active) return <div className="loading"><p>Your account has been turned off. Contact Sarah or Tati.</p></div>;

  const unread = notis.filter((n) => !n.read).length;
  const tabs = [["today", "Today"], ["cal", "Calendar"], ["route", "Route"], ["all", "Inspections"], ...(isAdmin ? [["settings", "Settings"]] : [])];
  const shared = { mine, nameOf, isAdmin, open };

  return (
    <>
      <header>
        <div className="wrap hbar">
          <img className="logo" src="/logo.png" alt="HomeWell logo" />
          <div className="brand"><b>HomeWell</b><span>Inspections</span></div>
          <div className="hspace" />
          <button className="bell" onClick={() => setSheet({ kind: "search" })} aria-label="Search inspections">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="bell" onClick={() => setSheet({ kind: "notis" })} aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
          <button className="acct" onClick={() => setSheet({ kind: "account" })} aria-label={`Account: ${me.name}`}>{me.name.slice(0, 2).toUpperCase()}</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([v, label]) => (
          <button key={v} className="tab" aria-current={view === v} onClick={() => { setView(v); setListStatus("All"); scrollTo(0, 0); }}>{I[v]}{label}</button>
        ))}
      </nav>

      <main className="wrap">
        {view === "today" && <Today {...shared} me={me} showStatus={(st) => { setListStatus(st); setView("all"); scrollTo(0, 0); }} />}
        {view === "all" && <AllList key={listStatus} {...shared} assessors={assessors} initialStatus={listStatus} />}
        {view === "cal" && <Calendar {...shared} />}
        {view === "route" && <Route {...shared} me={me} assessors={assessors} />}
        {view === "settings" && isAdmin && <Settings me={me} refs={refs} apptHours={apptHours} setApptHours={setApptHours}
          reloadTeam={loadTeam} reloadRefs={loadRefs} toast={toast} />}
      </main>

      {isAdmin && <button className="fab" onClick={() => setSheet({ kind: "form" })} aria-label="New inspection">+</button>}

      {sheet?.kind === "detail" && (() => {
        const i = items.find((x) => x.id === sheet.id);
        return i ? <Detail i={i} nameOf={nameOf} isAdmin={isAdmin} onClose={close} toast={toast}
          onEdit={() => setSheet({ kind: "form", id: i.id })} reload={loadItems} /> : null;
      })()}
      {sheet?.kind === "form" && <InspectionForm i={items.find((x) => x.id === sheet.id)} items={items} assessors={assessors} refs={refs}
        apptHours={apptHours} nameOf={nameOf} onClose={close} toast={toast} reload={loadItems} />}
      {sheet?.kind === "search" && <Search {...shared} onClose={close} onPick={open} userId={userId} />}
      {sheet?.kind === "notis" && <Notifications notis={notis} onClose={close} reload={loadNotis} userId={userId} toast={toast}
        onOpen={(id) => items.some((x) => x.id === id) ? open(id) : close()} />}
      {sheet?.kind === "account" && <Account me={me} onClose={close} toast={toast} />}

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}

/* ───────── views ───────── */
function List({ arr, nameOf, isAdmin, open, empty = "No inspections here." }) {
  if (!arr.length) return <div className="empty">{empty}</div>;
  return <div className="list">{arr.map((i) => <Card key={i.id} i={i} name={i.assessor_id ? nameOf(i.assessor_id) : (i.legacy_assessor || "Unassigned")} showAssessor={isAdmin} onOpen={open} />)}</div>;
}

function Today({ mine, nameOf, isAdmin, open, me, showStatus }) {
  const now = new Date();
  const todays = mine.filter((i) => sameDay(new Date(i.scheduled_at), now));
  const count = (st) => mine.filter((i) => i.status === st).length;
  const hr = now.getHours(), greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <h1>{greet}, {me.name}</h1>
      <p className="sub">{fmtLong(now)}</p>
      <div className={isAdmin ? "stats four" : "stats"}>
        <div className="stat"><b>{todays.length}</b><span>Today</span></div>
        <div className="stat"><b>{todays.filter((i) => i.status === "Scheduled").length}</b><span>Still to go</span></div>
        <button className="stat tap" onClick={() => showStatus("Inspected")} aria-label="Show jobs with a pending report"><b>{count("Inspected")}</b><span>Pending report ›</span></button>
        {isAdmin && <button className="stat tap" onClick={() => showStatus("Ready to Bill")} aria-label="Show jobs ready to bill"><b>{count("Ready to Bill")}</b><span>To bill ›</span></button>}
      </div>
      <h2>{isAdmin ? "Everyone's appointments today" : "Your appointments today"}</h2>
      <List arr={todays} nameOf={nameOf} isAdmin={isAdmin} open={open} empty="Nothing scheduled today." />
    </>
  );
}

function AllList({ mine, nameOf, isAdmin, open, assessors, initialStatus = "All" }) {
  const [q, setQ] = useState(""), [status, setStatus] = useState(initialStatus), [who, setWho] = useState("All");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [q, status, who]);
  const arr = mine.filter((i) => (status === "All" || i.status === status) &&
    (who === "All" || i.assessor_id === who) &&
    [i.client_name, i.address, i.code, i.legacy_id].join(" ").toLowerCase().includes(q.toLowerCase())).slice().reverse();
  return (
    <>
      <h1>Inspections</h1>
      <p className="sub">{arr.length === mine.length ? `${arr.length} inspections` : `${arr.length} of ${mine.length} inspections`}</p>
      <div className="toolbar">
        <input className="search" placeholder="Search name, address or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && (
          <select className="fsel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assessor">
            <option value="All">All assessors</option>
            {assessors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      <div className="chips">
        {["All", ...STATUSES.map((s) => s.k)].map((s) => <button key={s} className="fchip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s}</button>)}
      </div>
      <List arr={arr.slice(0, shown)} nameOf={nameOf} isAdmin={isAdmin} open={open} />
      {arr.length > shown && <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
        <button className="btn ghost sm" onClick={() => setShown(shown + PAGE)}>Show more ({arr.length - shown} older)</button></div>}
    </>
  );
}

// Week strip: Sun–Sat buttons with job counts, plus Prev / This week / Next.
function WeekStrip({ jobs, day, setDay }) {
  const today = new Date();
  const weekStart = startOfWeek(day);
  const days = [...Array(7)].map((_, k) => { const x = new Date(weekStart); x.setDate(x.getDate() + k); return x; });
  const shift = (k) => {
    if (k === 0) return setDay(today);
    const w = new Date(weekStart); w.setDate(w.getDate() + 7 * k); setDay(w);
  };
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn ghost sm" onClick={() => shift(-1)}>‹ Prev</button>
        <button className="btn ghost sm" onClick={() => shift(0)}>This week</button>
        <button className="btn ghost sm" onClick={() => shift(1)}>Next ›</button>
      </div>
      <div className="week">
        {days.map((x) => {
          const n = jobs.filter((i) => sameDay(new Date(i.scheduled_at), x)).length;
          return (
            <button key={x.getTime()} className={`day ${sameDay(x, today) ? "today" : ""}`} aria-pressed={sameDay(x, day)} onClick={() => setDay(x)}>
              <small>{x.toLocaleDateString("en-US", { weekday: "short" })}</small><b>{x.getDate()}</b><i>{n ? `${n} job${n > 1 ? "s" : ""}` : ""}</i>
            </button>
          );
        })}
      </div>
    </>
  );
}

const shortTime = (d) => fmtT(d).replace(" ", "");

function Calendar({ mine, nameOf, isAdmin, open }) {
  const today = new Date();
  const [mode, setModeRaw] = useState("week");
  useEffect(() => { try { const v = localStorage.getItem("hw-cal-view"); if (v === "month") setModeRaw(v); } catch {} }, []);
  const setMode = (m) => { setModeRaw(m); setPop(null); try { localStorage.setItem("hw-cal-view", m); } catch {} };
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [pop, setPop] = useState(null); // quick view of one day: { key, date, style }
  const wrapRef = useRef(), gridRef = useRef(), popRef = useRef();
  const [fit, setFit] = useState(null); // desktop: { rowH } so the whole month fits on screen
  const who = (i) => (i.assessor_id ? nameOf(i.assessor_id) : i.legacy_assessor || "Unassigned");
  const shiftMonth = (k) => { setPop(null); setMonth(k === 0 ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(month.getFullYear(), month.getMonth() + k, 1)); };

  // Month grid: from the Sunday on/before the 1st to the Saturday on/after the last day.
  const gridStart = startOfWeek(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks = Math.ceil((last.getDate() + month.getDay()) / 7);
  const cells = [...Array(weeks * 7)].map((_, k) => { const x = new Date(gridStart); x.setDate(x.getDate() + k); return x; });
  const byDay = useMemo(() => {
    const m = {};
    mine.forEach((i) => { const k = new Date(i.scheduled_at).toDateString(); (m[k] ||= []).push(i); });
    Object.values(m).forEach((arr) => arr.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    return m;
  }, [mine]);

  // On a computer, size the rows so the whole month fits in the window (no scrolling).
  useEffect(() => {
    if (mode !== "month") return;
    const measure = () => {
      const g = gridRef.current;
      if (!g || innerWidth < 900 || innerHeight < 560) return setFit(null);
      const top = g.getBoundingClientRect().top + scrollY;
      const avail = innerHeight - top - 48; // room for the color key below
      setFit({ rowH: Math.max(72, Math.floor((avail - 30) / weeks)) });
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [mode, weeks]);

  // Close the quick view on outside click or Esc.
  useEffect(() => {
    if (!pop) return;
    const down = (e) => { if (popRef.current && !popRef.current.contains(e.target) && !e.target.closest?.(".mmore")) setPop(null); };
    const key = (e) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", down); document.addEventListener("touchstart", down); addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down); removeEventListener("keydown", key); };
  }, [pop]);

  const showMore = (x, idx, cellEl) => {
    const key = x.toDateString();
    if (pop?.key === key) return setPop(null);
    const w = wrapRef.current.getBoundingClientRect(), c = cellEl.getBoundingClientRect();
    const col = idx % 7, row = Math.floor(idx / 7);
    const style = { top: c.top - w.top - 4 };
    if (col >= 4) style.right = w.right - c.right - 4; else style.left = c.left - w.left - 4;
    if (row >= weeks - 2) { delete style.top; style.bottom = w.bottom - c.bottom - 4; }
    setPop({ key, date: x, style });
  };

  // How many jobs fit in a day box (computer: from the row height; phone: 3).
  const EV = 24, HEAD = 32, MORE = 19;
  const fitAll = fit ? Math.max(1, Math.floor((fit.rowH - HEAD) / EV)) : 3;
  const fitWithMore = fit ? Math.max(1, Math.floor((fit.rowH - HEAD - MORE) / EV)) : 3;
  const evLabel = (i) => <><b>{shortTime(new Date(i.scheduled_at))}</b> {i.client_name}{isAdmin ? ` - ${who(i)}` : ""}</>;
  const evTitle = (i) => `${shortTime(new Date(i.scheduled_at))} ${i.client_name}${isAdmin ? ` - ${who(i)}` : ""} · ${i.status}`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>Calendar</h1>
          <p className="sub">{mode === "month" ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : `Week of ${fmtD(startOfWeek(day))}`}</p></div>
        <div className="row">
          {mode === "month" && <span className="mnav top">
            <button className="btn ghost sm" onClick={() => shiftMonth(-1)}>‹ Prev</button>
            <button className="btn ghost sm" onClick={() => shiftMonth(0)}>This month</button>
            <button className="btn ghost sm" onClick={() => shiftMonth(1)}>Next ›</button>
          </span>}
          <div className="seg" role="group" aria-label="Calendar view">
            <button aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
            <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
          </div>
        </div>
      </div>

      {mode === "week" ? (
        <>
          <WeekStrip jobs={mine} day={day} setDay={setDay} />
          <h2>{fmtLong(day)}</h2>
          <List arr={mine.filter((i) => sameDay(new Date(i.scheduled_at), day))} nameOf={nameOf} isAdmin={isAdmin} open={open} />
        </>
      ) : (
        <div className="mwrap" ref={wrapRef}>
          <div className="mnav below">
            <button className="btn ghost sm" onClick={() => shiftMonth(-1)}>‹ Prev</button>
            <button className="btn ghost sm" onClick={() => shiftMonth(0)}>This month</button>
            <button className="btn ghost sm" onClick={() => shiftMonth(1)}>Next ›</button>
          </div>
          <div className={`mgrid${fit ? " fit" : ""}`} ref={gridRef}
            style={fit ? { gridTemplateRows: `auto repeat(${weeks}, ${fit.rowH}px)` } : undefined}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => <div key={w} className="mhead">{w}</div>)}
            {cells.map((x, idx) => {
              const jobs = byDay[x.toDateString()] || [];
              const out = x.getMonth() !== month.getMonth();
              const shown = jobs.length <= fitAll ? jobs : jobs.slice(0, fitWithMore);
              return (
                <div key={x.getTime()} className={`mcell${out ? " out" : ""}`}>
                  <button className={`mnum${sameDay(x, today) ? " now" : ""}`} onClick={() => { setDay(x); setMode("week"); }} aria-label={`Show ${fmtLong(x)}`}>{x.getDate()}</button>
                  {shown.map((i) => (
                    <button key={i.id} className="mev" style={{ "--c": `var(${statusColor(i.status)})` }} title={evTitle(i)} onClick={() => open(i.id)}><span>{evLabel(i)}</span></button>
                  ))}
                  {jobs.length > shown.length && (
                    <button className="mmore" aria-expanded={pop?.key === x.toDateString()} onClick={(e) => showMore(x, idx, e.currentTarget.parentElement)}>+{jobs.length - shown.length} more</button>
                  )}
                </div>
              );
            })}
          </div>
          {pop && (
            <div className="mpop" ref={popRef} style={pop.style} role="dialog" aria-label={fmtLong(pop.date)}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <b>{pop.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</b>
                <button className="x" style={{ width: 28, height: 28, fontSize: 15 }} onClick={() => setPop(null)} aria-label="Close">✕</button>
              </div>
              {(byDay[pop.key] || []).map((i) => (
                <button key={i.id} className="mev full" style={{ "--c": `var(${statusColor(i.status)})` }} title={evTitle(i)} onClick={() => { setPop(null); open(i.id); }}><span>{evLabel(i)}</span></button>
              ))}
            </div>
          )}
          <div className="legend">
            {STATUSES.map((st) => <span key={st.k}><i style={{ background: `var(${st.c})` }} />{st.k}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

function Route({ mine, isAdmin, open, me, assessors }) {
  // Whoever is signed in comes first and is picked by default (if they do inspections).
  const people = [...assessors].sort((x, y) => (y.id === me.id) - (x.id === me.id));
  const [who, setWho] = useState(isAdmin ? (people[0]?.id || me.id) : me.id);
  const today = new Date();
  const [day, setDay] = useState(today);
  const isToday = sameDay(day, today);
  const theirs = useMemo(() => mine.filter((i) => i.assessor_id === who), [mine, who]);
  const stops = useMemo(() => theirs.filter((i) => sameDay(new Date(i.scheduled_at), day)), [theirs, day]);
  const links = routeLinks(stops);
  const whoName = assessors.find((a) => a.id === who)?.name || me.name;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>{isToday ? "Today\u2019s route" : "Route"}</h1><p className="sub">{stops.length} stop{stops.length === 1 ? "" : "s"} for {whoName} · {fmtD(day)}</p></div>
        {isAdmin && (
          <select className="fsel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Inspector">
            {people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      <WeekStrip jobs={theirs} day={day} setDay={setDay} />
      <div className="mapwrap">
        <RouteMap stops={stops} />
        <div className="stops">
          {stops.length ? stops.map((s, k) => (
            <div className="stop" key={s.id}>
              <span className="num">{k + 1}</span>
              <div style={{ minWidth: 0 }}><b>{fmtT(new Date(s.scheduled_at))} · {s.client_name}</b><div className="addr">{s.address || "No address yet"}</div></div>
              <button className="btn ghost sm" onClick={() => open(s.id)}>Open</button>
            </div>
          )) : <div className="empty" style={{ border: 0 }}>{isToday ? "No stops today." : "No stops this day."}</div>}
        </div>
      </div>
      {links && (
        <>
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn" href={links.google} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>Start full route in Google Maps</a>
            <a className="btn" href={links.apple} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>Start full route in Apple Maps</a>
          </div>
          <p className="locknote">Multi-stop Apple Maps routes need iOS 18.4 or later.</p>
        </>
      )}
    </>
  );
}

/* ───────── inspection detail ───────── */
function Detail({ i, nameOf, isAdmin, onClose, onEdit, toast, reload }) {
  const d = new Date(i.scheduled_at), L = i.address ? mapLinks(i.address) : null, addrRef = useRef();
  const who = i.assessor_id ? nameOf(i.assessor_id) : (i.legacy_assessor || "Unassigned");
  const [copied, setCopied] = useState(false), [confirmDel, setConfirmDel] = useState(false);
  const email = clientEmail(i);
  const selectEl = (el) => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };

  async function setStatus(s) {
    if (s === i.status) return;
    const { error } = await supabase.from("inspections").update({ status: s }).eq("id", i.id);
    if (error) return toast(error.message);
    toast(`Marked ${s}${isAdmin ? "" : " · office notified"}`); reload();
  }
  async function copyAddr() {
    if (await copyText(i.address)) { setCopied(true); setTimeout(() => setCopied(false), 1800); toast("Address copied"); }
    else { selectEl(addrRef.current); toast("Address selected — tap Copy"); }
  }
  async function del() {
    const { error } = await supabase.from("inspections").delete().eq("id", i.id);
    if (error) return toast(error.message);
    toast(`Deleted ${displayId(i)}`); onClose(); reload();
  }

  return (
    <Sheet onClose={onClose}>
      <div className="shead">
        <div><small className="time">ID {displayId(i)}</small><h1>{i.client_name}</h1><p className="sub">{fmtDY(d)} · {fmtT(d)}</p></div>
        <Close onClose={onClose} />
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
          <div className="addr" style={{ color: "var(--fg)", fontWeight: 600, userSelect: "text", WebkitUserSelect: "text" }}><Pin /><span ref={addrRef}>{i.address || "No address on file"}</span></div>
          {L && <button className="btn ghost sm" style={{ flex: "none" }} onClick={copyAddr}>{copied ? "Copied" : "Copy"}</button>}
        </div>
        {L && <div className="navbtns">
          <a href={L.google} target="_blank" rel="noopener">Google Maps</a>
          <a href={L.apple} target="_blank" rel="noopener">Apple Maps</a>
          <a href={L.waze} target="_blank" rel="noopener">Waze</a>
        </div>}
      </div>
      <div className="panel">
        <b>Status</b>
        <div className="statusgrid">
          {STATUSES.map((s) => <button key={s.k} className="sbtn" style={{ "--c": `var(${s.c})` }} aria-pressed={i.status === s.k} onClick={() => setStatus(s.k)}>{s.k}</button>)}
        </div>
        <p className="locknote">Last updated{i.updated_by || i.created_by ? ` by ${nameOf(i.updated_by || i.created_by)}` : ""} · {new Date(i.updated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
      </div>
      <div className="panel kv">
        <div><small>Type</small><span>{i.type || "—"}</span></div>
        <div><small>Assessor</small><span>{who}</span></div>
        <div><small>Referred by</small><span>{i.referral_source || "—"}</span></div>
        <div><small>Billing</small><span>{i.billing || "—"}</span></div>
        <div><small>Report sent</small><span>{i.report_sent ? "Yes" : "No"}</span></div>
        <div><small>Invoice memo</small><span>{i.invoice_memo}</span></div>
        {i.notes && <div style={{ gridColumn: "1/-1" }}><small>Notes</small><span style={{ whiteSpace: "pre-wrap" }}>{i.notes}</span></div>}
      </div>
      {isAdmin ? (
        <>
          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}><b>Client email</b>
              <button className="btn sm" onClick={async (e) => { const el = e.currentTarget.closest(".panel").querySelector("pre");
                if (await copyText(email)) toast("Email copied"); else { selectEl(el); toast("Text selected — tap Copy"); } }}>Copy</button>
            </div>
            <pre className="email">{email}</pre>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={onEdit}>Edit inspection</button>
            <span className="spacer" />
            {confirmDel
              ? <><span className="sub">Delete for good?</span><button className="btn danger sm" onClick={del}>Yes, delete</button><button className="btn ghost sm" onClick={() => setConfirmDel(false)}>Keep</button></>
              : <button className="rmv" onClick={() => setConfirmDel(true)}>Delete</button>}
          </div>
        </>
      ) : <p className="locknote">Inspectors can update status and open directions. Ask Sarah or Tati to change other details.</p>}
    </Sheet>
  );
}

/* ───────── new / edit inspection ───────── */
function InspectionForm({ i, items, assessors, refs, apptHours, nameOf, onClose, toast, reload }) {
  const pad = (n) => String(n).padStart(2, "0");
  const d0 = i ? new Date(i.scheduled_at) : null;
  const [f, setF] = useState({
    client_name: i?.client_name || "", address: i?.address || "", lat: i?.lat ?? null, lng: i?.lng ?? null, place_id: i?.place_id ?? null,
    date: d0 ? `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}` : "", time: d0 ? `${pad(d0.getHours())}:${pad(d0.getMinutes())}` : "",
    type: i?.type || "", assessor_id: i?.assessor_id || "", referral_source: i?.referral_source || "", billing: i?.billing || "",
    notes: i?.notes || "", report_sent: i?.report_sent || false,
  });
  const [busy, setBusy] = useState(false);
  const timeOpts = useMemo(() => {
    const list = [];
    for (let m = 6 * 60; m <= 20 * 60; m += 30) list.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    if (f.time && !list.includes(f.time)) list.push(f.time);
    return list.sort().map((t) => ({ id: t, name: fmtT(new Date(`2000-01-01T${t}`)) }));
  }, [f.time]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const when = f.date && f.time ? new Date(`${f.date}T${f.time}`) : null;
  const clashes = when && f.assessor_id
    ? items.filter((x) => x.id !== i?.id && x.assessor_id === f.assessor_id && Math.abs(new Date(x.scheduled_at) - when) < apptHours * 36e5) : [];
  const past = useMemo(() => { const seen = new Set(); return items.filter((x) => x.address && !seen.has(x.address) && seen.add(x.address)); }, [items]);
  // referral list keeps an old value visible when editing even if it was removed from Settings
  const refNames = [...new Set([...refs.map((r) => r.name), ...(i?.referral_source ? [i.referral_source] : [])])];
  const assessorOpts = i?.assessor_id && !assessors.some((a) => a.id === i.assessor_id) ? [...assessors, { id: i.assessor_id, name: nameOf(i.assessor_id) }] : assessors;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const row = {
      client_name: f.client_name.trim(), address: f.address.trim() || null, lat: f.lat, lng: f.lng, place_id: f.place_id,
      scheduled_at: when.toISOString(), type: f.type || null, assessor_id: f.assessor_id, referral_source: f.referral_source || null,
      billing: f.billing || null, notes: f.notes.trim() || null, report_sent: f.report_sent,
    };
    const { error } = i ? await supabase.from("inspections").update(row).eq("id", i.id) : await supabase.from("inspections").insert(row);
    setBusy(false);
    if (error) return toast(error.message);
    toast(i ? "Saved" : `Created · ${nameOf(f.assessor_id)} notified`);
    onClose(); reload();
  }

  const Sel = ({ id, k, opts, required = false }) => (
    <select id={id} required={required} value={f[k]} onChange={set(k)}>
      <option value="" disabled={required}>{required ? "Choose…" : "Not set yet"}</option>
      {opts.map((o) => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="shead"><h1>{i ? "Edit inspection" : "New inspection"}</h1><Close onClose={onClose} /></div>
      <form className="panel" onSubmit={save} autoComplete="off">
        <div className="fgrid">
          <div className="f wide"><label htmlFor="fn">Client name <span className="req" aria-hidden="true">*</span></label><input id="fn" required value={f.client_name} onChange={set("client_name")} placeholder="e.g. Jordan Smith" /></div>
          <AddressInput value={f.address} pastAddresses={past}
            onChange={(t) => setF((x) => ({ ...x, address: t, lat: null, lng: null, place_id: null }))}
            onPick={(p) => setF((x) => ({ ...x, ...p }))} />
          <div className="f"><label htmlFor="fd">Date <span className="req" aria-hidden="true">*</span></label><div className="dt"><input id="fd" type="date" required value={f.date} onChange={set("date")} /></div></div>
          <div className="f"><label htmlFor="ft">Time <span className="req" aria-hidden="true">*</span></label>{Sel({ id: "ft", k: "time", opts: timeOpts, required: true })}</div>
          <div className="f"><label htmlFor="fty">Type</label>{Sel({ id: "fty", k: "type", opts: TYPES })}</div>
          <div className="f"><label htmlFor="fas">Assessor <span className="req" aria-hidden="true">*</span></label>{Sel({ id: "fas", k: "assessor_id", opts: assessorOpts, required: true })}</div>
          <div className="f"><label htmlFor="fr">Referred by</label>{Sel({ id: "fr", k: "referral_source", opts: refNames })}</div>
          <div className="f"><label htmlFor="fb">Billing</label>{Sel({ id: "fb", k: "billing", opts: BILLING })}</div>
          <div className="f wide"><label htmlFor="fno">Notes <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></label>
            <textarea id="fno" rows={2} value={f.notes} onChange={set("notes")} /></div>
          {i && <label className="check wide"><input type="checkbox" checked={f.report_sent} onChange={set("report_sent")} /> Report sent to client</label>}
        </div>
        <p className="memo" style={{ marginTop: 10 }}><span className="req">*</span> Required</p>
        <p className="memo">Invoice memo (created automatically): <b>{f.client_name.trim() || "Client name"} {f.address.trim() || "Address"} ID: {i ? displayId(i) : "HW-####"}</b></p>
        {clashes.length > 0 && (
          <div className="warn"><b>Heads up:</b> {nameOf(f.assessor_id)} already has {clashes.map((x) => `${x.client_name} at ${fmtT(new Date(x.scheduled_at))}`).join(" and ")} on {fmtD(new Date(clashes[0].scheduled_at))}. Appointments are set to {apptHours} hour{apptHours === 1 ? "" : "s"}, so these overlap.</div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : clashes.length ? "Save anyway" : i ? "Save changes" : "Create & notify assessor"}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ───────── search ───────── */
function Search({ nameOf, isAdmin, onClose, onPick }) {
  const [q, setQ] = useState(""), [hits, setHits] = useState(null);
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    const t = q.trim().replace(/[%,()]/g, " ");
    if (!t) { setHits(null); return; }
    timer.current = setTimeout(async () => {
      const like = `%${t}%`;
      const { data } = await supabase.from("inspections").select("*")
        .or(`client_name.ilike.${like},address.ilike.${like},code.ilike.${like},referral_source.ilike.${like},type.ilike.${like},status.ilike.${like},legacy_id.ilike.${like}`)
        .order("scheduled_at", { ascending: false }).limit(40);
      setHits(data || []);
    }, 250);
  }, [q]);
  const hint = `Searches every inspection${isAdmin ? "" : " assigned to you"}, past and upcoming.`;
  return (
    <Sheet onClose={onClose}>
      <div className="shead"><h1>Search</h1><Close onClose={onClose} /></div>
      <input className="search" autoFocus style={{ width: "100%", marginTop: 12 }} placeholder="Client, address, ID, referral, status…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        {hits === null ? <p className="sub">{hint}</p>
          : hits.length ? <><p className="sub" style={{ marginBottom: 10 }}>{hits.length} result{hits.length > 1 ? "s" : ""}</p><List arr={hits} nameOf={nameOf} isAdmin={isAdmin} open={onPick} /></>
          : <div className="empty">No inspections match “{q}”.</div>}
      </div>
    </Sheet>
  );
}

/* ───────── notifications ───────── */
function Notifications({ notis, onClose, reload, onOpen, userId, toast }) {
  useEffect(() => {
    if (notis.some((n) => !n.read)) supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false).then(reload);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet onClose={onClose}>
      <div className="shead"><h1>Notifications</h1><Close onClose={onClose} /></div>
      <PushToggle supabase={supabase} userId={userId} toast={toast} />
      <div className="panel">
        {notis.length ? notis.map((n) => (
          <button key={n.id} className={`noti ${n.read ? "" : "unread"}`} style={{ background: "none", border: 0, width: "100%", textAlign: "left", color: "inherit" }}
            onClick={() => n.inspection_id && onOpen(n.inspection_id)}>
            <div className="ic"><Pin /></div>
            <div><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>
          </button>
        )) : <p className="sub">You&apos;re all caught up.</p>}
      </div>
    </Sheet>
  );
}

/* ───────── account ───────── */
function Account({ me, onClose, toast }) {
  const [pw, setPw] = useState(false);
  async function signOut() { await supabase.auth.signOut(); window.location.href = "/login"; }
  return (
    <Sheet onClose={onClose}>
      <div className="shead">
        <div className="row"><div className="avatar">{me.name.slice(0, 2).toUpperCase()}</div><div><h1>{me.name}</h1><p className="sub">{me.email} · {me.role === "admin" ? "Admin" : "Inspector"}</p></div></div>
        <Close onClose={onClose} />
      </div>
      <div className="panel">
        {pw ? <ChangePassword onDone={() => { setPw(false); toast("Password changed"); }} />
          : <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setPw(true)}>Change password</button>}
      </div>
      <div className="panel"><button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={signOut}>Sign out</button></div>
      <p className="locknote">To install on iPhone: open this site in Safari, tap Share, then Add to Home Screen.</p>
    </Sheet>
  );
}

/* ───────── settings (admins) ───────── */
function tempPassword() {
  const w = ["Mold", "Sunny", "Lake", "Palm", "Coral", "Breeze", "Cedar", "Orange"];
  return `${w[Math.floor(Math.random() * w.length)]}-${Math.floor(1000 + Math.random() * 9000)}-HW`;
}

function Settings({ me, refs, apptHours, setApptHours, reloadTeam, reloadRefs, toast }) {
  const [members, setMembers] = useState(null), [err, setErr] = useState(""), [editing, setEditing] = useState(null), [adding, setAdding] = useState(false);
  const [newRef, setNewRef] = useState("");

  const loadMembers = useCallback(async () => {
    const r = await fetch("/api/team"); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setErr(""); setMembers(j);
  }, []);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  async function call(url, method, body) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || "Something went wrong"); return false; }
    await loadMembers(); await reloadTeam(); return true;
  }
  async function addRef(e) {
    e.preventDefault(); const v = newRef.trim(); if (!v) return;
    const existing = refs.find((r) => r.name.toLowerCase() === v.toLowerCase());
    if (existing) return toast("Already on the list");
    const { error } = await supabase.from("referral_sources").upsert({ name: v, active: true }, { onConflict: "name" });
    if (error) return toast(error.message);
    setNewRef(""); toast(`Added ${v}`); reloadRefs();
  }
  async function rmRef(r) {
    const { error } = await supabase.from("referral_sources").update({ active: false }).eq("id", r.id);
    if (error) return toast(error.message);
    toast(`Removed ${r.name}`); reloadRefs();
  }
  async function setLen(v) {
    const { error } = await supabase.from("app_settings").update({ appt_hours: v }).eq("id", 1);
    if (error) return toast(error.message);
    setApptHours(v); toast("Saved");
  }

  return (
    <>
      <h1>Settings</h1><p className="sub">Only admins see this page.</p>
      <h2>Team &amp; logins</h2>
      <div className="panel">
        {err && <p className="lerr">{err}</p>}
        {!members && !err && <p className="sub">Loading team…</p>}
        {members?.map((u) => (
          <div className="trow" key={u.id}>
            <div className="who2"><b>{u.name}</b><span>{u.email}</span>
              <div className="tags">
                <span className="chip">{u.role === "admin" ? "Admin" : "Inspector"}</span>
                {u.is_assessor && <span className="chip">Assessor</span>}
                {!u.active ? <span className="chip">Removed</span>
                  : <span className={`chip ${u.last_sign_in_at ? "ok" : "pend"}`}>{u.last_sign_in_at ? "Active" : "Hasn't signed in yet"}</span>}
              </div>
            </div>
            <div className="row">
              {u.active
                ? <><button className="btn ghost sm" onClick={() => setEditing(u)}>Edit</button>
                    {u.id !== me.id && <button className="rmv" onClick={() => call(`/api/team/${u.id}`, "DELETE").then((ok) => ok && toast(`Removed ${u.name}`))}>Remove</button>}</>
                : <button className="btn ghost sm" onClick={() => call(`/api/team/${u.id}`, "PATCH", { active: true }).then((ok) => ok && toast(`${u.name} can sign in again`))}>Restore</button>}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setAdding(true)}>Add person</button></div>
        <p className="locknote">New people get a temporary password from you and choose their own the first time they sign in. Removing someone blocks their sign-in but keeps their past inspections.</p>
      </div>

      <h2>Referral sources</h2>
      <div className="panel">
        <div className="refs">{refs.map((r) => <span className="ref" key={r.id}>{r.name}<button className="rmv" onClick={() => rmRef(r)} aria-label={`Remove ${r.name}`}>×</button></span>)}</div>
        <form className="addrow" onSubmit={addRef}>
          <input value={newRef} onChange={(e) => setNewRef(e.target.value)} required placeholder="New referral source, e.g. Realtor - Coldwell Banker" aria-label="New referral source" />
          <button className="btn sm" type="submit">Add</button>
        </form>
      </div>

      <h2>Scheduling</h2>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><b>Typical appointment length</b><p className="locknote" style={{ margin: "2px 0 0" }}>Used to warn about double-booked assessors.</p></div>
          <select className="fsel" value={apptHours} onChange={(e) => setLen(+e.target.value)} aria-label="Appointment length">
            {[1, 1.5, 2, 3].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
          </select>
        </div>
      </div>

      {(adding || editing) && <PersonForm u={editing} me={me} onClose={() => { setAdding(false); setEditing(null); }} call={call} toast={toast} />}
    </>
  );
}

function PersonForm({ u, me, onClose, call, toast }) {
  const [f, setF] = useState({ name: u?.name || "", email: u?.email || "", role: u?.role || "inspector", is_assessor: u ? u.is_assessor : true, password: u ? "" : tempPassword() });
  const [busy, setBusy] = useState(false), [resetPw, setResetPw] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const body = { ...f }; if (u && !resetPw) delete body.password;
    const ok = await call(u ? `/api/team/${u.id}` : "/api/team", u ? "PATCH" : "POST", body);
    setBusy(false);
    if (ok) { toast(u ? (body.password ? `Saved · give ${f.name} the new temporary password` : "Saved") : `Added ${f.name} · share the temporary password with them`); onClose(); }
  }
  const showPw = !u || resetPw;
  return (
    <Sheet onClose={onClose}>
      <div className="shead"><h1>{u ? `Edit ${u.name}` : "Add person"}</h1><Close onClose={onClose} /></div>
      <form className="panel" onSubmit={save} autoComplete="off">
        <div className="fgrid">
          <div className="f"><label htmlFor="pn">Name</label><input id="pn" required value={f.name} onChange={set("name")} /></div>
          <div className="f"><label htmlFor="pe">Email (used to sign in)</label><input id="pe" type="email" required value={f.email} onChange={set("email")} /></div>
          <div className="f"><label htmlFor="pr">Role</label>
            <select id="pr" value={f.role} onChange={set("role")} disabled={u?.id === me.id}><option value="inspector">Inspector</option><option value="admin">Admin</option></select></div>
          <div className="f" style={{ justifyContent: "flex-end" }}><label className="check" style={{ textTransform: "none", letterSpacing: 0, color: "var(--fg)" }}><input type="checkbox" checked={f.is_assessor} onChange={set("is_assessor")} /> Shows in Assessor list</label></div>
          {showPw && <div className="f wide"><label htmlFor="pp">Temporary password</label><input id="pp" required minLength={8} value={f.password} onChange={set("password")} />
            <p className="locknote" style={{ margin: 0 }}>Write this down and give it to {f.name || "them"}. They&apos;ll choose their own password when they first sign in.</p></div>}
        </div>
        {u && !resetPw && <button type="button" className="linkbtn" style={{ marginTop: 12 }} onClick={() => { setResetPw(true); setF((x) => ({ ...x, password: tempPassword() })); }}>Reset their password</button>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : u ? "Save" : "Add person"}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}
