import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Car, Clock, MapPin, Fuel, AlertCircle, CheckCircle2, Plus, X, ChevronRight, Navigation, Calendar, User, LogOut, Gauge, Wallet, ArrowLeft, Lock, Camera, CreditCard, Banknote, Smartphone, Plane, Users, Unlock, Filter, XCircle, PlayCircle, Flag } from 'lucide-react';

// --- Supabase (cloud sync) ---
// Publishable/anon keys are meant to be embedded in client code — that's how Supabase works.
// Real security (who can log in as what) still happens only in this app's own login screen,
// not via Supabase Auth. Anyone with this key can read/write the single shared row below.
const SUPABASE_URL = 'https://whecwstuqlyohbvuvfkp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZhFFRNTKncvML6BBK_j2pA_opwKSVGA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ROW_ID = 'main'; // single shared state row
const POLL_MS = 8000; // how often other devices' changes get picked up

const KEY = 'taxifleet:state:v3'; // fallback localStorage key, used only if cloud is unreachable

// Older saved data (from before a feature existed) may be missing whole top-level fields —
// e.g. accounts saved before "Πρόγραμμα" existed have no `schedule` array at all, which then
// crashes anything doing `state.schedule.find(...)`. Every place that loads state from
// Supabase, localStorage, or the poll runs through this first, so a missing field always
// comes back as its correct empty default instead of `undefined`.
function hydrateState(raw) {
  if (!raw || typeof raw !== 'object') return initialState;
  return {
    drivers: raw.drivers || initialState.drivers,
    cars: raw.cars || initialState.cars,
    shifts: raw.shifts || initialState.shifts,
    bookings: raw.bookings || initialState.bookings,
    appointments: raw.appointments || initialState.appointments,
    schedule: raw.schedule || initialState.schedule,
    reportsResetAt: raw.reportsResetAt !== undefined ? raw.reportsResetAt : initialState.reportsResetAt,
  };
}

async function uploadFuelReceipt(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('fuel-receipts').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('fuel-receipts').getPublicUrl(path);
  return data.publicUrl;
}

const seedDrivers = [
  { id: 'd1', username: 'giorgos', password: '1111', name: 'Γιώργος Παπαδόπουλος', car: 'TAXI 1' },
  { id: 'd2', username: 'nikos', password: '1111', name: 'Νίκος Σταύρου', car: 'TAXI 2' },
  { id: 'd3', username: 'maria', password: '1111', name: 'Μαρία Κωνσταντίνου', car: 'TAXI 3' },
];

const initialState = {
  drivers: seedDrivers,
  cars: [
    { id: 'TAXI 1', outOfService: false, baseKm: 0, serviceIntervalKm: 10000, lastServiceKm: 0, serviceHistory: [], brand: '', model: '', year: '' },
    { id: 'TAXI 2', outOfService: false, baseKm: 0, serviceIntervalKm: 10000, lastServiceKm: 0, serviceHistory: [], brand: '', model: '', year: '' },
    { id: 'TAXI 3', outOfService: false, baseKm: 0, serviceIntervalKm: 10000, lastServiceKm: 0, serviceHistory: [], brand: '', model: '', year: '' },
  ],
  shifts: [], // {id, driverId, car, date, startTime, endTime, startKm, endKm, startCash, cash, card, app, expenses, fuel, fuelReceiptPhoto, gpsStart, gpsEnd, status: 'active'|'closed'|'locked', notes}
  bookings: [], // driver-logged completed rides during a shift: {id, shiftId, driverId, flightNumber, arrivalTime, customerName, passengers, destination, price, notes, status:'open'|'done'}
  appointments: [], // admin-scheduled dispatch jobs: {id, date, time, durationMin, pickup, dropoff, customerName, driverId, car, status, notes,
                     //   createdAt, assignedAt, acceptedAt, arrivedAt, completedAt}
  schedule: [], // weekly roster entries: {id, weekStart (Monday, ISO), driverId, day (0=Mon..6=Sun), slot: 'morning'|'night'|'rest', car}
  reportsResetAt: null, // ISO date — "Γενικό σύνολο" in Reports only counts shifts from this date on. Doesn't delete anything; monthly view always sees full history.
};

const fontStack = { fontFamily: 'Inter, system-ui, sans-serif' };
const ACCENT = '#F5B942';
const BG = '#1C2128';
const CARD = '#262C36';
const BORDER = '#363D49';
const TEXT = '#E8E6E1';
const MUTE = '#8B92A0';
const GREEN = '#4A9B6E';
const RED = '#C1543C';

function fmtEUR(n) { return `€${(Number(n) || 0).toFixed(2)}`; }
function todayStr() {
  const d = new Date();
  return d.toLocaleDateString('el-GR');
}
function isoDateStr(d) {
  // yyyy-mm-dd, built from LOCAL date parts. toISOString() (used before) converts to UTC
  // first, which silently shifts the date back a day for any timezone ahead of UTC
  // (Greece included) — this was the root cause of the wrong day/date pairing in the schedule.
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dmy(isoStr) {
  // yyyy-mm-dd -> D/M/YYYY (no leading zeros), for display only
  const [y, m, d] = isoStr.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDateStr(d);
}
function addDaysIso(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDateStr(d);
}
const DAY_LABELS_SHORT = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];
const DAY_LABELS_FULL = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function apptRange(a) {
  const start = timeToMin(a.time);
  return [start, start + (Number(a.durationMin) || 60)];
}
function rangesOverlap(a, b) { return a[0] < b[1] && b[0] < a[1]; }

// Core conflict check used both for live validation and final save-blocking.
// Returns { ok: true } or { ok: false, reason: string }
// Current odometer reading for a car = the highest of: the admin-set baseline (car.baseKm,
// used e.g. when a car is first added to the fleet), or the highest km ever logged against
// it across all shifts (closed shifts' endKm, or an active shift's startKm if higher).
// Short title for a car — the license plate once the admin sets one (e.g. "ΤΑΕ4088"),
// falling back to the internal id (e.g. "TAXI 1") until then.
function carLabel(car) {
  if (!car) return '—';
  return car.plate || car.id;
}
function carLabelById(state, carId) {
  return carLabel(state.cars.find(c => c.id === carId));
}

function getCarCurrentKm(state, carId) {
  const car = state.cars.find(c => c.id === carId);
  let max = car?.baseKm || 0;
  for (const s of state.shifts) {
    if (s.car !== carId) continue;
    if (s.endKm != null && s.endKm > max) max = s.endKm;
    if (s.startKm != null && s.startKm > max) max = s.startKm;
  }
  return max;
}

function checkAppointmentConflict({ appointments, shifts, cars }, { date, time, durationMin, driverId, car, excludeId }) {
  const newRange = apptRange({ time, durationMin });

  // 1. Driver already has an appointment overlapping this window
  if (driverId) {
    const driverConflict = appointments.find(a =>
      a.id !== excludeId && a.driverId === driverId && a.date === date && a.status !== 'cancelled' &&
      rangesOverlap(apptRange(a), newRange)
    );
    if (driverConflict) {
      return { ok: false, reason: `Ο οδηγός έχει ήδη ανάθεση ${driverConflict.time} - ${minToTime(apptRange(driverConflict)[1])}. Επιλέξτε άλλο οδηγό ή ώρα.` };
    }
  }

  // 2. Car already has an appointment overlapping this window
  if (car) {
    const carConflict = appointments.find(a =>
      a.id !== excludeId && a.car === car && a.date === date && a.status !== 'cancelled' &&
      rangesOverlap(apptRange(a), newRange)
    );
    if (carConflict) {
      return { ok: false, reason: `Το ${car} είναι δεσμευμένο από άλλο ραντεβού (${carConflict.time}).` };
    }
    // Note: no block for out-of-service cars or off-duty drivers here — appointments are
    // often scheduled in advance, before the driver's shift or the car's return to service.
  }

  return { ok: true };
}

function minToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// A shift is labeled "Πρωινή" or "Βραδινή" from its own start time — no fixed schedule,
// just: starts before 15:00 → Πρωινή, otherwise → Βραδινή.
function classifyShift(startTime) {
  return timeToMin(startTime) < 15 * 60 ? 'Πρωινή' : 'Βραδινή';
}

// Uncovered stretches of a given day for a given car, based on all shift entries assigned
// to it that day. An overnight shift (end time <= start time) is capped at 24:00 for this
// day's view — the portion past midnight isn't carried into the next day's calculation.
function computeCarGaps(schedule, weekStart, day, carId) {
  const intervals = schedule
    .filter(e => e.weekStart === weekStart && e.day === day && e.car === carId && e.type === 'shift' && e.startTime && e.endTime)
    .map(e => {
      const s = timeToMin(e.startTime);
      let en = timeToMin(e.endTime);
      if (en <= s) en = 24 * 60;
      return [s, en];
    })
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of intervals) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else merged.push([s, e]);
  }
  const gaps = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < 24 * 60) gaps.push([cursor, 24 * 60]);
  return gaps.map(([s, e]) => `${minToTime(s)}–${minToTime(e)}`);
}

const STATUS_META = {
  pending: { label: 'Αναμονή ανάθεσης', color: '#F5B942' },
  assigned: { label: 'Εκκρεμεί αποδοχή', color: '#F5B942' },
  accepted: { label: 'Αποδεκτό', color: '#5B8DEF' },
  enroute: { label: 'Σε διαδρομή', color: '#5B8DEF' },
  completed: { label: 'Ολοκληρώθηκε', color: '#4A9B6E' },
  cancelled: { label: 'Ακυρώθηκε', color: '#8B92A0' },
};

const SESSION_KEY = 'taxifleet:session:v1';

export default function TaxiFleetApp() {
  const [state, setState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);
  const [session, setSessionRaw] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }); // {role:'driver', driverId} | {role:'admin'}
  const setSession = (next) => {
    setSessionRaw(next);
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore storage errors */ }
  };
  const [cloudStatus, setCloudStatus] = useState('connecting'); // connecting | online | offline
  const lastWriteRef = useRef(0); // timestamp of our own last write, to avoid a poll overwriting it

  // Initial load: try Supabase first, fall back to localStorage if unreachable.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('app_state').select('data').eq('id', ROW_ID).single();
        if (error) throw error;
        if (mounted && data?.data) {
          const hydrated = hydrateState(data.data);
          setState(hydrated);
          try { localStorage.setItem(KEY, JSON.stringify(hydrated)); } catch (e) {}
          setCloudStatus('online');
        } else if (mounted) {
          // No row yet — seed it with initialState (or local data if present).
          let seed = initialState;
          try { const raw = localStorage.getItem(KEY); if (raw) seed = hydrateState(JSON.parse(raw)); } catch (e) {}
          await supabase.from('app_state').upsert({ id: ROW_ID, data: seed });
          setState(seed);
          setCloudStatus('online');
        }
      } catch (e) {
        console.error('Supabase load failed, using local data:', e);
        try {
          const raw = localStorage.getItem(KEY);
          if (mounted && raw) setState(hydrateState(JSON.parse(raw)));
        } catch (e2) { /* first run, nothing saved anywhere */ }
        if (mounted) setCloudStatus('offline');
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Poll periodically so changes made on other devices show up here too.
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(async () => {
      // Skip a poll that lands right after our own write, so it can't clobber it.
      if (Date.now() - lastWriteRef.current < POLL_MS) return;
      try {
        const { data, error } = await supabase.from('app_state').select('data').eq('id', ROW_ID).single();
        if (error) throw error;
        if (data?.data) {
          setState(prev => {
            const hydrated = hydrateState(data.data);
            const nextStr = JSON.stringify(hydrated);
            if (nextStr === JSON.stringify(prev)) return prev;
            try { localStorage.setItem(KEY, nextStr); } catch (e) {}
            return hydrated;
          });
        }
        setCloudStatus('online');
      } catch (e) {
        setCloudStatus('offline');
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [loaded]);

  const persist = useCallback(async (next) => {
    setState(next);
    lastWriteRef.current = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { console.error('storage error', e); }
    try {
      const { error } = await supabase.from('app_state').upsert({ id: ROW_ID, data: next });
      if (error) throw error;
      setCloudStatus('online');
    } catch (e) {
      console.error('Supabase save failed, kept locally only:', e);
      setCloudStatus('offline');
    }
  }, []);

  if (!loaded) {
    return <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT, ...fontStack }}>Φόρτωση…</div>;
  }

  if (!session) {
    return <LoginScreen drivers={state.drivers} onLogin={setSession} />;
  }

  if (session.role === 'driver') {
    const driverExists = state.drivers.some(d => d.id === session.driverId);
    if (!driverExists) {
      setSession(null);
      return <LoginScreen drivers={state.drivers} onLogin={setSession} />;
    }
    return <DriverApp state={state} persist={persist} driverId={session.driverId} onLogout={() => setSession(null)} cloudStatus={cloudStatus} />;
  }

  return <AdminApp state={state} persist={persist} onLogout={() => setSession(null)} cloudStatus={cloudStatus} />;
}

