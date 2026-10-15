import type { DB, Trip, User, Expense, Settlement } from "./types";
import { convert } from "./fx";

const KEY = "splitide-db-v1";

function uid(): string {
  return crypto.randomUUID();
}

function seed(): DB {
  const alice: User = {
    id: "u-alice",
    name: "Alice Chen",
    email: "alice@demo.com",
    password: "demo123",
  };
  const bob: User = {
    id: "u-bob",
    name: "Bob Rivera",
    email: "bob@demo.com",
    password: "demo123",
  };
  const cara: User = {
    id: "u-cara",
    name: "Cara Thapa",
    email: "cara@demo.com",
    password: "demo123",
  };

  const trip: Trip = {
    id: "t-kathmandu",
    name: "Kathmandu long weekend",
    destination: "Kathmandu, Nepal",
    startDate: "2026-10-10",
    endDate: "2026-10-13",
    homeCurrency: "USD",
    inviteCode: "KTM-DEMO",
    ownerId: alice.id,
    members: [
      { userId: alice.id, name: alice.name, email: alice.email },
      { userId: bob.id, name: bob.name, email: bob.email },
      { userId: cara.id, name: cara.name, email: cara.email },
    ],
    expenses: [
      {
        id: uid(),
        title: "Thamel dinner",
        amount: 8400,
        currency: "NPR",
        paidBy: cara.id,
        date: "2026-10-11",
        notes: "Momos + tongba",
        participants: [alice.id, bob.id, cara.id],
        splitType: "equal",
        splits: [],
      },
      {
        id: uid(),
        title: "Airport taxis",
        amount: 45,
        currency: "USD",
        paidBy: alice.id,
        date: "2026-10-10",
        notes: "",
        participants: [alice.id, bob.id, cara.id],
        splitType: "shares",
        splits: [
          { userId: alice.id, value: 1 },
          { userId: bob.id, value: 1 },
          { userId: cara.id, value: 2 },
        ],
      },
      {
        id: uid(),
        title: "Patan museum",
        amount: 32,
        currency: "EUR",
        paidBy: bob.id,
        date: "2026-10-12",
        notes: "",
        participants: [alice.id, bob.id],
        splitType: "percent",
        splits: [
          { userId: alice.id, value: 40 },
          { userId: bob.id, value: 60 },
        ],
      },
    ],
    settlements: [],
    createdAt: new Date().toISOString(),
  };

  return {
    users: [alice, bob, cara],
    trips: [trip],
    sessionUserId: null,
  };
}

export function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const d = seed();
      save(d);
      return d;
    }
    return JSON.parse(raw) as DB;
  } catch {
    const d = seed();
    save(d);
    return d;
  }
}

export function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function register(db: DB, name: string, email: string, password: string): User {
  const exists = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) throw new Error("An account with that email already exists.");
  const user: User = { id: uid(), name: name.trim(), email: email.trim().toLowerCase(), password };
  db.users.push(user);
  db.sessionUserId = user.id;
  save(db);
  return user;
}

export function login(db: DB, email: string, password: string): User {
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) throw new Error("Wrong email or password.");
  db.sessionUserId = user.id;
  save(db);
  return user;
}

export function logout(db: DB) {
  db.sessionUserId = null;
  save(db);
}

export function createTrip(
  db: DB,
  owner: User,
  data: { name: string; destination: string; startDate: string; endDate: string; homeCurrency: string }
): Trip {
  const trip: Trip = {
    id: uid(),
    name: data.name.trim(),
    destination: data.destination.trim(),
    startDate: data.startDate,
    endDate: data.endDate,
    homeCurrency: data.homeCurrency,
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    ownerId: owner.id,
    members: [{ userId: owner.id, name: owner.name, email: owner.email }],
    expenses: [],
    settlements: [],
    createdAt: new Date().toISOString(),
  };
  db.trips.push(trip);
  save(db);
  return trip;
}

export function joinTrip(db: DB, user: User, code: string): Trip {
  const trip = db.trips.find((t) => t.inviteCode.toUpperCase() === code.trim().toUpperCase());
  if (!trip) throw new Error("No trip with that invite code.");
  if (!trip.members.some((m) => m.userId === user.id)) {
    trip.members.push({ userId: user.id, name: user.name, email: user.email });
  }
  save(db);
  return trip;
}

export function addExpense(db: DB, tripId: string, exp: Omit<Expense, "id">): Expense {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error("Trip not found");
  convert(exp.amount, exp.currency, trip.homeCurrency);
  const full: Expense = { ...exp, id: uid() };
  trip.expenses.unshift(full);
  save(db);
  return full;
}

export function updateExpense(db: DB, tripId: string, exp: Expense) {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  convert(exp.amount, exp.currency, trip.homeCurrency);
  trip.expenses = trip.expenses.map((e) => (e.id === exp.id ? exp : e));
  save(db);
}

export function deleteExpense(db: DB, tripId: string, expId: string) {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  trip.expenses = trip.expenses.filter((e) => e.id !== expId);
  save(db);
}

export function upsertSettlements(db: DB, tripId: string, suggested: Settlement[]) {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const paid = trip.settlements.filter((s) => s.paid);
  trip.settlements = [...paid, ...suggested.filter((s) => !paid.some((p) => p.id === s.id))];
  save(db);
}

export function markSettlement(db: DB, tripId: string, id: string, paid: boolean) {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  trip.settlements = trip.settlements.map((s) =>
    s.id === id ? { ...s, paid, markedAt: paid ? new Date().toISOString() : undefined } : s
  );
  save(db);
}

export function addSuggested(
  db: DB,
  tripId: string,
  from: string,
  to: string,
  amountHome: number
) {
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  trip.settlements.push({
    id: uid(),
    from,
    to,
    amountHome,
    paid: false,
  });
  save(db);
}

export { uid };
