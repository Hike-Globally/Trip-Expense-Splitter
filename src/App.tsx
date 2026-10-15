import { useMemo, useState } from "react";
import type { DB, Expense, SplitType, Trip, User } from "./types";
import * as store from "./store";
import { CURRENCIES, convert, formatMoney } from "./fx";
import { balances, simplify } from "./settle";

type Tab = "home" | "expenses" | "balances" | "settle";

export default function App() {
  const [db, setDb] = useState<DB>(() => store.load());
  const user = db.users.find((u) => u.id === db.sessionUserId) ?? null;
  const [tripId, setTripId] = useState<string | null>(null);
  const trip = db.trips.find((t) => t.id === tripId) ?? null;

  function refresh(next: DB) {
    store.save(next);
    setDb({ ...next, users: [...next.users], trips: [...next.trips] });
  }

  if (!user) {
    return (
      <Auth
        db={db}
        onDone={(next) => {
          refresh(next);
        }}
      />
    );
  }

  if (!trip) {
    return (
      <TripList
        db={db}
        user={user}
        onOpen={(id) => setTripId(id)}
        onChange={refresh}
      />
    );
  }

  return (
    <TripView
      db={db}
      user={user}
      trip={trip}
      onBack={() => setTripId(null)}
      onChange={refresh}
    />
  );
}