const DAY_NAMES_GEN = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = `${DAY_NAMES_GEN[now.getDay()]} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>{timeStr}</div>
      <div style={{ fontSize: 11, color: MUTE }}>{dateStr}</div>
    </div>
  );
}

function CloudBadge({ status }) {
  const meta = status === 'online'
    ? { color: '#4A9B6E', label: 'Συγχρονισμένο' }
    : status === 'offline'
    ? { color: '#C1543C', label: 'Χωρίς σύνδεση' }
    : { color: '#8B92A0', label: 'Σύνδεση…' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTE }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
      {meta.label}
    </span>
  );
}

// ================= LOGIN =================
function LoginScreen({ drivers, onLogin }) {
  const [mode, setMode] = useState(null); // 'driver' | 'admin'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submitDriver = () => {
    const d = drivers.find(x => x.username === username.trim().toLowerCase());
    if (!d || d.password !== password) {
      setError('Λάθος όνομα χρήστη ή κωδικός');
      return;
    }
    onLogin({ role: 'driver', driverId: d.id });
  };

  const submitAdmin = () => {
    if (username.trim().toLowerCase() === 'admin' && password === 'admin') {
      onLogin({ role: 'admin' });
    } else {
      setError('Λάθος στοιχεία διαχειριστή');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, ...fontStack }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 32 }}>
          <img src="/logo-yellow.png" alt="Taxi Thessaloniki.GR" style={{ maxHeight: 90, maxWidth: '70vw', width: 'auto', height: 'auto' }} />
          <div style={{ color: MUTE, fontSize: 13 }}>Σύνδεση</div>
        </div>

        {!mode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => { setMode('driver'); setError(''); }} style={btnPrimary}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><User size={20} /> Σύνδεση οδηγού</span>
              <ChevronRight size={20} />
            </button>
            <button onClick={() => { setMode('admin'); setError(''); }} style={btnSecondary}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Gauge size={20} /> Σύνδεση διαχειριστή</span>
              <ChevronRight size={20} />
            </button>
          </div>
        ) : (
          <div>
            <button onClick={() => { setMode(null); setUsername(''); setPassword(''); setError(''); }} style={btnBack}>
              <ArrowLeft size={16} /> Πίσω
            </button>
            <label style={label}>Όνομα χρήστη</label>
            <input value={username} onChange={e => setUsername(e.target.value)} style={input} placeholder={mode === 'admin' ? 'admin' : 'π.χ. giorgos'} />
            <label style={label}>Κωδικός</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...input, marginBottom: 8 }} onKeyDown={e => e.key === 'Enter' && (mode === 'driver' ? submitDriver() : submitAdmin())} />
            {error && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button
              onClick={mode === 'driver' ? submitDriver : submitAdmin}
              style={{ ...btnPrimary, justifyContent: 'center', marginTop: 8 }}
            >
              Σύνδεση
            </button>
            {mode === 'driver' && (
              <div style={{ color: MUTE, fontSize: 11, marginTop: 14, textAlign: 'center' }}>Demo: giorgos / nikos / maria — κωδικός 1111</div>
            )}
            {mode === 'admin' && (
              <div style={{ color: MUTE, fontSize: 11, marginTop: 14, textAlign: 'center' }}>Demo: admin / admin</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary = { background: ACCENT, color: BG, border: 'none', borderRadius: 14, padding: 20, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' };
const btnSecondary = { background: CARD, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' };
const btnBack = { background: 'none', border: 'none', color: MUTE, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 20, fontSize: 14, padding: 0 };
const label = { color: MUTE, fontSize: 13, display: 'block', marginBottom: 6 };
const input = { width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, color: TEXT, fontSize: 15, marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit' };

// ================= DRIVER APP =================
function DriverApp({ state, persist, driverId, onLogout, cloudStatus }) {
  const driver = state.drivers.find(d => d.id === driverId);
  const activeShift = state.shifts.find(s => s.driverId === driverId && s.status === 'active');
  const [screen, setScreen] = useState('home'); // home | startShift | booking | endShift | history

  const myAppointmentsToday = state.appointments.filter(a =>
    a.driverId === driverId && a.date === isoDateStr(new Date()) && a.status !== 'completed' && a.status !== 'cancelled'
  );

  const updateApptStatus = async (id, patch) => {
    await persist({ ...state, appointments: state.appointments.map(a => a.id === id ? { ...a, ...patch } : a) });
  };

  // Live location — only while the app is open in the foreground and a shift is active.
  // A ref holds the latest state so the interval always writes on top of current data,
  // not a stale snapshot from when the effect first ran.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    if (!activeShift) return;
    let cancelled = false;
    const tick = async () => {
      const pos = await captureGPS();
      if (cancelled || !pos) return;
      const cur = stateRef.current;
      const shiftNow = cur.shifts.find(s => s.id === activeShift.id);
      if (!shiftNow || shiftNow.status !== 'active') return;
      await persist({
        ...cur,
        shifts: cur.shifts.map(s => s.id === activeShift.id ? { ...s, currentLocation: { lat: pos.lat, lng: pos.lng, at: pos.at } } : s),
      });
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeShift?.id]);

  const navigateTo = (address) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`, '_blank');
  };

  const startShift = async (payload) => {
    const shift = {
      id: 'shift_' + Date.now(),
      driverId,
      car: payload.car,
      date: todayStr(),
      startTime: new Date().toISOString(),
      endTime: null,
      startKm: getCarCurrentKm(state, payload.car),
      endKm: null,
      startCash: Number(payload.startCash) || 0,
      cash: null, card: null, app: null,
      expenses: null, fuel: null, fuelReceiptPhoto: null,
      gpsStart: payload.gps || null, gpsEnd: null,
      status: 'active',
      notes: '',
    };
    await persist({ ...state, shifts: [...state.shifts, shift] });
    setScreen('home');
  };

  const addBooking = async (payload) => {
    const booking = { id: 'bk_' + Date.now(), shiftId: activeShift.id, driverId, status: 'done', ...payload };
    await persist({ ...state, bookings: [...state.bookings, booking] });
    setScreen('history');
  };

  const closeShift = async (payload) => {
    const next = {
      ...state,
      shifts: state.shifts.map(s => s.id === activeShift.id ? {
        ...s,
        endTime: new Date().toISOString(),
        endKm: Number(payload.endKm),
        cash: Number(payload.cash) || 0,
        card: Number(payload.card) || 0,
        app: Number(payload.app) || 0,
        expenses: Number(payload.expenses) || 0,
        fuel: Number(payload.fuel) || 0,
        fuelReceiptPhoto: payload.fuelReceiptPhoto || null,
        gpsEnd: payload.gps || null,
        status: 'closed', // closed = waiting for admin lock/approval, driver can no longer edit
      } : s),
    };
    await persist(next);
    setScreen('home');
  };

  if (screen === 'startShift') return <StartShiftScreen state={state} driver={driver} cars={state.cars} activeShifts={state.shifts.filter(s => s.status === 'active')} onBack={() => setScreen('home')} onSubmit={startShift} />;
  if (screen === 'booking') return <BookingScreen state={state} driver={driver} shift={activeShift} onBack={() => setScreen('home')} onSubmit={addBooking} />;
  if (screen === 'endShift') return <EndShiftScreen state={state} driver={driver} shift={activeShift} onBack={() => setScreen('home')} onSubmit={closeShift} />;
  if (screen === 'history') return <HistoryScreen state={state} driverId={driverId} onBack={() => setScreen('home')} />;
  if (screen === 'schedule') return <MyScheduleScreen state={state} driverId={driverId} onBack={() => setScreen('home')} />;

  return (
    <div style={{ minHeight: '100vh', background: BG, ...fontStack }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: MUTE, fontSize: 13 }}>{carLabelById(state, activeShift?.car || driver.car)}</div>
          <div style={{ color: TEXT, fontSize: 19, fontWeight: 700 }}>{driver.name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <LogOut size={16} /> Έξοδος
          </button>
          <CloudBadge status={cloudStatus} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 20px 0' }}>
        <img src="/logo-yellow.png" alt="Taxi Thessaloniki.GR" style={{ maxHeight: 44, maxWidth: '60vw', width: 'auto', height: 'auto' }} />
        <LiveClock />
      </div>

      <div style={{ padding: 20 }}>
        {myAppointmentsToday.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Αναθέσεις σήμερα</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myAppointmentsToday.map(a => {
                const meta = STATUS_META[a.status] || STATUS_META.pending;
                return (
                  <div key={a.id} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{a.time} · {a.pickup} → {a.dropoff}</div>
                        <div style={{ color: MUTE, fontSize: 12, marginTop: 2 }}>{a.customerName}{a.passengers ? ` · ${a.passengers} επιβ.` : ''}</div>
                      </div>
                      <span style={{ background: `${meta.color}22`, color: meta.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{meta.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => navigateTo(a.arrivedAt ? a.dropoff : a.pickup)} style={smallBtn('#5B8DEF')}>
                        🧭 Πλοήγηση προς {a.arrivedAt ? 'προορισμό' : 'επιβίβαση'}
                      </button>
                      {a.status === 'assigned' && (
                        <button onClick={() => updateApptStatus(a.id, { status: 'accepted', acceptedAt: new Date().toISOString() })} style={smallBtn('#5B8DEF')}>Αποδοχή</button>
                      )}
                      {a.status === 'accepted' && (
                        <button onClick={() => updateApptStatus(a.id, { status: 'enroute' })} style={smallBtn('#5B8DEF')}>Σε διαδρομή</button>
                      )}
                      {(a.status === 'accepted' || a.status === 'enroute') && !a.arrivedAt && (
                        <button onClick={() => updateApptStatus(a.id, { arrivedAt: new Date().toISOString() })} style={smallBtn(ACCENT)}>Άφιξη</button>
                      )}
                      <button onClick={() => updateApptStatus(a.id, { status: 'completed', completedAt: new Date().toISOString(), arrivedAt: a.arrivedAt || new Date().toISOString() })} style={smallBtn(GREEN)}>Ολοκλήρωση</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeShift ? (
          <div style={{ background: CARD, border: `1px solid ${GREEN}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
              <span style={{ color: GREEN, fontSize: 13, fontWeight: 600 }}>Βάρδια σε εξέλιξη — {carLabelById(state, activeShift.car)}</span>
            </div>
            <div style={{ color: TEXT, fontSize: 14 }}>Έναρξη {new Date(activeShift.startTime).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false })} · {activeShift.startKm} χλμ</div>
            <div style={{ color: MUTE, fontSize: 13, marginBottom: 16 }}>Αρχικό ταμείο: {fmtEUR(activeShift.startCash)}</div>
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 20, textAlign: 'center' }}>
            <div style={{ color: MUTE, fontSize: 13 }}>Καμία ενεργή βάρδια</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BigButton
            label="Έναρξη Βάρδιας"
            icon={Clock}
            disabled={!!activeShift}
            onClick={() => setScreen('startShift')}
          />
          <BigButton
            label="Νέα Προμίσθωση"
            icon={Plane}
            disabled={!activeShift}
            onClick={() => setScreen('booking')}
          />
          <BigButton
            label="Ιστορικό Βαρδιών"
            icon={Calendar}
            onClick={() => setScreen('history')}
          />
          <BigButton
            label="Πρόγραμμά μου"
            icon={Calendar}
            onClick={() => setScreen('schedule')}
          />
          {activeShift && (
            <button onClick={() => setScreen('endShift')} style={{ ...btnPrimary, background: RED, color: '#fff', marginTop: 8 }}>
              <span>Κλείσιμο Βάρδιας</span>
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BigButton({ label, icon: Icon, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#20242c' : CARD,
        border: `1px solid ${disabled ? '#2a2f38' : BORDER}`,
        borderRadius: 16, padding: 22, display: 'flex', alignItems: 'center', gap: 14,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: disabled ? '#2a2f38' : 'rgba(245,185,66,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={disabled ? MUTE : ACCENT} />
      </div>
      <span style={{ color: TEXT, fontSize: 16, fontWeight: 700 }}>{label}</span>
      <ChevronRight size={18} color={MUTE} style={{ marginLeft: 'auto' }} />
    </button>
  );
}

function captureGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: new Date().toISOString() }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

function StartShiftScreen({ state, driver, cars, activeShifts, onBack, onSubmit }) {
  const occupiedCarIds = new Set(activeShifts.map(s => s.car));
  const availableCars = cars.filter(c => !c.outOfService && !occupiedCarIds.has(c.id));
  const [selectedCar, setSelectedCar] = useState(
    availableCars.some(c => c.id === driver.car) ? driver.car : (availableCars[0]?.id || '')
  );
  const [startCash, setStartCash] = useState('');
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle');

  const grabGPS = async () => {
    setGpsStatus('loading');
    const p = await captureGPS();
    setGps(p);
    setGpsStatus(p ? 'ok' : 'error');
  };

  const startKmPreview = selectedCar ? getCarCurrentKm(state, selectedCar) : 0;
  const canSubmit = selectedCar && startCash !== '';

  return (
    <Screen title="Έναρξη Βάρδιας" subtitle={selectedCar ? carLabelById(state, selectedCar) : 'Επιλογή οχήματος'} onBack={onBack}>
      {availableCars.length === 0 ? (
        <div style={{ background: 'rgba(193,84,60,0.12)', border: `1px solid ${RED}`, borderRadius: 10, padding: 14, color: RED, fontSize: 13, marginBottom: 16 }}>
          Δεν υπάρχει διαθέσιμο όχημα αυτή τη στιγμή — όλα είναι είτε σε βάρδια είτε εκτός λειτουργίας.
        </div>
      ) : (
        <>
          <label style={label}>Όχημα</label>
          <select value={selectedCar} onChange={e => setSelectedCar(e.target.value)} style={input}>
            {availableCars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
          </select>
        </>
      )}
      <Row label="Ημερομηνία" value={todayStr()} />
      <Row label="Ώρα έναρξης" value={new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false })} />
      <Row label="Χιλιόμετρα έναρξης" value={`${startKmPreview.toLocaleString('el-GR')} χλμ (αυτόματα, από το όχημα)`} />

      <label style={label}>Αρχικό ταμείο (€)</label>
      <input type="number" value={startCash} onChange={e => setStartCash(e.target.value)} placeholder="π.χ. 50" style={input} />

      <GPSButton status={gpsStatus} onClick={grabGPS} gps={gps} label="Καταγραφή θέσης έναρξης (GPS)" />

      <button
        onClick={() => canSubmit && onSubmit({ car: selectedCar, startCash, gps })}
        disabled={!canSubmit}
        style={{ ...btnPrimary, justifyContent: 'center', marginTop: 12, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        ✅ Έναρξη
      </button>
    </Screen>
  );
}

// Custom 24h time picker — native <input type="time"> renders using the device's own
// locale/clock preference (which is how "1:00 μ.μ." showed up), so we build our own to
// guarantee a 24-hour display everywhere, on every phone.
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_5 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
function Time24Input({ value, onChange }) {
  const [h, m] = (value || '00:00').split(':');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
      <select value={h} onChange={e => onChange(`${e.target.value}:${m}`)} style={{ ...input, marginBottom: 0, width: 68, padding: '10px 6px' }}>
        {HOURS_24.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ color: MUTE, fontWeight: 700 }}>:</span>
      <select value={m} onChange={e => onChange(`${h}:${e.target.value}`)} style={{ ...input, marginBottom: 0, width: 68, padding: '10px 6px' }}>
        {MINUTES_5.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
}

function GPSButton({ status, onClick, gps, label }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', background: status === 'ok' ? 'rgba(74,155,110,0.12)' : CARD,
          border: `1px solid ${status === 'ok' ? GREEN : BORDER}`, borderRadius: 10, padding: 14,
          color: status === 'ok' ? GREEN : TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <Navigation size={16} />
        {status === 'idle' && label}
        {status === 'loading' && 'Λήψη θέσης…'}
        {status === 'ok' && `Θέση καταγράφηκε (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`}
        {status === 'error' && 'Αποτυχία — δοκίμασε ξανά'}
      </button>
      <div style={{ color: MUTE, fontSize: 11, marginTop: 6 }}>Χρησιμοποιείται για σύγκριση με τα δηλωμένα χιλιόμετρα.</div>
    </div>
  );
}

function BookingScreen({ state, driver, shift, onBack, onSubmit }) {
  const [flightNumber, setFlightNumber] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [passengers, setPassengers] = useState('1');
  const [destination, setDestination] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = customerName && destination && price;

  return (
    <Screen title="Νέα Προμίσθωση" subtitle={carLabelById(state, shift?.car || driver.car)} onBack={onBack}>
      <label style={label}>Αριθμός πτήσης (προαιρετικό)</label>
      <input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="π.χ. A3 654" style={input} />

      <label style={label}>Ώρα άφιξης (προαιρετικό)</label>
      <Time24Input value={arrivalTime || '10:00'} onChange={setArrivalTime} />

      <label style={label}>Όνομα πελάτη</label>
      <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="π.χ. Κος Αντωνίου" style={input} />

      <label style={label}>Άτομα</label>
      <input type="number" min="1" value={passengers} onChange={e => setPassengers(e.target.value)} style={input} />

      <label style={label}>Προορισμός</label>
      <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="π.χ. Αεροδρόμιο" style={input} />

      <label style={label}>Τιμή (€)</label>
      <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="π.χ. 35" style={input} />

      <label style={label}>Σημειώσεις (προαιρετικό)</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />

      <button
        onClick={() => canSubmit && onSubmit({ flightNumber, arrivalTime, customerName, passengers: Number(passengers), destination, price: Number(price), notes, createdAt: new Date().toISOString() })}
        disabled={!canSubmit}
        style={{ ...btnPrimary, justifyContent: 'center', marginTop: 4, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        Ολοκλήρωση
      </button>
    </Screen>
  );
}

function EndShiftScreen({ state, driver, shift, onBack, onSubmit }) {
  const [endKm, setEndKm] = useState('');
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [app, setApp] = useState('');
  const [expenses, setExpenses] = useState('');
  const [fuel, setFuel] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null); // local-only thumbnail, never saved
  const [photoUrl, setPhotoUrl] = useState(null); // the actual uploaded Storage URL — this is what gets saved
  const [photoStatus, setPhotoStatus] = useState('idle'); // idle | uploading | done | error
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const fileRef = useRef(null);

  const grabGPS = async () => {
    setGpsStatus('loading');
    const p = await captureGPS();
    setGps(p);
    setGpsStatus(p ? 'ok' : 'error');
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);

    setPhotoStatus('uploading');
    try {
      const url = await uploadFuelReceipt(file);
      setPhotoUrl(url);
      setPhotoStatus('done');
    } catch (err) {
      console.error('Photo upload failed:', err);
      setPhotoStatus('error');
    }
  };

  const kmValid = endKm && Number(endKm) >= shift.startKm;
  const totalRevenue = (Number(cash) || 0) + (Number(card) || 0) + (Number(app) || 0);
  const netResult = totalRevenue - (Number(expenses) || 0) - (Number(fuel) || 0);
  const canSubmit = kmValid && cash !== '' && card !== '' && app !== '' && photoStatus !== 'uploading';

  return (
    <Screen title="Κλείσιμο Βάρδιας" subtitle={`${carLabelById(state, shift.car)} · ξεκίνησε στα ${shift.startKm} χλμ`} onBack={onBack}>
      <label style={label}>Τελικά χιλιόμετρα</label>
      <input type="number" value={endKm} onChange={e => setEndKm(e.target.value)} placeholder="π.χ. 154480" style={{ ...input, border: `1px solid ${endKm && !kmValid ? RED : BORDER}` }} />
      {endKm && !kmValid && <div style={{ color: RED, fontSize: 12, marginTop: -12, marginBottom: 16 }}>Πρέπει να είναι ≥ {shift.startKm}</div>}

      <GPSButton status={gpsStatus} onClick={grabGPS} gps={gps} label="Καταγραφή θέσης τέλους (GPS)" />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={label}><Banknote size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Μετρητά</label>
          <input type="number" value={cash} onChange={e => setCash(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}><CreditCard size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Κάρτες</label>
          <input type="number" value={card} onChange={e => setCard(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}><Smartphone size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />App</label>
          <input type="number" value={app} onChange={e => setApp(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>

      <label style={{ ...label, marginTop: 16 }}>Έξοδα (€)</label>
      <input type="number" value={expenses} onChange={e => setExpenses(e.target.value)} placeholder="π.χ. 5" style={input} />

      <label style={label}>Πετρέλαιο (€)</label>
      <input type="number" value={fuel} onChange={e => setFuel(e.target.value)} placeholder="π.χ. 25" style={input} />

      <label style={label}>Φωτογραφία απόδειξης πετρελαίου</label>
      <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handlePhoto} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={photoStatus === 'uploading'} style={{ width: '100%', background: CARD, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 14, color: MUTE, fontSize: 14, cursor: photoStatus === 'uploading' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Camera size={16} />
        {photoStatus === 'uploading' ? 'Μεταφόρτωση...' : photoPreview ? 'Αλλαγή φωτογραφίας' : 'Λήψη φωτογραφίας'}
      </button>
      {photoStatus === 'error' && (
        <div style={{ color: RED, fontSize: 12, marginBottom: 12 }}>Η μεταφόρτωση απέτυχε — δοκίμασε ξανά πριν κλείσεις τη βάρδια.</div>
      )}
      {photoPreview && (
        <img src={photoPreview} alt="Απόδειξη" style={{ width: '100%', borderRadius: 10, marginBottom: 16, border: `1px solid ${BORDER}` }} />
      )}

      <div style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: MUTE, fontSize: 13 }}>Γενικός τζίρος</span>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{fmtEUR(totalRevenue)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: MUTE, fontSize: 13 }}>Καθαρό αποτέλεσμα</span>
          <span style={{ color: netResult >= 0 ? GREEN : RED, fontSize: 16, fontWeight: 700 }}>{fmtEUR(netResult)}</span>
        </div>
      </div>

      <button
        onClick={() => canSubmit && onSubmit({ endKm, cash, card, app, expenses, fuel, fuelReceiptPhoto: photoUrl, gps })}
        disabled={!canSubmit}
        style={{ ...btnPrimary, background: canSubmit ? RED : '#3A4150', color: '#fff', justifyContent: 'center', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        Κλείσιμο Βάρδιας
      </button>
      <div style={{ color: MUTE, fontSize: 11, marginTop: 10, textAlign: 'center' }}>Μετά το κλείσιμο τα στοιχεία κλειδώνουν — αλλαγές μόνο με έγκριση διαχειριστή.</div>
    </Screen>
  );
}

function MyScheduleScreen({ state, driverId, onBack }) {
  const [weekStart, setWeekStart] = useState(mondayOf(isoDateStr(new Date())));
  const days = [0, 1, 2, 3, 4, 5, 6];

  return (
    <Screen title="Πρόγραμμά μου" subtitle={`${dmy(weekStart)} — ${dmy(addDaysIso(weekStart, 6))}`} onBack={onBack}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={smallBtn(MUTE)}>‹ Προηγ. εβδομάδα</button>
        <button onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={smallBtn(MUTE)}>Επόμ. εβδομάδα ›</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {days.map(day => {
          const entry = state.schedule.find(e => e.weekStart === weekStart && e.driverId === driverId && e.day === day);
          const dateStr = addDaysIso(weekStart, day);
          const isToday = dateStr === isoDateStr(new Date());
          return (
            <div key={day} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${isToday ? ACCENT : BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{DAY_LABELS_FULL[day]}</div>
                  <div style={{ color: MUTE, fontSize: 12 }}>{dmy(dateStr)}</div>
                </div>
                {!entry ? (
                  <span style={{ color: MUTE, fontSize: 13 }}>—</span>
                ) : entry.type === 'rest' ? (
                  <span style={{ background: 'rgba(139,146,160,0.15)', color: MUTE, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Ρεπό</span>
                ) : (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: ACCENT, fontSize: 13, fontWeight: 700 }}>{classifyShift(entry.startTime)} · {entry.startTime}–{entry.endTime}</div>
                    <div style={{ color: MUTE, fontSize: 12 }}>{carLabelById(state, entry.car)}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

function HistoryScreen({ state, driverId, onBack }) {
  const shifts = state.shifts.filter(s => s.driverId === driverId).slice().reverse();
  return (
    <Screen title="Ιστορικό Βαρδιών" onBack={onBack}>
      {shifts.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>Καμία βάρδια ακόμα</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shifts.map(s => {
          const revenue = (s.cash || 0) + (s.card || 0) + (s.app || 0);
          const bookingsCount = state.bookings.filter(b => b.shiftId === s.id).length;
          return (
            <div key={s.id} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{s.date}</div>
                <StatusBadge status={s.status} />
              </div>
              <div style={{ color: MUTE, fontSize: 12, marginBottom: 8 }}>
                {carLabelById(state, s.car)} · {bookingsCount} προμισθώσεις {s.endKm ? `· ${s.endKm - s.startKm} χλμ` : ''}
              </div>
              {s.status !== 'active' && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: MUTE, fontSize: 12 }}>Τζίρος</span>
                  <span style={{ color: GREEN, fontSize: 14, fontWeight: 700 }}>{fmtEUR(revenue)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: { c: GREEN, l: 'Ενεργή' },
    closed: { c: ACCENT, l: 'Κλειστή — εκκρεμεί έλεγχος' },
    locked: { c: MUTE, l: 'Κλειδωμένη' },
  };
  const m = map[status] || map.closed;
  return (
    <span style={{ background: `${m.c}22`, color: m.c, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
      {status === 'locked' && <Lock size={10} />}
      {m.l}
    </span>
  );
}

function Row({ label: l, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BORDER}`, marginBottom: 16 }}>
      <span style={{ color: MUTE, fontSize: 13 }}>{l}</span>
      <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Screen({ title, subtitle, onBack, children }) {
  return (
    <div style={{ minHeight: '100vh', background: BG, ...fontStack, padding: 20 }}>
      <button onClick={onBack} style={btnBack}><ArrowLeft size={16} /> Πίσω</button>
      <div style={{ color: TEXT, fontSize: 20, fontWeight: 700, marginBottom: subtitle ? 4 : 20 }}>{title}</div>
      {subtitle && <div style={{ color: MUTE, fontSize: 13, marginBottom: 20 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// ================= ADMIN APP =================
function AdminApp({ state, persist, onLogout, cloudStatus }) {
  const [tab, setTab] = useState('overview');

  const lockShift = async (shiftId) => {
    await persist({ ...state, shifts: state.shifts.map(s => s.id === shiftId ? { ...s, status: 'locked' } : s) });
  };
  const unlockShift = async (shiftId) => {
    await persist({ ...state, shifts: state.shifts.map(s => s.id === shiftId ? { ...s, status: 'closed' } : s) });
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, ...fontStack }}>
      <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${CARD}`, flexWrap: 'wrap', rowGap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gauge size={18} color={BG} strokeWidth={2.5} />
          </div>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>Πίνακας διαχείρισης</div>
        </div>
        <img src="/logo-yellow.png" alt="Taxi Thessaloniki.GR" style={{ maxHeight: 56, maxWidth: '40vw', width: 'auto', height: 'auto' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LiveClock />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <LogOut size={16} /> Έξοδος
            </button>
            <CloudBadge status={cloudStatus} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '16px 20px 0', overflowX: 'auto' }}>
        {[
          { id: 'overview', label: 'Σήμερα' },
          { id: 'map', label: 'Χάρτης' },
          { id: 'calendar', label: 'Ημερολόγιο' },
          { id: 'appointments', label: 'Ραντεβού' },
          { id: 'shifts', label: 'Βάρδιες' },
          { id: 'schedule', label: 'Πρόγραμμα' },
          { id: 'bookings', label: 'Προμισθώσεις' },
          { id: 'reports', label: 'Αναφορές' },
          { id: 'fleet', label: 'Στόλος & Οδηγοί' },
          { id: 'maintenance', label: 'Service' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? ACCENT : 'transparent', color: tab === t.id ? BG : MUTE,
            border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 960 }}>
        {tab === 'overview' && <TodayTab state={state} onLock={lockShift} onUnlock={unlockShift} />}
        {tab === 'map' && <FleetMapTab state={state} />}
        {tab === 'calendar' && <CalendarTab state={state} persist={persist} />}
        {tab === 'appointments' && <AppointmentsHistoryTab state={state} persist={persist} />}
        {tab === 'shifts' && <AllShiftsTab state={state} persist={persist} onLock={lockShift} onUnlock={unlockShift} />}
        {tab === 'schedule' && <ScheduleTab state={state} persist={persist} />}
        {tab === 'bookings' && <BookingsTab state={state} persist={persist} />}
        {tab === 'reports' && <ReportsTab state={state} persist={persist} />}
        {tab === 'fleet' && <FleetTab state={state} persist={persist} />}
        {tab === 'maintenance' && <MaintenanceTab state={state} persist={persist} />}
      </div>
    </div>
  );
}

// ---------- Χάρτης στόλου (ζωντανές θέσεις, OpenStreetMap — χωρίς κλειδί API) ----------
function FleetMapTab({ state }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const activeShifts = state.shifts.filter(s => s.status === 'active' && s.currentLocation);
  const positionsKey = activeShifts.map(s => `${s.id}:${s.currentLocation.lat.toFixed(5)}:${s.currentLocation.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (!window.L || !mapDivRef.current || mapRef.current) return;
    mapRef.current = window.L.map(mapDivRef.current).setView([40.6401, 22.9444], 12); // Θεσσαλονίκη ως προεπιλογή
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const liveIds = new Set(activeShifts.map(s => s.id));
    Object.keys(markersRef.current).forEach(id => {
      if (!liveIds.has(id)) { mapRef.current.removeLayer(markersRef.current[id]); delete markersRef.current[id]; }
    });
    const pts = [];
    activeShifts.forEach(s => {
      const driver = state.drivers.find(d => d.id === s.driverId);
      const { lat, lng, at } = s.currentLocation;
      pts.push([lat, lng]);
      const ageMin = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
      const html = `<b>${carLabelById(state, s.car)}</b><br/>${driver?.name || ''}<br/>ενημέρωση πριν ${ageMin} λεπτά`;
      if (markersRef.current[s.id]) {
        markersRef.current[s.id].setLatLng([lat, lng]).setPopupContent(html);
      } else {
        markersRef.current[s.id] = window.L.marker([lat, lng]).addTo(mapRef.current).bindPopup(html);
      }
    });
    if (pts.length > 0) mapRef.current.fitBounds(pts, { maxZoom: 15, padding: [30, 30] });
  }, [positionsKey]);

  return (
    <div>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Χάρτης στόλου (ζωντανά)</div>
      <div style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Η θέση ενημερώνεται μόνο όσο ο οδηγός έχει ανοιχτή την εφαρμογή στο κινητό του.</div>
      {activeShifts.length === 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, color: MUTE, fontSize: 13, marginBottom: 12 }}>
          Κανένα ενεργό όχημα αυτή τη στιγμή.
        </div>
      )}
      <div ref={mapDivRef} style={{ width: '100%', height: 440, borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }} />
    </div>
  );
}

// ---------- Service οχημάτων ----------
const SERVICE_INTERVAL_OPTIONS = [5000, 7500, 10000, 12000, 15000, 20000, 25000, 30000];

function MaintenanceTab({ state, persist }) {
  const [openFormFor, setOpenFormFor] = useState(null); // car id whose "add service" form is open
  const [svcDate, setSvcDate] = useState(isoDateStr(new Date()));
  const [svcKm, setSvcKm] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcCost, setSvcCost] = useState('');
  const [editingKmFor, setEditingKmFor] = useState(null); // car id whose km field is being edited
  const [kmDraft, setKmDraft] = useState('');

  const setInterval_ = async (carId, km) => {
    await persist({ ...state, cars: state.cars.map(c => c.id === carId ? { ...c, serviceIntervalKm: Number(km) } : c) });
  };

  const startEditKm = (carId, currentValue) => {
    setEditingKmFor(carId);
    setKmDraft(String(currentValue));
  };

  const saveKm = async (carId) => {
    if (kmDraft === '' || isNaN(Number(kmDraft))) { setEditingKmFor(null); return; }
    await persist({ ...state, cars: state.cars.map(c => c.id === carId ? { ...c, baseKm: Number(kmDraft) } : c) });
    setEditingKmFor(null);
  };

  const openForm = (carId, defaultKm) => {
    setOpenFormFor(carId);
    setSvcDate(isoDateStr(new Date()));
    setSvcKm(String(defaultKm));
    setSvcDesc('');
    setSvcCost('');
  };

  const saveService = async (carId) => {
    if (!svcKm || !svcDate) return;
    const record = { id: 'svc_' + Date.now(), date: svcDate, km: Number(svcKm), description: svcDesc, cost: svcCost === '' ? null : Number(svcCost) };
    await persist({
      ...state,
      cars: state.cars.map(c => c.id === carId
        ? { ...c, lastServiceKm: Number(svcKm), serviceHistory: [record, ...(c.serviceHistory || [])] }
        : c),
    });
    setOpenFormFor(null);
  };

  return (
    <div>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Service οχημάτων</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.cars.map(c => {
          const currentKm = getCarCurrentKm(state, c.id);
          const lastServiceKm = c.lastServiceKm || 0;
          const interval = c.serviceIntervalKm || 10000;
          const sinceService = Math.max(0, currentKm - lastServiceKm);
          const ratio = interval > 0 ? sinceService / interval : 0;
          const status = ratio >= 1 ? 'due' : ratio >= 0.9 ? 'soon' : 'ok';
          const statusMeta = {
            due: { color: RED, label: '⚠ Χρειάζεται service' },
            soon: { color: ACCENT, label: 'Πλησιάζει service' },
            ok: { color: GREEN, label: 'OK' },
          }[status];
          const history = c.serviceHistory || [];

          return (
            <div key={c.id} style={{ background: CARD, borderRadius: 12, padding: 16, border: `1px solid ${status === 'due' ? RED : BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>{carLabel(c)}</div>
                <span style={{ background: `${statusMeta.color}22`, color: statusMeta.color, padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{statusMeta.label}</span>
              </div>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                {editingKmFor === c.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ ...label, marginBottom: 0 }}>Χλμ οχήματος</label>
                    <input type="number" value={kmDraft} onChange={e => setKmDraft(e.target.value)} style={{ ...input, marginBottom: 0, width: 120, padding: '6px 10px' }} autoFocus />
                    <button onClick={() => saveKm(c.id)} style={smallBtn(GREEN)}>Αποθήκευση</button>
                    <button onClick={() => setEditingKmFor(null)} style={smallBtn(MUTE)}>Άκυρο</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MiniStat label="Τρέχοντα χλμ" value={currentKm.toLocaleString('el-GR')} />
                    <button onClick={() => startEditKm(c.id, currentKm)} title="Χειροκίνητη διόρθωση χιλιομέτρων" style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer', padding: 2, fontSize: 13 }}>
                      ✏️
                    </button>
                  </div>
                )}
                <MiniStat label="Τελευταίο service" value={lastServiceKm ? `${lastServiceKm.toLocaleString('el-GR')} χλμ` : '—'} />
                <MiniStat label="Από τελευταίο service" value={`${sinceService.toLocaleString('el-GR')} / ${interval.toLocaleString('el-GR')} χλμ`} color={statusMeta.color} />
              </div>

              <div style={{ background: BORDER, borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', background: statusMeta.color }} />
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={{ color: MUTE, fontSize: 12 }}>Ειδοποίηση κάθε</label>
                <select value={interval} onChange={e => setInterval_(c.id, e.target.value)} style={{ ...input, marginBottom: 0, width: 'auto', padding: '6px 10px' }}>
                  {SERVICE_INTERVAL_OPTIONS.map(km => <option key={km} value={km}>{km.toLocaleString('el-GR')} χλμ</option>)}
                </select>
                <button onClick={() => openForm(c.id, currentKm)} style={smallBtn(ACCENT)}>+ Καταχώριση service</button>
              </div>

              {openFormFor === c.id && (
                <div style={{ background: BG, borderRadius: 10, padding: 12, marginBottom: 10, border: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <label style={label}>Ημερομηνία</label>
                      <input type="date" value={svcDate} onChange={e => setSvcDate(e.target.value)} style={{ ...input, marginBottom: 0 }} />
                    </div>
                    <div>
                      <label style={label}>Χλμ κατά το service</label>
                      <input type="number" value={svcKm} onChange={e => setSvcKm(e.target.value)} style={{ ...input, marginBottom: 0 }} />
                    </div>
                    <div>
                      <label style={label}>Κόστος (€)</label>
                      <input type="number" value={svcCost} onChange={e => setSvcCost(e.target.value)} style={{ ...input, marginBottom: 0 }} placeholder="προαιρετικό" />
                    </div>
                  </div>
                  <label style={label}>Περιγραφή</label>
                  <input value={svcDesc} onChange={e => setSvcDesc(e.target.value)} style={input} placeholder="π.χ. Αλλαγή λαδιών, φίλτρα" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveService(c.id)} style={smallBtn(GREEN)}>Αποθήκευση</button>
                    <button onClick={() => setOpenFormFor(null)} style={smallBtn(MUTE)}>Άκυρο</button>
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <div style={{ color: MUTE, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Ιστορικό service</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {history.map(h => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTE, borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>
                        <span>{h.date} · {h.km.toLocaleString('el-GR')} χλμ{h.description ? ` · ${h.description}` : ''}</span>
                        {h.cost != null && <span>{fmtEUR(h.cost)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Εβδομαδιαίο πρόγραμμα οδηγών ----------
function ScheduleTab({ state, persist }) {
  const [weekStart, setWeekStart] = useState(mondayOf(isoDateStr(new Date())));
  const [editing, setEditing] = useState(null); // { driverId, day, entry|null }

  const getEntry = (driverId, day) =>
    state.schedule.find(e => e.weekStart === weekStart && e.driverId === driverId && e.day === day);

  const weekEndLabel = addDaysIso(weekStart, 6);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Πρόγραμμα οδηγών</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={smallBtn(MUTE)}>‹ Προηγ.</button>
          <span style={{ color: MUTE, fontSize: 13 }}>{dmy(weekStart)} — {dmy(weekEndLabel)}</span>
          <button onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={smallBtn(MUTE)}>Επόμ. ›</button>
          <button onClick={() => setWeekStart(mondayOf(isoDateStr(new Date())))} style={smallBtn(ACCENT)}>Σήμερα</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...td, color: MUTE, fontWeight: 500, textAlign: 'left', minWidth: 120 }}>Οδηγός</th>
              {[0, 1, 2, 3, 4, 5, 6].map(day => (
                <th key={day} style={{ ...td, color: MUTE, fontWeight: 500, minWidth: 130 }}>
                  {DAY_LABELS_SHORT[day]}<br />
                  <span style={{ fontSize: 11 }}>{dmy(addDaysIso(weekStart, day))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.drivers.map(driver => (
              <tr key={driver.id} style={{ borderTop: `1px solid ${CARD}` }}>
                <td style={{ ...td, fontWeight: 600 }}>{driver.name}</td>
                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                  const entry = getEntry(driver.id, day);
                  const isRest = entry?.type === 'rest';
                  const isShift = entry?.type === 'shift';
                  return (
                    <td key={day} style={{ ...td, padding: 4 }}>
                      <button
                        onClick={() => setEditing({ driverId: driver.id, day, entry: entry || null })}
                        style={{
                          width: '100%', textAlign: 'left', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                          background: isRest ? 'rgba(139,146,160,0.12)' : isShift ? 'rgba(245,185,66,0.12)' : 'none',
                          border: `1px dashed ${isRest || isShift ? 'transparent' : BORDER}`,
                          color: isRest ? MUTE : isShift ? TEXT : MUTE,
                        }}
                      >
                        {isRest ? (
                          <span style={{ fontWeight: 700 }}>Ρεπό</span>
                        ) : isShift ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{classifyShift(entry.startTime)}</div>
                            <div>{entry.startTime}–{entry.endTime}</div>
                            <div style={{ color: MUTE }}>{carLabelById(state, entry.car)}</div>
                          </>
                        ) : (
                          <span>+ Προσθήκη</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Κάλυψη οχημάτων</div>
      <div style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Ώρες που κανένα ραντεβού δεν καλύπτει το κάθε όχημα αυτή την εβδομάδα — υπολογίζεται αυτόματα από το πρόγραμμα.</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...td, color: MUTE, fontWeight: 500, textAlign: 'left', minWidth: 90 }}>Όχημα</th>
              {[0, 1, 2, 3, 4, 5, 6].map(day => (
                <th key={day} style={{ ...td, color: MUTE, fontWeight: 500, minWidth: 130 }}>{DAY_LABELS_SHORT[day]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.cars.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${CARD}` }}>
                <td style={{ ...td, fontWeight: 600 }}>{carLabel(c)}</td>
                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                  const gaps = computeCarGaps(state.schedule, weekStart, day, c.id);
                  const fullyEmpty = gaps.length === 1 && gaps[0] === '00:00–24:00';
                  return (
                    <td key={day} style={{ ...td, color: fullyEmpty ? MUTE : gaps.length ? RED : GREEN, fontSize: 11 }}>
                      {gaps.length === 0 ? '✓ Πλήρης' : fullyEmpty ? '— Κενό' : gaps.join(', ')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditScheduleEntryModal
          state={state} persist={persist} weekStart={weekStart}
          driverId={editing.driverId} day={editing.day} entry={editing.entry}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditScheduleEntryModal({ state, persist, weekStart, driverId, day, entry, onClose }) {
  const driver = state.drivers.find(d => d.id === driverId);
  const [mode, setMode] = useState(entry ? entry.type : 'shift'); // 'shift' | 'rest'
  const [startTime, setStartTime] = useState(entry?.startTime || '06:00');
  const [endTime, setEndTime] = useState(entry?.endTime || '18:00');
  const [car, setCar] = useState(entry?.car || state.cars[0]?.id || '');

  const save = async () => {
    const base = { id: entry?.id || ('sch_' + Date.now() + '_' + driverId + '_' + day), weekStart, driverId, day };
    const newEntry = mode === 'rest'
      ? { ...base, type: 'rest', startTime: null, endTime: null, car: null }
      : { ...base, type: 'shift', startTime, endTime, car };
    const next = entry
      ? state.schedule.map(e => e.id === entry.id ? newEntry : e)
      : [...state.schedule, newEntry];
    await persist({ ...state, schedule: next });
    onClose();
  };

  const clear = async () => {
    if (!entry) return onClose();
    await persist({ ...state, schedule: state.schedule.filter(e => e.id !== entry.id) });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>{driver?.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ color: MUTE, fontSize: 13, marginBottom: 20 }}>{DAY_LABELS_FULL[day]} · {addDaysIso(weekStart, day)}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setMode('shift')} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${mode === 'shift' ? ACCENT : BORDER}`, background: mode === 'shift' ? 'rgba(245,185,66,0.12)' : 'none', color: mode === 'shift' ? ACCENT : MUTE, fontWeight: 700, cursor: 'pointer' }}>Βάρδια</button>
          <button onClick={() => setMode('rest')} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${mode === 'rest' ? MUTE : BORDER}`, background: mode === 'rest' ? 'rgba(139,146,160,0.15)' : 'none', color: mode === 'rest' ? TEXT : MUTE, fontWeight: 700, cursor: 'pointer' }}>Ρεπό</button>
        </div>

        {mode === 'shift' && (
          <>
            <label style={label}>Ώρα έναρξης</label>
            <Time24Input value={startTime} onChange={setStartTime} />
            <label style={label}>Ώρα λήξης</label>
            <Time24Input value={endTime} onChange={setEndTime} />
            <div style={{ color: MUTE, fontSize: 12, marginTop: -10, marginBottom: 16 }}>
              Αναγνωρίζεται αυτόματα ως: <span style={{ color: ACCENT, fontWeight: 700 }}>{classifyShift(startTime)}</span>
            </div>
            <label style={label}>Όχημα</label>
            <select value={car} onChange={e => setCar(e.target.value)} style={input}>
              {state.cars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
            </select>
          </>
        )}

        <button onClick={save} style={{ ...btnPrimary, justifyContent: 'center' }}>Αποθήκευση</button>
        {entry && (
          <button onClick={clear} style={{ width: '100%', background: 'none', border: `1px solid ${RED}`, color: RED, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10 }}>
            Διαγραφή καταχώρισης
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Στόλος & Οδηγοί (διαχείριση) ----------
function EditCarModal({ state, persist, car, onClose }) {
  const [brand, setBrand] = useState(car.brand || '');
  const [model, setModel] = useState(car.model || '');
  const [year, setYear] = useState(car.year || '');
  const [plate, setPlate] = useState(car.plate || '');

  const save = async () => {
    await persist({ ...state, cars: state.cars.map(c => c.id === car.id ? { ...c, brand, model, year, plate } : c) });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>Στοιχεία {carLabel(car)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <label style={label}>Μάρκα</label>
        <input value={brand} onChange={e => setBrand(e.target.value)} style={input} placeholder="π.χ. Mercedes-Benz" />

        <label style={label}>Μοντέλο</label>
        <input value={model} onChange={e => setModel(e.target.value)} style={input} placeholder="π.χ. Vito" />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Χρονολογία</label>
            <input value={year} onChange={e => setYear(e.target.value)} style={input} placeholder="π.χ. 2020" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Αριθμός κυκλοφορίας</label>
            <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} style={input} placeholder="π.χ. ΤΑΕ4088" />
          </div>
        </div>

        <button onClick={save} style={{ ...btnPrimary, justifyContent: 'center' }}>Αποθήκευση</button>
      </div>
    </div>
  );
}

function FleetTab({ state, persist }) {
  const [editingDriver, setEditingDriver] = useState(null); // driver object or 'new'
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingCar, setEditingCar] = useState(null); // car object being edited

  const activeShiftForCar = (carId) => state.shifts.find(s => s.car === carId && s.status === 'active');

  const toggleCarService = async (carId) => {
    await persist({ ...state, cars: state.cars.map(c => c.id === carId ? { ...c, outOfService: !c.outOfService } : c) });
  };

  const addCar = async () => {
    const label = prompt('Όνομα νέου οχήματος (π.χ. TAXI 4)');
    if (!label) return;
    if (state.cars.some(c => c.id === label)) { alert('Υπάρχει ήδη όχημα με αυτό το όνομα.'); return; }
    await persist({ ...state, cars: [...state.cars, { id: label, outOfService: false, baseKm: 0, serviceIntervalKm: 10000, lastServiceKm: 0, serviceHistory: [], brand: '', model: '', year: '' }] });
  };

  const removeCar = async (carId) => {
    const inUse = state.drivers.some(d => d.car === carId);
    if (inUse) { alert('Δεν μπορείς να διαγράψεις όχημα που είναι ανατεθειμένο σε οδηγό. Άλλαξε πρώτα το όχημα του οδηγού.'); return; }
    if (!confirm(`Διαγραφή ${carId};`)) return;
    await persist({ ...state, cars: state.cars.filter(c => c.id !== carId) });
  };

  const saveDriver = async (payload) => {
    if (payload.id) {
      await persist({ ...state, drivers: state.drivers.map(d => d.id === payload.id ? { ...d, ...payload } : d) });
    } else {
      const id = 'd_' + Date.now();
      await persist({ ...state, drivers: [...state.drivers, { id, ...payload }] });
    }
    setEditingDriver(null);
  };

  const removeDriver = async (driverId) => {
    const hasShifts = state.shifts.some(s => s.driverId === driverId);
    if (hasShifts && !confirm('Ο οδηγός έχει ιστορικό βαρδιών. Η διαγραφή δεν σβήνει το ιστορικό, αλλά ο οδηγός δεν θα εμφανίζεται πλέον στη λίστα σύνδεσης. Συνέχεια;')) return;
    await persist({ ...state, drivers: state.drivers.filter(d => d.id !== driverId) });
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Οχήματα</div>
        <button onClick={addCar} style={{ background: 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Νέο όχημα
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        {state.cars.map(c => {
          const occ = activeShiftForCar(c.id);
          const occDriver = occ && state.drivers.find(d => d.id === occ.driverId);
          return (
          <div key={c.id} style={{ background: CARD, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Car size={16} color={c.outOfService ? MUTE : (occ ? GREEN : ACCENT)} />
                <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{carLabel(c)}</span>
                {c.outOfService && <span style={{ background: 'rgba(193,84,60,0.15)', color: RED, padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>Εκτός λειτουργίας</span>}
                {!c.outOfService && occ && (
                  <span style={{ background: 'rgba(74,155,110,0.15)', color: GREEN, padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
                    Ενεργός — {occDriver?.name || '—'}
                  </span>
                )}
              </div>
              {(c.brand || c.model || c.year) && (
                <div style={{ color: MUTE, fontSize: 12, marginTop: 3, marginLeft: 26 }}>
                  {[c.brand, c.model, c.year].filter(Boolean).join(' · ')}
                </div>
              )}
              {!c.plate && (
                <div style={{ color: MUTE, fontSize: 12, marginTop: 3, marginLeft: 26 }}>Χωρίς αριθμό κυκλοφορίας ακόμα — πάτα Επεξεργασία</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditingCar(c)} style={smallBtn(MUTE)}>Επεξεργασία</button>
              <button onClick={() => toggleCarService(c.id)} disabled={!!occ} title={occ ? 'Δεν μπορεί να αλλάξει ενόσω είναι σε βάρδια' : ''} style={{ ...smallBtn(c.outOfService ? GREEN : RED), opacity: occ ? 0.4 : 1, cursor: occ ? 'not-allowed' : 'pointer' }}>
                {c.outOfService ? 'Επαναφορά' : 'Εκτός λειτουργίας'}
              </button>
              <button onClick={() => removeCar(c.id)} style={smallBtn(MUTE)}>Διαγραφή</button>
            </div>
          </div>
          );
        })}
      </div>
      {editingCar && <EditCarModal state={state} persist={persist} car={editingCar} onClose={() => setEditingCar(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Οδηγοί</div>
        <button onClick={() => setEditingDriver('new')} style={{ background: 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Νέος οδηγός
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.drivers.map(d => (
          <div key={d.id} style={{ background: CARD, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{d.name}</div>
              <div style={{ color: MUTE, fontSize: 12 }}>{d.username} · {d.car}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditingDriver(d)} style={smallBtn(ACCENT)}>Επεξεργασία</button>
              <button onClick={() => removeDriver(d.id)} style={smallBtn(RED)}>Διαγραφή</button>
            </div>
          </div>
        ))}
        {state.drivers.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>Κανένας οδηγός</div>}
      </div>

      {editingDriver && (
        <DriverEditModal
          driver={editingDriver === 'new' ? null : editingDriver}
          cars={state.cars}
          existingUsernames={state.drivers.filter(d => d.id !== (editingDriver?.id)).map(d => d.username)}
          onClose={() => setEditingDriver(null)}
          onSave={saveDriver}
        />
      )}
    </div>
  );
}

function DriverEditModal({ driver, cars, existingUsernames, onClose, onSave }) {
  const [name, setName] = useState(driver?.name || '');
  const [username, setUsername] = useState(driver?.username || '');
  const [password, setPassword] = useState(driver?.password || '');
  const [car, setCar] = useState(driver?.car || cars[0]?.id || '');
  const [error, setError] = useState('');

  const submit = () => {
    if (!name || !username || !password || !car) { setError('Συμπλήρωσε όλα τα πεδία.'); return; }
    if (existingUsernames.includes(username.trim().toLowerCase())) { setError('Το όνομα χρήστη υπάρχει ήδη.'); return; }
    onSave({ id: driver?.id, name, username: username.trim().toLowerCase(), password, car });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>{driver ? 'Επεξεργασία οδηγού' : 'Νέος οδηγός'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <label style={label}>Ονοματεπώνυμο</label>
        <input value={name} onChange={e => setName(e.target.value)} style={input} />
        <label style={label}>Όνομα χρήστη</label>
        <input value={username} onChange={e => setUsername(e.target.value)} style={input} />
        <label style={label}>Κωδικός</label>
        <input value={password} onChange={e => setPassword(e.target.value)} style={input} />
        <label style={label}>Όχημα</label>
        <select value={car} onChange={e => setCar(e.target.value)} style={input}>
          {cars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
        </select>
        {error && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={submit} style={{ ...btnPrimary, justifyContent: 'center' }}>Αποθήκευση</button>
      </div>
    </div>
  );
}

// ---------- Νέο ραντεβού με έλεγχο σύγκρουσης ----------
function NewAppointmentModal({ state, persist, onClose, defaultDate, defaultTime, appointment }) {
  const isEdit = !!appointment;
  const [date, setDate] = useState(appointment?.date || defaultDate || isoDateStr(new Date()));
  const [time, setTime] = useState(appointment?.time || defaultTime || '10:00');
  const [durationMin, setDurationMin] = useState(String(appointment?.durationMin || 60));
  const [customerName, setCustomerName] = useState(appointment?.customerName || '');
  const [pickup, setPickup] = useState(appointment?.pickup || '');
  const [dropoff, setDropoff] = useState(appointment?.dropoff || '');
  const [driverId, setDriverId] = useState(appointment?.driverId || '');
  const [car, setCar] = useState(appointment?.car || '');
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [passengers, setPassengers] = useState(appointment?.passengers || 1);
  const [error, setError] = useState('');

  const conflict = useMemo(() => {
    if (!driverId && !car) return null;
    const result = checkAppointmentConflict(state, { date, time, durationMin: Number(durationMin), driverId, car, excludeId: appointment?.id });
    return result.ok ? null : result.reason;
  }, [state, date, time, durationMin, driverId, car]);

  const canSubmit = customerName && pickup && dropoff && date && time && !conflict;

  const submit = async () => {
    if (!canSubmit) return;
    const finalCheck = checkAppointmentConflict(state, { date, time, durationMin: Number(durationMin), driverId, car, excludeId: appointment?.id });
    if (!finalCheck.ok) { setError(finalCheck.reason); return; }

    if (isEdit) {
      const wasUnassigned = !appointment.driverId && !appointment.car;
      const nowAssigned = !!(driverId || car);
      await persist({
        ...state,
        appointments: state.appointments.map(a => a.id === appointment.id ? {
          ...a,
          date, time, durationMin: Number(durationMin),
          customerName, pickup, dropoff, driverId: driverId || null, car: car || null,
          notes, passengers: Number(passengers),
          status: wasUnassigned && nowAssigned ? 'assigned' : a.status,
          assignedAt: wasUnassigned && nowAssigned ? new Date().toISOString() : a.assignedAt,
        } : a),
      });
    } else {
      const appt = {
        id: 'appt_' + Date.now(),
        date, time, durationMin: Number(durationMin),
        customerName, pickup, dropoff, driverId: driverId || null, car: car || null,
        status: driverId || car ? 'assigned' : 'pending',
        notes, passengers: Number(passengers),
        createdAt: new Date().toISOString(),
        assignedAt: (driverId || car) ? new Date().toISOString() : null,
        acceptedAt: null, arrivedAt: null, completedAt: null,
      };
      await persist({ ...state, appointments: [...state.appointments, appt] });
    }
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>{isEdit ? 'Επεξεργασία ραντεβού' : 'Νέο ραντεβού'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Ημερομηνία</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Ώρα</label>
            <Time24Input value={time} onChange={setTime} />
          </div>
          <div style={{ width: 100 }}>
            <label style={label}>Λεπτά</label>
            <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} style={input} />
          </div>
        </div>

        <label style={label}>Όνομα πελάτη</label>
        <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={input} placeholder="π.χ. Κος Αντωνίου" />

        <label style={label}>Αριθμός επιβατών</label>
        <select value={passengers} onChange={e => setPassengers(e.target.value)} style={input}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Παραλαβή</label>
            <input value={pickup} onChange={e => setPickup(e.target.value)} style={input} placeholder="π.χ. Αεροδρόμιο" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Προορισμός</label>
            <input value={dropoff} onChange={e => setDropoff(e.target.value)} style={input} placeholder="π.χ. Κέντρο" />
          </div>
        </div>

        <label style={label}>Οδηγός (προαιρετικό)</label>
        <select
          value={driverId}
          onChange={e => {
            const nextDriverId = e.target.value;
            setDriverId(nextDriverId);
            setError('');
            const activeShift = state.shifts.find(s => s.driverId === nextDriverId && s.status === 'active');
            if (activeShift) setCar(activeShift.car);
          }}
          style={input}
        >
          <option value="">— Χωρίς ανάθεση —</option>
          {state.drivers.map(d => {
            const activeShift = state.shifts.find(s => s.driverId === d.id && s.status === 'active');
            return (
              <option key={d.id} value={d.id}>
                {d.name} {activeShift ? `— εργάζεται τώρα: ${carLabelById(state, activeShift.car)}` : '(εκτός βάρδιας)'}
              </option>
            );
          })}
        </select>

        <label style={label}>Όχημα (προαιρετικό)</label>
        <select value={car} onChange={e => { setCar(e.target.value); setError(''); }} style={input}>
          <option value="">— Χωρίς όχημα —</option>
          {state.cars.map(c => {
            const occ = state.shifts.find(s => s.car === c.id && s.status === 'active');
            const occDriver = occ && state.drivers.find(d => d.id === occ.driverId);
            return (
              <option key={c.id} value={c.id}>
                {c.id}{c.outOfService ? ' (εκτός λειτουργίας)' : occ ? ` (τώρα: ${occDriver?.name || '—'})` : ''}
              </option>
            );
          })}
        </select>

        <label style={label}>Σημειώσεις (προαιρετικό)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />

        {(conflict || error) && (
          <div style={{ background: 'rgba(193,84,60,0.12)', border: `1px solid ${RED}`, borderRadius: 10, padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <XCircle size={16} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: RED, fontSize: 13 }}>{conflict || error}</span>
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit} style={{ ...btnPrimary, justifyContent: 'center', opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {isEdit ? 'Αποθήκευση αλλαγών' : 'Δημιουργία ραντεβού'}
        </button>
        {isEdit && (
          <button
            onClick={async () => {
              if (!confirm('Διαγραφή αυτού του ραντεβού; Η ενέργεια δεν αναιρείται.')) return;
              await persist({ ...state, appointments: state.appointments.filter(a => a.id !== appointment.id) });
              onClose();
            }}
            style={{ width: '100%', background: 'none', border: `1px solid ${RED}`, color: RED, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10 }}
          >
            Διαγραφή ραντεβού
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Ημερολόγιο (Calendar view) ----------
function CalendarTab({ state, persist }) {
  const [date, setDate] = useState(isoDateStr(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [prefillTime, setPrefillTime] = useState('10:00');
  const [editingAppt, setEditingAppt] = useState(null);

  const hours = Array.from({ length: 24 }, (_, i) => i); // 00:00 - 23:00
  const cars = state.cars.map(c => c.id);
  const isToday = date === isoDateStr(new Date());
  const activeShiftForCar = (carId) => state.shifts.find(s => s.car === carId && s.status === 'active');

  const apptsForSlot = (car, hour) => {
    return state.appointments.filter(a => {
      if (a.date !== date || a.car !== car || a.status === 'cancelled' || a.status === 'completed') return false;
      const [s, e] = apptRange(a);
      return hour * 60 < e && s < (hour + 1) * 60;
    });
  };

  const cellColor = (appts, carRecord) => {
    if (appts.length > 0) {
      const a = appts[0];
      const meta = STATUS_META[a.status] || STATUS_META.pending;
      return { bg: `${meta.color}22`, label: `✈ ${a.dropoff}`, text: meta.color };
    }
    if (carRecord?.outOfService) return { bg: '#3a2a2a', label: 'Εκτός λειτουργίας', text: '#c88' };
    return { bg: 'rgba(74,155,110,0.12)', label: 'Διαθέσιμο', text: GREEN };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...input, marginBottom: 0, width: 'auto' }} />
        </div>
        <button onClick={() => { setPrefillTime('10:00'); setShowNew(true); }} style={{ background: ACCENT, color: BG, border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Νέο ραντεβού
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Legend color={GREEN} label="Διαθέσιμο" />
        <Legend color="#F5B942" label="Αναμονή" />
        <Legend color="#5B8DEF" label="Ανατέθηκε / Σε διαδρομή" />
        <Legend color="#c88" label="Εκτός λειτουργίας" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `70px repeat(${cars.length}, 1fr)`, minWidth: 360 + cars.length * 120 }}>
          <div />
          {cars.map(c => {
            const occ = isToday && activeShiftForCar(c);
            const occDriver = occ && state.drivers.find(d => d.id === occ.driverId);
            return (
              <div key={c} style={{ textAlign: 'center', padding: '8px 4px' }}>
                <div style={{ color: TEXT, fontSize: 13, fontWeight: 700 }}>{carLabelById(state, c)}</div>
                {occ && (
                  <div style={{ color: GREEN, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
                    {occDriver?.name || 'Ενεργός'}
                  </div>
                )}
              </div>
            );
          })}
          {hours.map(h => (
            <React.Fragment key={h}>
              <div style={{ color: MUTE, fontSize: 12, padding: '10px 6px', borderTop: `1px solid ${CARD}` }}>{String(h).padStart(2, '0')}:00</div>
              {cars.map(c => {
                const appts = apptsForSlot(c, h);
                const carRecord = state.cars.find(x => x.id === c);
                const style = cellColor(appts, carRecord);
                return (
                  <div
                    key={c + h}
                    onClick={() => {
                      if (appts[0]) {
                        setEditingAppt(appts[0]);
                      } else {
                        setPrefillTime(`${String(h).padStart(2, '0')}:00`);
                        setShowNew(true);
                      }
                    }}
                    style={{
                      borderTop: `1px solid ${CARD}`, background: style.bg, minHeight: 44, padding: '6px 8px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}
                    title={appts[0]?.customerName || ''}
                  >
                    <span style={{ color: style.text, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{style.label}</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {showNew && (
        <NewAppointmentModal state={state} persist={persist} onClose={() => setShowNew(false)} defaultDate={date} defaultTime={prefillTime} />
      )}
      {editingAppt && (
        <NewAppointmentModal state={state} persist={persist} appointment={editingAppt} onClose={() => setEditingAppt(null)} />
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
      <span style={{ color: MUTE, fontSize: 11 }}>{label}</span>
    </div>
  );
}

// ---------- Ιστορικό ραντεβού με φίλτρα ----------
function AppointmentsHistoryTab({ state, persist }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);

  const filtered = state.appointments
    .filter(a => !filterDate || a.date === filterDate)
    .filter(a => !filterDriver || a.driverId === filterDriver)
    .filter(a => !filterCar || a.car === filterCar)
    .filter(a => !filterCustomer || a.customerName.toLowerCase().includes(filterCustomer.toLowerCase()))
    .filter(a => !filterStatus || a.status === filterStatus)
    .sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time));

  // Χρόνοι διεκπεραίωσης (μόνο ολοκληρωμένα με πλήρη timestamps)
  const completedWithTimes = state.appointments.filter(a => a.status === 'completed' && a.assignedAt && a.completedAt);
  const avgExecMin = completedWithTimes.length
    ? Math.round(completedWithTimes.reduce((sum, a) => sum + (new Date(a.completedAt) - new Date(a.assignedAt)) / 60000, 0) / completedWithTimes.length)
    : null;
  const withDelay = state.appointments.filter(a => a.status === 'completed' && a.time && a.arrivedAt);
  const avgDelayMin = withDelay.length
    ? Math.round(withDelay.reduce((sum, a) => {
        const scheduled = new Date(`${a.date}T${a.time}:00`);
        return sum + (new Date(a.arrivedAt) - scheduled) / 60000;
      }, 0) / withDelay.length)
    : null;

  const updateStatus = async (id, patch) => {
    await persist({ ...state, appointments: state.appointments.map(a => a.id === id ? { ...a, ...patch } : a) });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Ιστορικό ραντεβού</div>
        <button onClick={() => setShowNew(true)} style={{ background: ACCENT, color: BG, border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Νέο
        </button>
      </div>

      {avgExecMin != null && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard icon={Clock} label="Μέσος χρόνος εκτέλεσης" value={`${avgExecMin} λεπτά`} accent={ACCENT} />
          {avgDelayMin != null && <StatCard icon={AlertCircle} label="Μέση καθυστέρηση" value={`${avgDelayMin} λεπτά`} accent={avgDelayMin > 0 ? RED : GREEN} />}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, background: CARD, padding: 12, borderRadius: 10, border: `1px solid ${BORDER}` }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} />
        <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
          <option value="">Όλοι οι οδηγοί</option>
          {state.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterCar} onChange={e => setFilterCar(e.target.value)} style={{ ...input, marginBottom: 0, width: 130 }}>
          <option value="">Όλα τα οχήματα</option>
          {state.cars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
        </select>
        <input value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} placeholder="Πελάτης…" style={{ ...input, marginBottom: 0, width: 150 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }}>
          <option value="">Όλες οι καταστάσεις</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(a => {
          const driver = state.drivers.find(d => d.id === a.driverId);
          const meta = STATUS_META[a.status] || STATUS_META.pending;
          return (
            <div key={a.id} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{dmy(a.date)} · {a.time}</div>
                  <div style={{ color: MUTE, fontSize: 13, marginTop: 2 }}>{a.pickup} → {a.dropoff}</div>
                  <div style={{ color: MUTE, fontSize: 12, marginTop: 4 }}>{a.customerName}{a.passengers ? ` · ${a.passengers} επιβ.` : ''}</div>
                </div>
                <span style={{ background: `${meta.color}22`, color: meta.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{meta.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 8, color: MUTE, fontSize: 12 }}>
                <span>Οδηγός: {driver?.name || '—'}</span>
                <span>Όχημα: {a.car || '—'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {a.status !== 'completed' && a.status !== 'cancelled' && (
                  <>
                    {a.status === 'assigned' && (
                      <button onClick={() => updateStatus(a.id, { status: 'accepted', acceptedAt: new Date().toISOString() })} style={smallBtn('#5B8DEF')}>Αποδοχή οδηγού</button>
                    )}
                    {a.status === 'accepted' && (
                      <button onClick={() => updateStatus(a.id, { status: 'enroute' })} style={smallBtn('#5B8DEF')}>Σε διαδρομή</button>
                    )}
                    {(a.status === 'accepted' || a.status === 'enroute') && (
                      <button onClick={() => updateStatus(a.id, { arrivedAt: new Date().toISOString() })} style={smallBtn(ACCENT)}>Άφιξη</button>
                    )}
                    <button onClick={() => updateStatus(a.id, { status: 'completed', completedAt: new Date().toISOString(), arrivedAt: a.arrivedAt || new Date().toISOString() })} style={smallBtn(GREEN)}>Ολοκλήρωση</button>
                    <button onClick={() => updateStatus(a.id, { status: 'cancelled' })} style={smallBtn(RED)}>Ακύρωση</button>
                  </>
                )}
                <button onClick={() => setEditingAppt(a)} style={smallBtn(MUTE)}>Επεξεργασία</button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>Κανένα ραντεβού με αυτά τα φίλτρα</div>}
      </div>

      {showNew && <NewAppointmentModal state={state} persist={persist} onClose={() => setShowNew(false)} />}
      {editingAppt && <NewAppointmentModal state={state} persist={persist} appointment={editingAppt} onClose={() => setEditingAppt(null)} />}
    </div>
  );
}

function TodayTab({ state, onLock, onUnlock }) {
  const today = todayStr();
  const todayShifts = state.shifts.filter(s => s.date === today);

  return (
    <div>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Σήμερα — {today}</div>
      {todayShifts.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>Καμία βάρδια σήμερα ακόμα</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {todayShifts.map(s => {
          const driver = state.drivers.find(d => d.id === s.driverId);
          const revenue = (s.cash || 0) + (s.card || 0) + (s.app || 0);
          const km = s.endKm ? s.endKm - s.startKm : null;
          const gpsFlag = km != null && s.gpsStart && s.gpsEnd; // presence check only in prototype
          return (
            <div key={s.id} style={{ background: CARD, borderRadius: 14, padding: 16, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🚕 {carLabelById(state, s.car)}
                  </div>
                  <div style={{ color: MUTE, fontSize: 13 }}>Οδηγός: {driver?.name}</div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                <MiniStat label="Τζίρος" value={fmtEUR(revenue)} color={GREEN} />
                <MiniStat label="Χλμ" value={km != null ? km : '—'} />
                <MiniStat label="Καύσιμο" value={fmtEUR(s.fuel)} />
                {s.fuelReceiptPhoto && (
                  <a href={s.fuelReceiptPhoto} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <MiniStat label="Απόδειξη" value="📷 δείτε φωτο" color={ACCENT} />
                  </a>
                )}
                {s.gpsStart && s.gpsEnd && <MiniStat label="GPS" value="✓ καταγράφηκε" color={GREEN} />}
              </div>
              {s.status === 'closed' && (
                <button onClick={() => onLock(s.id)} style={{ marginTop: 12, background: 'rgba(245,185,66,0.12)', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={13} /> Έλεγχος &amp; κλείδωμα
                </button>
              )}
              {s.status === 'locked' && (
                <button onClick={() => onUnlock(s.id)} style={{ marginTop: 12, background: 'none', color: MUTE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Unlock size={13} /> Ξεκλείδωμα για διόρθωση
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div>
      <div style={{ color: MUTE, fontSize: 11 }}>{label}</div>
      <div style={{ color: color || TEXT, fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function AllShiftsTab({ state, persist, onLock, onUnlock }) {
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [editingShift, setEditingShift] = useState(null);

  const sorted = state.shifts
    .filter(s => !filterDriver || s.driverId === filterDriver)
    .filter(s => !filterCar || s.car === filterCar)
    .filter(s => !filterFrom || isoDateStr(s.startTime) >= filterFrom)
    .filter(s => !filterTo || isoDateStr(s.startTime) <= filterTo)
    .slice().sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  return (
    <div>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Όλες οι βάρδιες</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, background: CARD, padding: 12, borderRadius: 10, border: `1px solid ${BORDER}` }}>
        <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
          <option value="">Όλοι οι οδηγοί</option>
          {state.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterCar} onChange={e => setFilterCar(e.target.value)} style={{ ...input, marginBottom: 0, width: 130 }}>
          <option value="">Όλα τα οχήματα</option>
          {state.cars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} placeholder="Από" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} placeholder="Έως" />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: MUTE }}>
              {['Όχημα', 'Οδηγός', 'Ημ/νία', 'Χλμ', 'Τζίρος', 'Καθαρό', 'Κατάσταση', ''].map(h => (
                <th key={h} style={{ padding: '8px 10px', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const driver = state.drivers.find(d => d.id === s.driverId);
              const revenue = s.status === 'active' ? null : (s.cash || 0) + (s.card || 0) + (s.app || 0);
              const net = revenue != null ? revenue - (s.expenses || 0) - (s.fuel || 0) : null;
              return (
                <tr key={s.id} style={{ borderTop: `1px solid ${CARD}` }}>
                  <td style={td}>{carLabelById(state, s.car)}</td>
                  <td style={td}>{driver?.name}</td>
                  <td style={td}>{s.date}</td>
                  <td style={td}>{s.endKm ? s.endKm - s.startKm : '—'}</td>
                  <td style={{ ...td, color: GREEN, fontWeight: 600 }}>{revenue != null ? fmtEUR(revenue) : '—'}</td>
                  <td style={{ ...td, color: net != null ? (net >= 0 ? GREEN : RED) : TEXT, fontWeight: 600 }}>{net != null ? fmtEUR(net) : '—'}</td>
                  <td style={td}><StatusBadge status={s.status} /></td>
                  <td style={td}>
                    {s.status === 'closed' && <button onClick={() => onLock(s.id)} style={smallBtn(ACCENT)}>Κλείδωμα</button>}
                    {s.status === 'locked' && <button onClick={() => onUnlock(s.id)} style={smallBtn(MUTE)}>Ξεκλείδωμα</button>}
                    {' '}<button onClick={() => setEditingShift(s)} style={smallBtn(MUTE)}>Επεξεργασία</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <div style={{ color: MUTE, fontSize: 13, padding: '16px 0' }}>Καμία βάρδια ακόμα</div>}
      </div>
      {editingShift && <EditShiftModal state={state} persist={persist} shift={editingShift} onClose={() => setEditingShift(null)} />}
    </div>
  );
}
const td = { padding: '10px', color: TEXT };
const smallBtn = (color) => ({ background: 'none', border: `1px solid ${color}`, color, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' });

function EditShiftModal({ state, persist, shift, onClose }) {
  const [car, setCar] = useState(shift.car);
  const [startKm, setStartKm] = useState(String(shift.startKm ?? ''));
  const [endKm, setEndKm] = useState(shift.endKm != null ? String(shift.endKm) : '');
  const [cash, setCash] = useState(shift.cash != null ? String(shift.cash) : '');
  const [card, setCard] = useState(shift.card != null ? String(shift.card) : '');
  const [app, setApp] = useState(shift.app != null ? String(shift.app) : '');
  const [expenses, setExpenses] = useState(shift.expenses != null ? String(shift.expenses) : '');
  const [fuel, setFuel] = useState(shift.fuel != null ? String(shift.fuel) : '');
  const [notes, setNotes] = useState(shift.notes || '');

  const save = async () => {
    await persist({
      ...state,
      shifts: state.shifts.map(s => s.id === shift.id ? {
        ...s,
        car,
        startKm: startKm === '' ? s.startKm : Number(startKm),
        endKm: endKm === '' ? null : Number(endKm),
        cash: cash === '' ? null : Number(cash),
        card: card === '' ? null : Number(card),
        app: app === '' ? null : Number(app),
        expenses: expenses === '' ? null : Number(expenses),
        fuel: fuel === '' ? null : Number(fuel),
        notes,
      } : s),
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>Επεξεργασία βάρδιας</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <label style={label}>Όχημα</label>
        <select value={car} onChange={e => setCar(e.target.value)} style={input}>
          {state.cars.map(c => <option key={c.id} value={c.id}>{carLabel(c)}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Χλμ έναρξης</label>
            <input type="number" value={startKm} onChange={e => setStartKm(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Χλμ τέλους</label>
            <input type="number" value={endKm} onChange={e => setEndKm(e.target.value)} style={input} placeholder="—" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Μετρητά (€)</label>
            <input type="number" value={cash} onChange={e => setCash(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Κάρτες (€)</label>
            <input type="number" value={card} onChange={e => setCard(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>App (€)</label>
            <input type="number" value={app} onChange={e => setApp(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>
        <div style={{ height: 16 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Έξοδα (€)</label>
            <input type="number" value={expenses} onChange={e => setExpenses(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Πετρέλαιο (€)</label>
            <input type="number" value={fuel} onChange={e => setFuel(e.target.value)} style={input} />
          </div>
        </div>

        <label style={label}>Σημειώσεις</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={input} />

        <button onClick={save} style={{ ...btnPrimary, justifyContent: 'center' }}>Αποθήκευση αλλαγών</button>
      </div>
    </div>
  );
}

function BookingsTab({ state, persist }) {
  const [editingBooking, setEditingBooking] = useState(null);
  const sorted = state.bookings.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Προμισθώσεις</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(b => {
          const driver = state.drivers.find(d => d.id === b.driverId);
          return (
            <div key={b.id} style={{ background: CARD, borderRadius: 12, padding: 14, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{b.customerName} → {b.destination}</div>
                  <div style={{ color: MUTE, fontSize: 12, display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                    {b.flightNumber && <span><Plane size={11} style={{ verticalAlign: 'middle' }} /> {b.flightNumber} {b.arrivalTime}</span>}
                    <span><Users size={11} style={{ verticalAlign: 'middle' }} /> {b.passengers}</span>
                    <span>{driver?.name} · {driver?.car}</span>
                  </div>
                </div>
                <div style={{ color: GREEN, fontSize: 15, fontWeight: 700 }}>{fmtEUR(b.price)}</div>
              </div>
              {b.notes && <div style={{ color: MUTE, fontSize: 12, marginTop: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>{b.notes}</div>}
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setEditingBooking(b)} style={smallBtn(MUTE)}>Επεξεργασία</button>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>Καμία προμίσθωση ακόμα</div>}
      </div>
      {editingBooking && <EditBookingModal state={state} persist={persist} booking={editingBooking} onClose={() => setEditingBooking(null)} />}
    </div>
  );
}

function EditBookingModal({ state, persist, booking, onClose }) {
  const [flightNumber, setFlightNumber] = useState(booking.flightNumber || '');
  const [arrivalTime, setArrivalTime] = useState(booking.arrivalTime || '');
  const [customerName, setCustomerName] = useState(booking.customerName || '');
  const [passengers, setPassengers] = useState(String(booking.passengers ?? ''));
  const [destination, setDestination] = useState(booking.destination || '');
  const [price, setPrice] = useState(String(booking.price ?? ''));
  const [notes, setNotes] = useState(booking.notes || '');

  const save = async () => {
    await persist({
      ...state,
      bookings: state.bookings.map(b => b.id === booking.id ? {
        ...b,
        flightNumber, arrivalTime, customerName,
        passengers: passengers === '' ? b.passengers : Number(passengers),
        destination,
        price: price === '' ? b.price : Number(price),
        notes,
      } : b),
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>Επεξεργασία προμίσθωσης</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <label style={label}>Όνομα πελάτη</label>
        <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={input} />

        <label style={label}>Προορισμός</label>
        <input value={destination} onChange={e => setDestination(e.target.value)} style={input} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Πτήση</label>
            <input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} style={input} placeholder="προαιρετικό" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Ώρα άφιξης</label>
            <input value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} style={input} placeholder="π.χ. 14:30" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Επιβάτες</label>
            <input type="number" value={passengers} onChange={e => setPassengers(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Τιμή (€)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={input} />
          </div>
        </div>

        <label style={label}>Σημειώσεις</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={input} />

        <button onClick={save} style={{ ...btnPrimary, justifyContent: 'center' }}>Αποθήκευση αλλαγών</button>
      </div>
    </div>
  );
}

function computeReportStats(state, shifts) {
  const byDriver = {};
  const byCar = {};
  let totalRevenue = 0, totalExpenses = 0, totalFuel = 0;
  shifts.forEach(s => {
    const revenue = (s.cash || 0) + (s.card || 0) + (s.app || 0);
    totalRevenue += revenue;
    totalExpenses += s.expenses || 0;
    totalFuel += s.fuel || 0;
    const driver = state.drivers.find(d => d.id === s.driverId);
    const dName = driver?.name || '—';
    byDriver[dName] = (byDriver[dName] || 0) + revenue;
    byCar[carLabelById(state, s.car)] = (byCar[carLabelById(state, s.car)] || 0) + revenue;
  });
  return { byDriver, byCar, totalRevenue, totalExpenses, totalFuel, netProfit: totalRevenue - totalExpenses - totalFuel };
}

function ReportsTab({ state, persist }) {
  const [view, setView] = useState('total'); // 'total' | 'month'
  const [month, setMonth] = useState(isoDateStr(new Date()).slice(0, 7)); // "YYYY-MM"

  const closedOrLocked = state.shifts.filter(s => s.status !== 'active');

  const resetStats = async () => {
    if (!confirm('Μηδενισμός γενικού συνόλου; Τα δεδομένα δεν διαγράφονται — παραμένουν πλήρη στη μηνιαία προβολή και στις Βάρδιες. Απλά το "Γενικό σύνολο" θα ξαναμετράει από σήμερα.')) return;
    await persist({ ...state, reportsResetAt: isoDateStr(new Date()) });
  };
  const clearReset = async () => {
    if (!confirm('Εμφάνιση όλου του ιστορικού ξανά στο γενικό σύνολο;')) return;
    await persist({ ...state, reportsResetAt: null });
  };

  const totalShifts = state.reportsResetAt
    ? closedOrLocked.filter(s => s.date >= state.reportsResetAt)
    : closedOrLocked;
  const monthShifts = closedOrLocked.filter(s => s.date.slice(0, 7) === month);

  const stats = computeReportStats(state, view === 'total' ? totalShifts : monthShifts);

  // Last 12 months for the dropdown
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return isoDateStr(d).slice(0, 7);
  });
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    const names = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
    return `${names[Number(m) - 1]} ${y}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('total')} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${view === 'total' ? ACCENT : BORDER}`, background: view === 'total' ? 'rgba(245,185,66,0.12)' : 'none', color: view === 'total' ? ACCENT : MUTE, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Γενικό σύνολο</button>
        <button onClick={() => setView('month')} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${view === 'month' ? ACCENT : BORDER}`, background: view === 'month' ? 'rgba(245,185,66,0.12)' : 'none', color: view === 'month' ? ACCENT : MUTE, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Ανά μήνα</button>
      </div>

      {view === 'total' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <div style={{ color: MUTE, fontSize: 12 }}>
            {state.reportsResetAt ? `Μετράει από ${dmy(state.reportsResetAt)} — το παλιότερο ιστορικό παραμένει διαθέσιμο στη μηνιαία προβολή` : 'Μετράει όλο το ιστορικό'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {state.reportsResetAt && <button onClick={clearReset} style={smallBtn(MUTE)}>Εμφάνιση όλων</button>}
            <button onClick={resetStats} style={smallBtn(RED)}>Μηδενισμός στατιστικών</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...input, marginBottom: 0, width: 200 }}>
            {monthOptions.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <div style={{ color: MUTE, fontSize: 12, marginTop: 6 }}>Πλήρες ιστορικό — δεν επηρεάζεται από μηδενισμό. Διαθέσιμο για τους τελευταίους 12 μήνες.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard icon={Wallet} label="Συνολικός τζίρος" value={fmtEUR(stats.totalRevenue)} accent={ACCENT} />
        <StatCard icon={Fuel} label="Καύσιμα" value={fmtEUR(stats.totalFuel)} accent={MUTE} />
        <StatCard icon={AlertCircle} label="Έξοδα" value={fmtEUR(stats.totalExpenses)} accent={RED} />
        <StatCard icon={CheckCircle2} label="Καθαρό κέρδος" value={fmtEUR(stats.netProfit)} accent={GREEN} />
      </div>

      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Τζίρος ανά οδηγό</div>
      <BarList data={stats.byDriver} />

      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '24px 0 10px' }}>Τζίρος ανά όχημα</div>
      <BarList data={stats.byCar} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, flex: '1 1 140px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={16} color={accent} />
        <span style={{ color: MUTE, fontSize: 12 }}>{label}</span>
      </div>
      <div style={{ color: TEXT, fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BarList({ data }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <div style={{ color: MUTE, fontSize: 13 }}>Δεν υπάρχουν δεδομένα ακόμα</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: TEXT }}>{k}</span>
            <span style={{ color: GREEN, fontWeight: 600 }}>{fmtEUR(v)}</span>
          </div>
          <div style={{ background: CARD, borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(v / max) * 100}%`, background: ACCENT, height: '100%', borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
