import { useEffect, useMemo, useState } from "react";
import type { DB, Expense, SplitType, Trip, User, Comment } from "./types";
import { CATEGORIES } from "./types";
import * as store from "./store";
import { CURRENCIES, convert, formatMoney } from "./fx";
import { balances, simplify } from "./settle";
import { broadcast, subscribe } from "./sync";
import { payOptions } from "./payments";

type Tab = "home" | "expenses" | "balances" | "settle";

type EditState = { exp: Expense | null; isNew: boolean } | null;

export default function App() {
  const [db, setDb] = useState<DB>(() => store.load());
  const user = db.users.find((u) => u.id === db.sessionUserId) ?? null;
  const [tripId, setTripId] = useState<string | null>(null);
  const trip = db.trips.find((t) => t.id === tripId) ?? null;
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get("join");
    } catch {
      return null;
    }
  });

  function refresh(next: DB) {
    store.save(next);
    broadcast(next);
    setDb({ ...next, users: [...next.users], trips: [...next.trips], notifications: [...(next.notifications ?? [])] });
  }

  useEffect(() => {
    const unsub = subscribe((next) => {
      setDb({ ...next, users: [...next.users], trips: [...next.trips], notifications: [...(next.notifications ?? [])] });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !pendingJoin) return;
    try {
      const current = store.load();
      const t = store.joinTrip(current, user, pendingJoin);
      refresh(current);
      setTripId(t.id);
      setPendingJoin(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("join");
      window.history.replaceState({}, "", url.toString());
    } catch (ex) {
      alert((ex as Error).message);
      setPendingJoin(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingJoin]);

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
        initialCode={pendingJoin ?? undefined}
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
  initialCode,
  onOpen,
  onChange,
}: {
  db: DB;
  user: User;
  initialCode?: string;
  onOpen: (id: string) => void;
  onChange: (d: DB) => void;
}) {
  const mine = db.trips.filter((t) => t.members.some((m) => m.userId === user.id));
  const [showNew, setShowNew] = useState(false);
  const [showJoin, setShowJoin] = useState(!!initialCode);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    name: "",
    destination: "",
    startDate: "",
    endDate: "",
    homeCurrency: "USD",
  });
  const [code, setCode] = useState(initialCode ?? "");

  const unread = (db.notifications ?? []).filter((n) => n.userId === user.id && !n.read).length;

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
        <p className="sub">Create a trip or join with an invite code or link.</p>
        <div className="toolbar">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setShowNew(true)}>
            New trip
          </button>
          <button className="btn btn-ghost" onClick={() => setShowJoin(true)}>
            Join with code
          </button>
        </div>
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        {unread > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>Notifications ({unread})</h3>
            {(db.notifications ?? [])
              .filter((n) => n.userId === user.id)
              .slice(0, 5)
              .map((n) => (
                <div key={n.id} className="expense">
                  <div>
                    <div>{n.text}</div>
                    <div className="meta">{n.createdAt.slice(0, 16).replace("T", " ")}</div>
                  </div>
                  {!n.read && (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "auto", minHeight: 32 }}
                      onClick={() => {
                        store.markNotificationRead(db, n.id);
                        onChange(db);
                      }}
                    >
                      Read
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
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
  const [showExp, setShowExp] = useState<EditState>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWhoHere, setShowWhoHere] = useState(false);
  const [whoHere, setWhoHere] = useState<string[]>(trip.defaultParticipants ?? trip.members.map((m) => m.userId));

  const bals = useMemo(
    () => balances(trip.members, trip.expenses, trip.settlements, trip.homeCurrency),
    [trip]
  );
  const totalHome = trip.expenses.reduce(
    (a, e) => a + convert(e.amount, e.currency, trip.homeCurrency),
    0
  );
  const nameOf = (id: string) => trip.members.find((m) => m.userId === id)?.name ?? "—";

  const unread = (db.notifications ?? []).filter((n) => n.userId === user.id && !n.read).length;

  const shareLink = `${window.location.origin}${window.location.pathname}?join=${trip.inviteCode}`;

  function copyLink() {
    try {
      navigator.clipboard.writeText(shareLink);
      alert("Link copied");
    } catch {
      prompt("Copy this link", shareLink);
    }
  }

  function exportCSV() {
    const rows = [["Title", "Amount", "Currency", "Paid by", "Date", "Category", "Participants", "Notes"]];
    for (const e of trip.expenses) {
      rows.push([
        e.title,
        String(e.amount),
        e.currency,
        nameOf(e.paidBy),
        e.date,
        e.category ?? "",
        e.participants.map(nameOf).join(";"),
        e.notes,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = trip.expenses
      .map(
        (e) =>
          `<tr><td>${e.title}</td><td>${e.amount} ${e.currency}</td><td>${nameOf(e.paidBy)}</td><td>${e.date}</td><td>${e.category ?? ""}</td></tr>`
      )
      .join("");
    w.document.write(
      `<html><head><title>${trip.name}</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left}</style></head><body><h1>${trip.name}</h1><p>${trip.destination} · ${trip.homeCurrency}</p><table><thead><tr><th>Title</th><th>Amount</th><th>Paid by</th><th>Date</th><th>Category</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    );
    w.document.close();
    w.print();
  }

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
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "6px 12px", width: "auto" }}
            onClick={() => setShowNotifications(true)}
          >
            🔔 {unread > 0 ? unread : ""}
          </button>
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
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={copyLink}>
                Copy trip link
              </button>
              <a
                className="btn btn-ghost"
                style={{ width: "auto" }}
                href={`https://wa.me/?text=${encodeURIComponent("Join my trip: " + shareLink)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setShowWhoHere((v) => !v)}>
                Who's here
              </button>
              {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
                <button
                  className="btn btn-ghost"
                  style={{ width: "auto" }}
                  onClick={() => Notification.requestPermission()}
                >
                  Enable notifications
                </button>
              )}
            </div>

            {showWhoHere && (
              <div className="card" style={{ marginTop: 12 }}>
                <h3>Who's here tonight</h3>
                <p className="meta">Default participants for new expenses.</p>
                <div className="check-list" style={{ marginTop: 8 }}>
                  {trip.members.map((m) => (
                    <label key={m.userId}>
                      <input
                        type="checkbox"
                        checked={whoHere.includes(m.userId)}
                        onChange={() =>
                          setWhoHere((p) =>
                            p.includes(m.userId) ? p.filter((x) => x !== m.userId) : [...p, m.userId]
                          )
                        }
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    store.setDefaultParticipants(db, trip.id, whoHere);
                    onChange(db);
                    setShowWhoHere(false);
                  }}
                >
                  Save
                </button>
              </div>
            )}

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
                  <ExpenseRow key={e.id} e={e} trip={trip} nameOf={nameOf} onEdit={() => setShowExp({ exp: e, isNew: false })} />
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

            <div className="card" style={{ marginTop: 16 }}>
              <h3>Spending by category</h3>
              <PieChart trip={trip} />
            </div>
          </>
        )}

        {tab === "expenses" && (
          <>
            <h1 className="display">Expenses</h1>
            <div className="toolbar">
              <button
                className="btn btn-ghost"
                style={{ width: "auto" }}
                onClick={() => {
                  const last = trip.expenses[0];
                  if (!last) return;
                  const clone: Expense = {
                    ...last,
                    id: last.id,
                    title: last.title + " (copy)",
                    date: new Date().toISOString().slice(0, 10),
                    comments: [],
                  };
                  setShowExp({ exp: clone, isNew: true });
                }}
              >
                Clone last
              </button>
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={exportCSV}>
                Export CSV
              </button>
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={exportPDF}>
                Export PDF
              </button>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              {trip.expenses.map((e) => (
                <ExpenseRow key={e.id} e={e} trip={trip} nameOf={nameOf} onEdit={() => setShowExp({ exp: e, isNew: false })} />
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
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Spending by category</h3>
              <PieChart trip={trip} />
            </div>
          </>
        )}

        {tab === "settle" && (
          <SettleTab
            db={db}
            trip={trip}
            bals={bals}
            nameOf={nameOf}
            user={user}
            onChange={onChange}
          />
        )}
      </main>

      <button className="fab" aria-label="Add expense" onClick={() => setShowExp({ exp: null, isNew: true })}>
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
          db={db}
          existing={showExp.exp}
          isNew={showExp.isNew}
          onClose={() => setShowExp(null)}
          onSave={(exp) => {
            if (showExp.isNew) store.addExpense(db, trip.id, exp);
            else if (showExp.exp) store.updateExpense(db, trip.id, { ...exp, id: showExp.exp.id });
            onChange(db);
            setShowExp(null);
          }}
          onDelete={(id) => {
            store.deleteExpense(db, trip.id, id);
            onChange(db);
            setShowExp(null);
          }}
          onChange={onChange}
        />
      )}

      {showNotifications && (
        <div className="overlay" onClick={() => setShowNotifications(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="display" style={{ fontSize: "1.8rem", marginBottom: 12 }}>
              Notifications
            </h2>
            <button
              className="btn btn-ghost"
              style={{ width: "auto", marginBottom: 12 }}
              onClick={() => {
                store.markAllNotificationsRead(db, user.id);
                onChange(db);
              }}
            >
              Mark all read
            </button>
            {(db.notifications ?? []).filter((n) => n.userId === user.id).length === 0 && (
              <p className="meta">No notifications yet.</p>
            )}
            {(db.notifications ?? [])
              .filter((n) => n.userId === user.id)
              .map((n) => (
                <div key={n.id} className="expense">
                  <div>
                    <div style={{ opacity: n.read ? 0.6 : 1 }}>{n.text}</div>
                    <div className="meta">{n.createdAt.slice(0, 16).replace("T", " ")}</div>
                  </div>
                  {!n.read && (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "auto", minHeight: 32 }}
                      onClick={() => {
                        store.markNotificationRead(db, n.id);
                        onChange(db);
                      }}
                    >
                      Read
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
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
  const cat = CATEGORIES.find((c) => c.id === (e.category ?? "other"));
  return (
    <button className="expense" onClick={onEdit} style={{ width: "100%", textAlign: "left" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {e.receipt && (
          <img
            src={e.receipt}
            alt="receipt"
            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8 }}
          />
        )}
        <div>
          <div>
            {e.title}{" "}
            <span className="pill">{cat?.label ?? "Other"}</span>
            {(e.comments?.length ?? 0) > 0 && <span className="pill">💬 {e.comments!.length}</span>}
          </div>
          <div className="meta">
            {nameOf(e.paidBy)} · {e.date} · {e.splitType} · {e.participants.length} people
          </div>
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
  user,
  onChange,
}: {
  db: DB;
  trip: Trip;
  bals: ReturnType<typeof balances>;
  nameOf: (id: string) => string;
  user: User;
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
          .map((s) => {
            const opts = payOptions(s.amountHome, trip.homeCurrency, nameOf(s.to));
            return (
              <div key={s.id} className="expense" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                <div className="toolbar" style={{ marginTop: 8 }}>
                  {opts.map((o) => (
                    <a
                      key={o.label}
                      className="btn btn-ghost"
                      style={{ width: "auto", minHeight: 36 }}
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      title={o.note}
                    >
                      Pay with {o.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
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

function PieChart({ trip }: { trip: Trip }) {
  const totals: Record<string, number> = {};
  for (const e of trip.expenses) {
    const cat = e.category ?? "other";
    totals[cat] = (totals[cat] ?? 0) + convert(e.amount, e.currency, trip.homeCurrency);
  }
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total === 0) return <p className="meta">No expenses yet.</p>;

  const colors: Record<string, string> = {
    food: "#f4a261",
    stay: "#2a9d8f",
    transport: "#264653",
    activities: "#e9c46a",
    shopping: "#e76f51",
    other: "#8d99ae",
  };

  let acc = 0;
  const slices = entries.map(([cat, v]) => {
    const start = acc;
    acc += v / total;
    return { cat, v, start, end: acc };
  });

  function polar(cx: number, cy: number, r: number, frac: number) {
    const ang = (frac * 2 * Math.PI) - Math.PI / 2;
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
  }

  const cx = 80;
  const cy = 80;
  const r = 70;
  const paths = slices.map((s) => {
    const p0 = polar(cx, cy, r, s.start);
    const p1 = polar(cx, cy, r, s.end);
    const large = s.end - s.start > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
    return <path key={s.cat} d={d} fill={colors[s.cat] ?? "#888"} />;
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {paths}
      </svg>
      <div>
        {slices.map((s) => (
          <div key={s.cat} className="meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: colors[s.cat], display: "inline-block", borderRadius: 3 }} />
            {CATEGORIES.find((c) => c.id === s.cat)?.label ?? s.cat}: {formatMoney(s.v, trip.homeCurrency)} (
            {Math.round((s.v / total) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpenseSheet({
  trip,
  user,
  db,
  existing,
  isNew,
  onClose,
  onSave,
  onDelete,
  onChange,
}: {
  trip: Trip;
  user: User;
  db: DB;
  existing: Expense | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (e: Omit<Expense, "id">) => void;
  onDelete: (id: string) => void;
  onChange: (d: DB) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? trip.homeCurrency);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? user.id);
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [participants, setParticipants] = useState<string[]>(
    existing?.participants ?? trip.defaultParticipants ?? trip.members.map((m) => m.userId)
  );
  const [splitType, setSplitType] = useState<SplitType>(existing?.splitType ?? "equal");
  const [category, setCategory] = useState(existing?.category ?? "food");
  const [receipt, setReceipt] = useState<string | undefined>(existing?.receipt);
  const [splits, setSplits] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    trip.members.forEach((m) => (o[m.userId] = 1));
    existing?.splits.forEach((s) => (o[s.userId] = s.value));
    return o;
  });
  const [err, setErr] = useState("");
  const [commentText, setCommentText] = useState("");

  function toggle(id: string) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function handleReceipt(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReceipt(reader.result as string);
    reader.readAsDataURL(file);
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
    onSave({
      title: title.trim(),
      amount: amt,
      currency,
      paidBy,
      date,
      notes,
      participants,
      splitType,
      category: category as any,
      receipt,
      comments: existing?.comments ?? [],
      splits: participants.map((id) => ({ userId: id, value: splits[id] ?? 0 })),
    });
  }

  const savedExpense = !isNew && existing ? existing : null;

  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="display" style={{ fontSize: "1.8rem", marginBottom: 12 }}>
          {isNew ? "Log expense" : "Edit expense"}
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
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
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
          <label>Receipt photo</label>
          <input type="file" accept="image/*" onChange={(e) => handleReceipt(e.target.files?.[0] ?? null)} />
          {receipt && (
            <div style={{ marginTop: 8 }}>
              <img src={receipt} alt="receipt" style={{ maxWidth: "100%", borderRadius: 12 }} />
              <button type="button" className="btn btn-ghost" style={{ marginTop: 6, width: "auto" }} onClick={() => setReceipt(undefined)}>
                Remove photo
              </button>
            </div>
          )}
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit">
          Save
        </button>

        {savedExpense && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: "1.2rem" }}>Comments</h3>
            {(savedExpense.comments ?? []).map((c: Comment) => (
              <div key={c.id} className="expense">
                <div>
                  <div>{c.text}</div>
                  <div className="meta">
                    {trip.members.find((m) => m.userId === c.userId)?.name ?? "—"} · {c.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                {c.userId === user.id && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: "auto", minHeight: 32 }}
                    onClick={() => {
                      store.deleteComment(db, trip.id, savedExpense.id, c.id);
                      onChange(db);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="toolbar" style={{ marginTop: 8 }}>
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="I didn't drink…"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "auto" }}
                onClick={() => {
                  if (!commentText.trim()) return;
                  store.addComment(db, trip.id, savedExpense.id, user.id, commentText);
                  onChange(db);
                  setCommentText("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {existing && !isNew && (
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
