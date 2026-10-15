// Databases written by the previous release (one shared session, no scope
// marker) must keep working — and must not leak that session into new tabs.
import { mount, type, dumpStorage } from "./lib/driver.mjs";
import { clickSubmit } from "./lib/browser.mjs";
import { check, section, startFile } from "./lib/report.mjs";

startFile("legacy");

const KEY = "splitide-db-v1";

function legacyDb({ signedInAs = "u-alice" } = {}) {
  return {
    users: [
      { id: "u-alice", name: "Alice Chen", email: "alice@demo.com", password: "demo123" },
      { id: "u-bob", name: "Bob Rivera", email: "bob@demo.com", password: "demo123" },
    ],
    trips: [
      {
        id: "t-kathmandu",
        name: "Kathmandu long weekend",
        destination: "Kathmandu, Nepal",
        startDate: "2026-10-10",
        endDate: "2026-10-13",
        homeCurrency: "USD",
        inviteCode: "KTM-DEMO",
        ownerId: "u-alice",
        members: [
          { userId: "u-alice", name: "Alice Chen", email: "alice@demo.com" },
          { userId: "u-bob", name: "Bob Rivera", email: "bob@demo.com" },
        ],
        expenses: [],
        settlements: [],
        createdAt: "2026-10-14T10:00:00.000Z",
      },
    ],
    sessionUserId: signedInAs,
    notifications: [],
  };
}

section("upgrading from the shared-session release");
{
  const t = await mount("http://localhost:5173/", { local: [[KEY, JSON.stringify(legacyDb())]] });
  check("the existing session carries over", t.text().includes("Your trips") && t.text().includes("Alice Chen"), t.text().slice(0, 40));
  check("the database is re-marked as tab scoped", JSON.parse(t.window.localStorage.getItem(KEY)).sessionScope === "tab");
  check("this tab owns the session", t.window.sessionStorage.getItem("splitide-session-v1") === "u-alice");

  const second = await mount("http://localhost:5173/", { local: dumpStorage(t.window.localStorage) });
  check("a tab opened later starts signed out", !!second.q('[role="tab"]'), second.text().slice(0, 40));

  const reloaded = await mount("http://localhost:5173/", {
    local: dumpStorage(t.window.localStorage),
    session: dumpStorage(t.window.sessionStorage),
  });
  check("the original tab stays signed in on reload", reloaded.text().includes("Your trips"));
  check("as the same user", reloaded.q('[aria-label^="Account menu for"]')?.getAttribute("aria-label") === "Account menu for Alice Chen");
}

section("legacy database with nobody signed in");
{
  const t = await mount("http://localhost:5173/", { local: [[KEY, JSON.stringify(legacyDb({ signedInAs: null }))]] });
  check("shows the auth screen", !!t.q('[role="tab"]'), t.text().slice(0, 40));
  await type(t, "Email", "alice@demo.com");
  await type(t, "Password", "demo123");
  await clickSubmit(t);
  check("and the old accounts still sign in", t.text().includes("Your trips"));
}

section("a session pointing at an account that no longer exists");
{
  const t = await mount();
  await type(t, "Email", "alice@demo.com");
  await type(t, "Password", "demo123");
  await clickSubmit(t);
  check("signed in to start with", t.text().includes("Your trips"));

  const db = JSON.parse(t.window.localStorage.getItem(KEY));
  db.users = db.users.filter((u) => u.id !== "u-alice");
  const raw = JSON.stringify(db);
  t.window.localStorage.setItem(KEY, raw);
  await t.act(async () => {
    t.window.dispatchEvent(new t.window.StorageEvent("storage", { key: KEY, newValue: raw }));
  });
  check("the ghost user is signed out", !!t.q('[role="tab"]'), t.text().slice(0, 40));
  check("and the stale tab session is cleared", t.window.sessionStorage.getItem("splitide-session-v1") === null);
}

section("storage that is not a database");
{
  const t = await mount("http://localhost:5173/", { local: [[KEY, "{not json"]] });
  check("falls back to a working app", !!t.q('[role="tab"]'), t.text().slice(0, 40));
  check("and repairs storage", (JSON.parse(t.window.localStorage.getItem(KEY)).users ?? []).length >= 3);
}
