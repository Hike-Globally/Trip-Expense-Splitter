// Two people, one browser: each tab keeps its own session, while trips keep
// syncing between them. Also covers invite links and cross-account leaks.
import { mount, byText, type, click, dbOf, dumpStorage, activateTab } from "./lib/driver.mjs";
import { clickSubmit, signOut, signUpTab } from "./lib/browser.mjs";
import { check, section, startFile } from "./lib/report.mjs";

startFile("sessions");

/** Emulate the browser telling this tab that another tab saved the database. */
async function otherTabSaved(t, rawDb) {
  activateTab(t);
  t.window.localStorage.setItem("splitide-db-v1", rawDb);
  await t.act(async () => {
    t.window.dispatchEvent(
      new t.window.StorageEvent("storage", { key: "splitide-db-v1", newValue: rawDb })
    );
  });
}

const signInAs = async (email) => {
  const t = await mount();
  await type(t, "Email", email);
  await type(t, "Password", "demo123");
  await clickSubmit(t);
  return t;
};

const who = (t) => t.q('[aria-label^="Account menu for"]')?.getAttribute("aria-label") ?? "(signed out)";

section("two tabs, two accounts");
const alice = await signInAs("alice@demo.com");
const bob = await signInAs("bob@demo.com");
check("tab A is Alice", who(alice) === "Account menu for Alice Chen", who(alice));
check("tab B is Bob", who(bob) === "Account menu for Bob Rivera", who(bob));
check("each tab stores its own session", alice.window.sessionStorage.getItem("splitide-session-v1") === "u-alice" && bob.window.sessionStorage.getItem("splitide-session-v1") === "u-bob");

section("one tab signing out does not sign the other one out");
await signOut(bob);
check("Bob is back at the auth screen", !!bob.q('[role="tab"]'));
await otherTabSaved(alice, bob.window.localStorage.getItem("splitide-db-v1"));
check("Alice is untouched", who(alice) === "Account menu for Alice Chen", who(alice));

section("one tab signing in does not take over the other");
const cara = await signInAs("cara@demo.com");
check("Cara is signed in", who(cara) === "Account menu for Cara Thapa", who(cara));
await otherTabSaved(alice, cara.window.localStorage.getItem("splitide-db-v1"));
check("Alice is still Alice", who(alice) === "Account menu for Alice Chen", who(alice));

section("trips still sync live between the tabs");
{
  await type(bob, "Email", "bob@demo.com");
  await type(bob, "Password", "demo123");
  await clickSubmit(bob);
  await click(bob, bob.qa(".grid-trips .card")[0]);
  check("Bob opened the shared trip", /Kathmandu/.test(bob.text()));

  await click(alice, alice.qa(".grid-trips .card")[0]);
  await click(alice, alice.q(".fab"));
  await type(alice, "What", "Sunrise taxi");
  await type(alice, "Amount", "25");
  await click(alice, byText(alice, "Save"));
  const saved = dbOf(alice);
  check("Alice logged an expense", saved.trips[0].expenses.some((e) => e.title === "Sunrise taxi"), saved.trips[0].expenses.map((e) => e.title).join(","));

  await otherTabSaved(bob, alice.window.localStorage.getItem("splitide-db-v1"));
  check("Bob's tab shows it", /Sunrise taxi/.test(bob.text()));
  check("and Bob is still Bob after the sync", who(bob) === "Account menu for Bob Rivera", who(bob));
  check("the expense survived being shared", dbOf(bob).trips[0].expenses.some((e) => e.title === "Sunrise taxi"));
}

section("the trip header still works");
{
  check("account menu is in the trip header", !!alice.q('[aria-label^="Account menu"]'));
  const bell = alice.q('[aria-label^="Notifications"]');
  check("notifications bell is still there", !!bell, bell?.getAttribute("aria-label") ?? "(none)");
  await click(alice, bell);
  check("and still opens the sheet", /Mark all read/.test(alice.text()));
  await click(alice, alice.q(".overlay"));
  check("sheet closes again", !/Mark all read/.test(alice.text()));

  const nav = alice.qa(".desktop-nav .tab");
  check("trip tabs are still there", nav.length === 4, nav.map((b) => b.textContent.trim()).join(","));
  await click(alice, nav.find((b) => b.textContent.trim() === "balances"));
  check("balances tab renders", /Positive means the trip owes them/.test(alice.text()));
  await click(alice, nav.find((b) => b.textContent.trim() === "settle"));
  check("settle tab renders", /Settle up|Fewest payments/i.test(alice.text()), alice.text().slice(-80));
  await click(alice, nav.find((b) => b.textContent.trim() === "expenses"));
  check("expenses tab still lists what was logged", /Sunrise taxi/.test(alice.text()));
}

section("sign out is reachable from inside a trip");
{
  await signOut(alice);
  check("and returns to the auth screen", !!alice.q('[role="tab"]'), alice.text().slice(0, 40));
}

section("the next person does not inherit the previous trip");
{
  const zoe = await mount();
  await signUpTab(zoe);
  await type(zoe, "Name", "Zoe Outsider");
  await type(zoe, "Email", "zoe@new.com");
  await type(zoe, "Password", "longenough1");
  await type(zoe, "Confirm password", "longenough1");
  await clickSubmit(zoe);
  check("lands on her own (empty) trip list", zoe.text().includes("No trips yet"), zoe.text().slice(0, 60));
  check("cannot see a trip she never joined", !/Kathmandu long weekend/.test(zoe.text()));
  check("and has no way to add expenses to it", !zoe.q(".fab"));
  check("the shared database still lists every account", dbOf(zoe).users.length >= 3, `${dbOf(zoe).users.length} accounts`);
}

section("a brand-new tab starts signed out");
{
  const newTab = await mount("http://localhost:5173/", { local: dumpStorage(cara.window.localStorage) });
  check("asks who you are instead of inheriting a session", !!newTab.q('[role="tab"]'), newTab.text().slice(0, 40));
}

section("invite links work before and during sign up");
{
  const invited = await mount("http://localhost:5173/?join=KTM-DEMO");
  check("the invite code is shown on the auth screen", /KTM-DEMO/.test(invited.q(".auth-invite")?.textContent ?? ""), invited.q(".auth-invite")?.textContent ?? "(no banner)");
  check("and explains what happens next", /join the trip/i.test(invited.text()));

  await signUpTab(invited);
  await type(invited, "Name", "Dana Link");
  await type(invited, "Email", "dana@new.com");
  await type(invited, "Password", "longenough1");
  await type(invited, "Confirm password", "longenough1");
  await clickSubmit(invited);
  const trip = dbOf(invited).trips.find((t) => t.id === "t-kathmandu");
  check("signing up through the link joins the trip", trip.members.some((m) => m.email === "dana@new.com"), trip.members.map((m) => m.email).join(","));
  check("and drops them into the trip", /Kathmandu/.test(invited.text()), invited.text().slice(0, 40));
}
