// cloud.js — στρώμα δεδομένων πάνω στους κανονικοποιημένους πίνακες.
//
// Γιατί υπάρχει: το UI δουλεύει με ένα μεγάλο αντικείμενο `state`. Παλιά αυτό
// αποθηκευόταν ΟΛΟΚΛΗΡΟ σε μία γραμμή (app_state) — κάθε αλλαγή ξαναέγραφε τα
// πάντα και ο τελευταίος που έγραφε έσβηνε τη δουλειά των άλλων.
// Εδώ το `state` παραμένει ίδιο για το UI, αλλά γράφεται ΑΝΑ ΓΡΑΜΜΗ: όταν
// αλλάζει μία βάρδια, πάει μόνο αυτή η βάρδια.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://whecwstuqlyohbvuvfkp.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY__;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Ημερομηνίες ----------
// Οι βάρδιες κρατούσαν ελληνική μορφή ("14/9/2026"), τα ραντεβού και το
// πρόγραμμα ISO. Η βάση κρατά παντού date. Μετατρέπουμε στα άκρα.
function isoToGr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}
function grToIso(gr) {
  if (!gr) return null;
  const s = String(gr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
const isoOnly = (v) => (v ? String(v).slice(0, 10) : null);

// ---------- Ταυτοποίηση ----------
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Επιστρέφει {role:'admin'} ή {role:'driver', driverId} — ό,τι περίμενε ήδη το UI.
export async function getSessionProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role, driver_id, full_name')
    .eq('id', session.user.id)
    .single();
  if (error || !data) return null;
  return data.role === 'admin'
    ? { role: 'admin', name: data.full_name, email: session.user.email }
    : { role: 'driver', driverId: data.driver_id, name: data.full_name, email: session.user.email };
}

// ---------- Φόρτωση ----------
export async function loadState() {
  const [
    drivers, cars, service, shifts, positions,
    bookings, appointments, schedule, messages, tameio, audit, settings,
  ] = await Promise.all([
    supabase.from('drivers').select('*'),
    supabase.from('cars').select('*'),
    supabase.from('service_history').select('*'),
    supabase.from('shifts').select('*'),
    supabase.from('driver_positions').select('*'),
    supabase.from('bookings').select('*'),
    supabase.from('appointments').select('*'),
    supabase.from('schedule').select('*'),
    supabase.from('messages').select('*'),
    supabase.from('tameio_adjustments').select('*'),
    supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(500),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);

  const firstError = [drivers, cars, service, shifts, positions, bookings,
    appointments, schedule, messages, tameio, audit].find(r => r.error);
  if (firstError) throw firstError.error;

  const posByDriver = new Map((positions.data || []).map(p => [p.driver_id, p]));
  const serviceByCar = new Map();
  (service.data || []).forEach(h => {
    if (!serviceByCar.has(h.car_id)) serviceByCar.set(h.car_id, []);
    serviceByCar.get(h.car_id).push({ at: h.at, km: h.km, description: h.description, cost: h.cost });
  });

  return {
    drivers: (drivers.data || []).filter(d => d.active !== false).map(d => ({
      id: d.id, name: d.name, username: d.username, car: d.default_car,
    })),
    cars: (cars.data || []).map(c => ({
      id: c.id, plate: c.plate || '', brand: c.brand || '', model: c.model || '', year: c.year || '',
      outOfService: !!c.out_of_service,
      baseKm: Number(c.base_km) || 0,
      serviceIntervalKm: Number(c.service_interval_km) || 10000,
      lastServiceKm: Number(c.last_service_km) || 0,
      serviceHistory: serviceByCar.get(c.id) || [],
    })),
    shifts: (shifts.data || []).map(s => {
      const pos = s.status === 'active' ? posByDriver.get(s.driver_id) : null;
      return {
        id: s.id, driverId: s.driver_id, car: s.car_id,
        date: isoToGr(s.date),
        startTime: s.start_time, endTime: s.end_time,
        startKm: s.start_km, endKm: s.end_km, startCash: s.start_cash,
        cash: Number(s.cash) || 0, card: Number(s.card) || 0, app: Number(s.app) || 0,
        expenses: Number(s.expenses) || 0, fuel: Number(s.fuel) || 0,
        fuelReceiptPhoto: s.fuel_receipt_photo,
        gpsStart: s.gps_start, gpsEnd: s.gps_end,
        status: s.status, notes: s.notes,
        currentLocation: pos && pos.shift_id === s.id
          ? { lat: pos.lat, lng: pos.lng, at: pos.at }
          : undefined,
      };
    }),
    bookings: (bookings.data || []).map(b => ({
      id: b.id, shiftId: b.shift_id, driverId: b.driver_id,
      flightNumber: b.flight_number, arrivalTime: b.arrival_time,
      customerName: b.customer_name, passengers: b.passengers,
      destination: b.destination, price: b.price,
      paymentMethod: b.payment_method, notes: b.notes, status: b.status,
    })),
    appointments: (appointments.data || []).map(a => ({
      id: a.id, date: isoOnly(a.date), time: a.time, durationMin: a.duration_min,
      pickup: a.pickup, dropoff: a.dropoff,
      customerName: a.customer_name, customerPhone: a.customer_phone,
      price: a.price, paymentMethod: a.payment_method,
      driverId: a.driver_id, car: a.car_id, passengers: a.passengers,
      status: a.status, notes: a.notes,
      createdAt: a.created_at, assignedAt: a.assigned_at, acceptedAt: a.accepted_at,
      arrivedAt: a.arrived_at, completedAt: a.completed_at,
    })),
    schedule: (schedule.data || []).map(e => ({
      id: e.id, weekStart: isoOnly(e.week_start), driverId: e.driver_id,
      day: e.day, slot: e.slot, car: e.car_id,
    })),
    messages: (messages.data || []).map(m => ({
      id: m.id, driverId: m.driver_id, sender: m.sender, text: m.text, at: m.at,
      readByAdmin: m.read_by_admin, readByDriver: m.read_by_driver,
    })),
    tameioAdjustments: (tameio.data || []).map(t => ({
      id: t.id, driverId: t.driver_id, amount: Number(t.amount) || 0, reason: t.reason, at: t.at,
    })),
    auditLog: (audit.data || []).map(l => ({ id: l.id, at: l.at, actor: l.actor, action: l.action })),
    reportsResetAt: settings.data?.reports_reset_at || null,
    fareSettings: {
      flagFall: Number(settings.data?.fare_flag_fall) || 1.90,
      perKm: Number(settings.data?.fare_per_km) || 1.65,
      minFare: Number(settings.data?.fare_min) || 3.50,
    },
  };
}

// ---------- Αποθήκευση με διαφορά ----------
const byId = (arr) => new Map((arr || []).map(x => [x.id, x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function syncTable(table, prevArr, nextArr, toRow) {
  const prev = byId(prevArr), next = byId(nextArr);
  const upserts = [];
  for (const [id, item] of next) {
    if (!same(prev.get(id), item)) upserts.push(toRow(item));
  }
  const removed = [...prev.keys()].filter(id => !next.has(id));

  if (upserts.length) {
    const { error } = await supabase.from(table).upsert(upserts);
    if (error) throw error;
  }
  if (removed.length) {
    const { error } = await supabase.from(table).delete().in('id', removed);
    if (error) throw error;
  }
}

export async function saveDiff(prev, next) {
  prev = prev || {};

  await syncTable('drivers', prev.drivers, next.drivers, d => ({
    id: d.id, name: d.name, username: d.username, default_car: d.car, active: true,
  }));

  await syncTable('cars', prev.cars, next.cars, c => ({
    id: c.id, plate: c.plate || null, brand: c.brand || null,
    model: c.model || null, year: c.year || null,
    out_of_service: !!c.outOfService,
    base_km: c.baseKm || 0,
    service_interval_km: c.serviceIntervalKm || 10000,
    last_service_km: c.lastServiceKm || 0,
  }));

  await syncTable('shifts', prev.shifts, next.shifts, s => ({
    id: s.id, driver_id: s.driverId || null, car_id: s.car || null,
    date: grToIso(s.date),
    start_time: s.startTime || null, end_time: s.endTime || null,
    start_km: s.startKm ?? null, end_km: s.endKm ?? null, start_cash: s.startCash ?? null,
    cash: s.cash || 0, card: s.card || 0, app: s.app || 0,
    expenses: s.expenses || 0, fuel: s.fuel || 0,
    fuel_receipt_photo: s.fuelReceiptPhoto || null,
    gps_start: s.gpsStart || null, gps_end: s.gpsEnd || null,
    status: s.status || 'active', notes: s.notes || null,
  }));

  await syncTable('bookings', prev.bookings, next.bookings, b => ({
    id: b.id, shift_id: b.shiftId || null, driver_id: b.driverId || null,
    flight_number: b.flightNumber || null, arrival_time: b.arrivalTime || null,
    customer_name: b.customerName || null, passengers: b.passengers ?? null,
    destination: b.destination || null, price: b.price ?? null,
    payment_method: b.paymentMethod || null, notes: b.notes || null,
    status: b.status || 'done',
  }));

  await syncTable('appointments', prev.appointments, next.appointments, a => ({
    id: a.id, date: isoOnly(a.date), time: a.time || null, duration_min: a.durationMin ?? null,
    pickup: a.pickup || null, dropoff: a.dropoff || null,
    customer_name: a.customerName || null, customer_phone: a.customerPhone || null,
    price: a.price ?? null, payment_method: a.paymentMethod || null,
    driver_id: a.driverId || null, car_id: a.car || null, passengers: a.passengers ?? null,
    status: a.status || null, notes: a.notes || null,
    created_at: a.createdAt || null, assigned_at: a.assignedAt || null,
    accepted_at: a.acceptedAt || null, arrived_at: a.arrivedAt || null,
    completed_at: a.completedAt || null,
  }));

  await syncTable('schedule', prev.schedule, next.schedule, e => ({
    id: e.id, week_start: isoOnly(e.weekStart), driver_id: e.driverId || null,
    day: e.day, slot: e.slot, car_id: e.car || null,
  }));

  await syncTable('messages', prev.messages, next.messages, m => ({
    id: m.id, driver_id: m.driverId || null, sender: m.sender, text: m.text,
    at: m.at, read_by_admin: !!m.readByAdmin, read_by_driver: !!m.readByDriver,
  }));

  await syncTable('tameio_adjustments', prev.tameioAdjustments, next.tameioAdjustments, t => ({
    id: t.id, driver_id: t.driverId || null, amount: t.amount || 0,
    reason: t.reason || null, at: t.at,
  }));

  // Θέση ενεργής βάρδιας: δική της γραμμή, ώστε να μην ακουμπά τίποτα άλλο.
  for (const s of next.shifts || []) {
    if (s.status !== 'active' || !s.currentLocation) continue;
    const before = (prev.shifts || []).find(x => x.id === s.id);
    if (same(before?.currentLocation, s.currentLocation)) continue;
    await supabase.from('driver_positions').upsert({
      driver_id: s.driverId, shift_id: s.id,
      lat: s.currentLocation.lat, lng: s.currentLocation.lng,
      at: s.currentLocation.at || new Date().toISOString(),
    });
  }

  // Νέες γραμμές ιστορικού ενεργειών (μόνο προσθήκες).
  const prevAudit = new Set((prev.auditLog || []).map(l => `${l.at}|${l.action}`));
  const newAudit = (next.auditLog || []).filter(l => !prevAudit.has(`${l.at}|${l.action}`));
  if (newAudit.length) {
    await supabase.from('audit_log').insert(
      newAudit.map(l => ({ at: l.at, actor: l.actor, action: l.action }))
    );
  }

  // Ρυθμίσεις
  if (!same(prev.fareSettings, next.fareSettings) || prev.reportsResetAt !== next.reportsResetAt) {
    await supabase.from('settings').update({
      fare_flag_fall: next.fareSettings?.flagFall ?? 1.90,
      fare_per_km: next.fareSettings?.perKm ?? 1.65,
      fare_min: next.fareSettings?.minFare ?? 3.50,
      reports_reset_at: next.reportsResetAt || null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
  }
}

// ---------- Realtime ----------
// Αντικαθιστά το polling των 8 δευτερολέπτων.
export function subscribeToChanges(onChange) {
  const channel = supabase.channel('fleet-changes');
  ['shifts', 'appointments', 'driver_positions', 'messages', 'bookings', 'drivers', 'cars', 'schedule']
    .forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