function Auth({ db, onDone }: { db: DB; onDone: (d: DB) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      if (mode === "up") store.register(db, name, email, password);
      else store.login(db, email, password);
      onDone(db);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="brand">Splitide</div>
        <p className="lede">
          Split the dinner, the taxi, the temple tickets — in any currency. Settle in the fewest
          taps at the table.
        </p>
      </div>
      <div className="auth-card">
        <div className="tabs">
          <button className={`tab ${mode === "in" ? "on" : ""}`} onClick={() => setMode("in")}>
            Sign in
          </button>
          <button className={`tab ${mode === "up" ? "on" : ""}`} onClick={() => setMode("up")}>
            Create account
          </button>
        </div>
        {err && <div className="error">{err}</div>}
        <form onSubmit={submit}>
          {mode === "up" && (
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            {mode === "in" ? "Enter" : "Join Splitide"}
          </button>
        </form>
        <p className="hint">
          Demo accounts (password <b>demo123</b>): alice@demo.com, bob@demo.com, cara@demo.com.
          They share a seeded Kathmandu trip.
        </p>
      </div>
    </div>
  );
}

function TripList({
  db,
  user,
  onOpen,
  onChange,
}: {
  db: DB;
  user: User;
  onOpen: (id: string) => void;
  onChange: (d: DB) => void;
}) {
  const mine = db.trips.filter((t) => t.members.some((m) => m.userId === user.id));
  const [showNew, setShowNew] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    name: "",
    destination: "",
    startDate: "",
    endDate: "",
    homeCurrency: "USD",
  });
  const [code, setCode] = useState("");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-sm">Splitide</div>
        <div className="user-chip">
          <span className="avatar">{user.name[0]}</span>
          <span className="hide-xs">{user.name}</span>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "6px 12px", width: "auto" }}
            onClick={() => {
              store.logout(db);
              onChange(db);
            }}
          >
            Out
          </button>
        </div>
      </header>
      <main className="page">
        <h1 className="display">Your trips</h1>
        <p className="sub">Create a trip or join with an invite code.</p>
        <div className="toolbar">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setShowNew(true)}>
            New trip
          </button>
          <button className="btn btn-ghost" onClick={() => setShowJoin(true)}>
            Join with code
          </button>
        </div>
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        {mine.length === 0 ? (
          <div className="empty">
            <h3>No trips yet</h3>
            <p>Add the first dinner by starting a trip.</p>
          </div>
        ) : (
          <div className="grid-trips">
            {mine.map((t) => (
              <button key={t.id} className="card" onClick={() => onOpen(t.id)} style={{ textAlign: "left" }}>
                <h3>{t.name}</h3>
                <p className="meta">
                  {t.destination || "Somewhere lovely"} · {t.members.length} people · {t.homeCurrency}
                </p>
                <p className="meta">{t.expenses.length} expenses</p>
              </button>
            ))}
          </div>
        )}
      </main>

      {showNew && (
        <div className="overlay" onClick={() => setShowNew(false)}>
          <form
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              store.createTrip(db, user, form);
              onChange(db);
              setShowNew(false);
            }}
          >
            <h2 className="display" style={{ fontSize: "1.8rem", marginBottom: 12 }}>
              New trip
            </h2>
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Goa with the crew"
              />
            </div>
            <div className="field">
              <label>Destination</label>
              <input
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Home currency</label>
              <select
                value={form.homeCurrency}
                onChange={(e) => setForm({ ...form, homeCurrency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Start</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>End</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      {showJoin && (
        <div className="overlay" onClick={() => setShowJoin(false)}>
          <form
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setErr("");
              try {
                const t = store.joinTrip(db, user, code);
                onChange(db);
                setShowJoin(false);
                onOpen(t.id);
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            <h2 className="display" style={{ fontSize: "1.8rem", marginBottom: 12 }}>
              Join a trip
            </h2>
            <div className="field">
              <label>Invite code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KTM-DEMO" required />
            </div>
            <button className="btn btn-primary" type="submit">
              Join
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function TripView({
  db,
  user,
  trip,
  onBack,
  onChange,
}: {
  db: DB;
  user: User;
  trip: Trip;
  onBack: () => void;
  onChange: (d: DB) => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [showExp, setShowExp] = useState<Expense | "new" | null>(null);
  const bals = useMemo(
    () => balances(trip.members, trip.expenses, trip.settlements, trip.homeCurrency),
    [trip]
  );
  const totalHome = trip.expenses.reduce(
    (a, e) => a + convert(e.amount, e.currency, trip.homeCurrency),
    0
  );
  const nameOf = (id: string) => trip.members.find((m) => m.userId === id)?.name ?? "—";

  return (
    <div className="app">
      <header className="topbar">
        <button onClick={onBack} className="btn btn-ghost" style={{ width: "auto", minHeight: 40 }}>
          ← Trips
        </button>
        <nav className="desktop-nav">
          {(["home", "expenses", "balances", "settle"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="user-chip">
          <span className="avatar">{user.name[0]}</span>
        </div>
      </header>

      <main className="page page-wide">
        {tab === "home" && (
          <>
            <h1 className="display">{trip.name}</h1>
            <p className="sub">
              {trip.destination} · home {trip.homeCurrency} · invite{" "}
              <span className="invite">{trip.inviteCode}</span>
            </p>
            <div className="stats">
              <div className="stat">
                <div className="k">Spent</div>
                <div className="v">{formatMoney(totalHome, trip.homeCurrency)}</div>
              </div>
              <div className="stat">
                <div className="k">People</div>
                <div className="v">{trip.members.length}</div>
              </div>
              <div className="stat">
                <div className="k">Expenses</div>
                <div className="v">{trip.expenses.length}</div>
              </div>
              <div className="stat">
                <div className="k">Your net</div>
                <div className={`v ${(bals.find((b) => b.userId === user.id)?.net ?? 0) >= 0 ? "net-pos" : "net-neg"}`}>
                  {formatMoney(bals.find((b) => b.userId === user.id)?.net ?? 0, trip.homeCurrency)}
                </div>
              </div>
            </div>
            <div className="layout-2">
              <div className="card">
                <h3>Recent</h3>
                {trip.expenses.slice(0, 5).map((e) => (
                  <ExpenseRow key={e.id} e={e} trip={trip} nameOf={nameOf} onEdit={() => setShowExp(e)} />
                ))}
                {trip.expenses.length === 0 && (
                  <div className="empty">
                    <h3>Add the first dinner</h3>
                    <p>Log who paid and who ate.</p>
                  </div>
                )}
              </div>
              <div className="card">
                <h3>Crew</h3>
                {trip.members.map((m) => {
                  const b = bals.find((x) => x.userId === m.userId);
                  return (
                    <div key={m.userId} className="expense">
                      <span className="avatar">{m.name[0]}</span>
                      <div>
                        <div>{m.name}</div>
                        <div className="meta">{m.email}</div>
                      </div>
                      <div className={`exp-amt ${(b?.net ?? 0) >= 0 ? "net-pos" : "net-neg"}`}>
                        {formatMoney(b?.net ?? 0, trip.homeCurrency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "expenses" && (
          <>
            <h1 className="display">Expenses</h1>
            <div className="card" style={{ marginTop: 16 }}>
              {trip.expenses.map((e) => (
                <ExpenseRow key={e.id} e={e} trip={trip} nameOf={nameOf} onEdit={() => setShowExp(e)} />
              ))}
              {trip.expenses.length === 0 && (
                <div className="empty">
                  <h3>Nothing logged</h3>
                  <p>Tap + to add an expense.</p>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "balances" && (
          <>
            <h1 className="display">Balances</h1>
            <p className="sub">In {trip.homeCurrency}. Positive means the trip owes them.</p>
            <div className="card" style={{ marginTop: 16 }}>
              {bals.map((b) => (
                <div key={b.userId} className="expense">
                  <div>
                    <div>{b.name}</div>
                    <div className="meta">
                      paid {formatMoney(b.paid, trip.homeCurrency)} · share{" "}
                      {formatMoney(b.share, trip.homeCurrency)}
                    </div>
                  </div>
                  <div className={`exp-amt ${b.net >= 0 ? "net-pos" : "net-neg"}`}>
                    {formatMoney(b.net, trip.homeCurrency)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "settle" && (
          <SettleTab
            db={db}
            trip={trip}
            bals={bals}
            nameOf={nameOf}
            onChange={onChange}
          />
        )}
      </main>

      <button className="fab" aria-label="Add expense" onClick={() => setShowExp("new")}>
        +
      </button>

      <nav className="dock">
        {(["home", "expenses", "balances", "settle"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "home" ? "⌂" : t === "expenses" ? "☰" : t === "balances" ? "◎" : "⇄"}
            {t}
          </button>
        ))}
      </nav>

      {showExp && (
        <ExpenseSheet
          trip={trip}
          user={user}
          existing={showExp === "new" ? null : showExp}
          onClose={() => setShowExp(null)}
          onSave={(exp, isNew) => {
            if (isNew) store.addExpense(db, trip.id, exp);
            else store.updateExpense(db, trip.id, { ...exp, id: (showExp as Expense).id });
            onChange(db);
            setShowExp(null);
          }}
          onDelete={(id) => {
            store.deleteExpense(db, trip.id, id);
            onChange(db);
            setShowExp(null);
          }}
        />
      )}
    </div>
  );
}

function ExpenseRow({
  e,
  trip,
  nameOf,
  onEdit,
}: {
  e: Expense;
  trip: Trip;
  nameOf: (id: string) => string;
  onEdit: () => void;
}) {
  const home = convert(e.amount, e.currency, trip.homeCurrency);
  return (
    <button className="expense" onClick={onEdit} style={{ width: "100%", textAlign: "left" }}>
      <div>
        <div>{e.title}</div>
        <div className="meta">
          {nameOf(e.paidBy)} · {e.date} · {e.splitType} · {e.participants.length} people
        </div>
      </div>
      <div className="exp-amt">
        {formatMoney(e.amount, e.currency)}
        {e.currency !== trip.homeCurrency && (
          <div className="conv">→ {formatMoney(home, trip.homeCurrency)}</div>
        )}
      </div>
    </button>
  );
}

function SettleTab({
  db,
  trip,
  bals,
  nameOf,
  onChange,
}: {
  db: DB;
  trip: Trip;
  bals: ReturnType<typeof balances>;
  nameOf: (id: string) => string;
  onChange: (d: DB) => void;
}) {
  const suggested = simplify(bals);

  function ensureSuggested() {
    const unpaid = trip.settlements.filter((s) => !s.paid);
    if (unpaid.length === 0 && suggested.length) {
      suggested.forEach((s) => store.addSuggested(db, trip.id, s.from, s.to, s.amount));
      onChange(db);
    }
  }

  return (
    <>
      <h1 className="display">Settle up</h1>
      <p className="sub">Fewest payments so everyone is even, in {trip.homeCurrency}.</p>
      <div className="toolbar">
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={ensureSuggested}>
          Refresh suggestions
        </button>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>To pay</h3>
        {trip.settlements.filter((s) => !s.paid).length === 0 && suggested.length === 0 && (
          <p className="meta">You’re all square.</p>
        )}
        {trip.settlements
          .filter((s) => !s.paid)
          .map((s) => (
            <div key={s.id} className="expense">
              <div>
                {nameOf(s.from)} → {nameOf(s.to)}
                <div className="meta">{formatMoney(s.amountHome, trip.homeCurrency)}</div>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "auto", minHeight: 40 }}
                onClick={() => {
                  store.markSettlement(db, trip.id, s.id, true);
                  onChange(db);
                }}
              >
                Mark paid
              </button>
            </div>
          ))}
        {trip.settlements.filter((s) => !s.paid).length === 0 &&
          suggested.map((s, i) => (
            <div key={i} className="expense">
              <div>
                {nameOf(s.from)} → {nameOf(s.to)}
                <div className="meta">{formatMoney(s.amount, trip.homeCurrency)}</div>
              </div>
              <span className="pill">suggested</span>
            </div>
          ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Paid</h3>
        {trip.settlements.filter((s) => s.paid).map((s) => (
          <div key={s.id} className="expense">
            <div>
              {nameOf(s.from)} → {nameOf(s.to)}
              <div className="meta">
                {formatMoney(s.amountHome, trip.homeCurrency)} · {s.markedAt?.slice(0, 10)}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              style={{ width: "auto", minHeight: 40 }}
              onClick={() => {
                store.markSettlement(db, trip.id, s.id, false);
                onChange(db);
              }}
            >
              Undo
            </button>
          </div>
        ))}
        {trip.settlements.filter((s) => s.paid).length === 0 && <p className="meta">No payments marked yet.</p>}
      </div>
    </>
  );
}

function ExpenseSheet({
  trip,
  user,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  trip: Trip;
  user: User;
  existing: Expense | null;
  onClose: () => void;
  onSave: (e: Omit<Expense, "id">, isNew: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? trip.homeCurrency);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? user.id);
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [participants, setParticipants] = useState<string[]>(
    existing?.participants ?? trip.members.map((m) => m.userId)
  );
  const [splitType, setSplitType] = useState<SplitType>(existing?.splitType ?? "equal");
  const [splits, setSplits] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    trip.members.forEach((m) => (o[m.userId] = 1));
    existing?.splits.forEach((s) => (o[s.userId] = s.value));
    return o;
  });
  const [err, setErr] = useState("");

  function toggle(id: string) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const amt = Number(amount);
    if (!title.trim() || !(amt > 0) || participants.length === 0) {
      setErr("Need a title, amount, and at least one person.");
      return;
    }
    if (splitType === "percent") {
      const sum = participants.reduce((a, id) => a + (splits[id] || 0), 0);
      if (Math.abs(sum - 100) > 0.05) {
        setErr(`Percentages must sum to 100 (now ${sum}).`);
        return;
      }
    }
    if (splitType === "exact") {
      const sum = participants.reduce((a, id) => a + (splits[id] || 0), 0);
      if (Math.abs(sum - amt) > 0.05) {
        setErr(`Exact amounts must sum to ${amt} (now ${sum}).`);
        return;
      }
    }
    try {
      convert(amt, currency, trip.homeCurrency);
    } catch {
      setErr("No FX rate for that currency.");
      return;
    }
    onSave(
      {
        title: title.trim(),
        amount: amt,
        currency,
        paidBy,
        date,
        notes,
        participants,
        splitType,
        splits: participants.map((id) => ({ userId: id, value: splits[id] ?? 0 })),
      },
      !existing
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="display" style={{ fontSize: "1.8rem", marginBottom: 12 }}>
          {existing ? "Edit expense" : "Log expense"}
        </h2>
        {err && <div className="error">{err}</div>}
        <div className="field">
          <label>What</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner" />
        </div>
        <div className="field">
          <label>Amount</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="field">
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {amount && currency !== trip.homeCurrency && Number(amount) > 0 && (
          <p className="meta" style={{ marginBottom: 12 }}>
            → {formatMoney(convert(Number(amount) || 0, currency, trip.homeCurrency), trip.homeCurrency)}
          </p>
        )}
        <div className="field">
          <label>Paid by</label>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {trip.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>For</label>
          <div className="check-list">
            {trip.members.map((m) => (
              <label key={m.userId}>
                <input
                  type="checkbox"
                  checked={participants.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Split</label>
          <select value={splitType} onChange={(e) => setSplitType(e.target.value as SplitType)}>
            <option value="equal">Equal</option>
            <option value="shares">Shares</option>
            <option value="percent">Percentages</option>
            <option value="exact">Exact amounts</option>
          </select>
        </div>
        {splitType !== "equal" && (
          <div className="split-grid" style={{ marginBottom: 14 }}>
            {participants.map((id) => (
              <div className="split-row" key={id}>
                <span>{trip.members.find((m) => m.userId === id)?.name}</span>
                <input
                  inputMode="decimal"
                  value={splits[id] ?? ""}
                  onChange={(e) => setSplits({ ...splits, [id]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        )}
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit">
          Save
        </button>
        {existing && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => onDelete(existing.id)}
          >
            Delete
          </button>
        )}
      </form>
    </div>
  );
}
