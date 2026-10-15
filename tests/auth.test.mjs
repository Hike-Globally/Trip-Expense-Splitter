// Sign up / sign in: the happy paths, the ways users get them wrong, and the
// accessibility wiring a form this important needs.
import { mount, byText, byLabel, fieldError, type, click, dbOf, dumpStorage } from "./lib/driver.mjs";
import { clickSubmit, signOut, signUpTab } from "./lib/browser.mjs";
import { check, section, startFile } from "./lib/report.mjs";

startFile("auth");

section("both options are on the first screen");
{
  const t = await mount();
  const tabs = t.qa('[role="tab"]').map((b) => b.textContent.trim());
  check("Sign in and Sign up are offered", tabs.join(",") === "Sign in,Sign up", tabs.join(" | "));
  check("sign in is the default", t.q('[role="tab"][aria-selected="true"]')?.textContent.trim() === "Sign in");
  check("the other mode is one tap away", !!byText(t, "Create one"));
}

section("sign up rejects bad input instead of creating a broken account");
{
  const t = await mount();
  await signUpTab(t);
  await type(t, "Name", "   ");
  await type(t, "Email", "ghost@new.com");
  await type(t, "Password", "longenough1");
  await type(t, "Confirm password", "longenough1");
  await clickSubmit(t);
  check("whitespace-only name is refused", !dbOf(t)?.users.some((u) => u.email === "ghost@new.com"));
  check("with an explanation on the field", !!fieldError(t, "Name"), fieldError(t, "Name") ?? "(none)");
}
{
  const t = await mount();
  await signUpTab(t);
  await type(t, "Name", "Ada Lovelace");
  await type(t, "Email", "ada@@example");
  await type(t, "Password", "short");
  await type(t, "Confirm password", "short2");
  const r = await clickSubmit(t);
  check("submit reaches app validation, not a native bubble", r.blocked === false);
  check("typo'd email is caught", !!fieldError(t, "Email"), fieldError(t, "Email") ?? "(none)");
  check("weak password is caught", !!fieldError(t, "Password"), fieldError(t, "Password") ?? "(none)");
  check("mismatched confirmation is caught", !!fieldError(t, "Confirm password"), fieldError(t, "Confirm password") ?? "(none)");
  check("nothing was saved", !dbOf(t)?.users.some((u) => u.name === "Ada Lovelace"));
  check("focus lands on the first problem", t.document.activeElement === byLabel(t, "Email"));

  await type(t, "Email", "ada@example.com");
  await type(t, "Password", "correct-horse");
  await type(t, "Confirm password", "correct-horse");
  check("messages clear while the user fixes them", !fieldError(t, "Email") && !fieldError(t, "Password") && !fieldError(t, "Confirm password"));
  await clickSubmit(t);
  check("a valid sign up succeeds", dbOf(t)?.users.some((u) => u.email === "ada@example.com"));
  check("and signs the new user straight in", t.text().includes("Your trips"), t.text().slice(0, 40));
}

section("accounts are stored cleanly");
{
  const t = await mount();
  await signUpTab(t);
  await type(t, "Name", "  Grace    Hopper ");
  await type(t, "Email", "  Grace@Example.COM ");
  await type(t, "Password", "longenough1");
  await type(t, "Confirm password", "longenough1");
  await clickSubmit(t);
  const u = dbOf(t)?.users.find((x) => x.email === "grace@example.com");
  check("name whitespace collapsed, email lowercased", u?.name === "Grace Hopper", JSON.stringify(u && { name: u.name, email: u.email }));
  const chip = t.q('[aria-label^="Account menu for"]');
  check("profile chip shows the right initial", chip?.textContent.trim().startsWith("G"), chip?.textContent.trim() ?? "(none)");
}

section("an email that already has an account points at sign in");
{
  const t = await mount();
  await signUpTab(t);
  await type(t, "Name", "Alice Clone");
  await type(t, "Email", "ALICE@demo.com");
  await type(t, "Password", "longenough1");
  await type(t, "Confirm password", "longenough1");
  await clickSubmit(t);
  check("duplicate is reported", /already exists/i.test(t.q('[role="alert"]')?.textContent ?? ""), t.q('[role="alert"]')?.textContent ?? "(none)");
  const shortcut = byText(t, "Sign in instead");
  check("a Sign in instead shortcut is offered", !!shortcut);
  if (shortcut) {
    await click(t, shortcut);
    check("it switches to the Sign in tab", t.q('[role="tab"][aria-selected="true"]')?.textContent.trim() === "Sign in");
    check("keeping the email the user typed", byLabel(t, "Email").value === "ALICE@demo.com", byLabel(t, "Email").value);
  }
}

section("the demo accounts are still easy to reach");
{
  const t = await mount();
  await click(t, byText(t, "Try a demo account"));
  const alice = byText(t, "Alice", ".chip");
  check("a demo chip is offered", !!alice);
  await click(t, alice);
  const r = await clickSubmit(t);
  check("it fills the form and signs in", r.blocked === false && t.text().includes("Your trips"), t.text().slice(0, 40));
  check("session is for the demo user", t.window.sessionStorage.getItem("splitide-session-v1") === "u-alice");
  await signOut(t);
  check("signing out clears the tab session", t.window.sessionStorage.getItem("splitide-session-v1") === null);
}

section("sign in failures are explained");
{
  const t = await mount();
  await type(t, "Email", "alice@demo.com");
  await type(t, "Password", "wrong-one");
  await clickSubmit(t);
  check("wrong password is reported", /Wrong email or password/i.test(t.q('[role="alert"]')?.textContent ?? ""), t.q('[role="alert"]')?.textContent ?? "(none)");
  check("and the user stays signed out", t.window.sessionStorage.getItem("splitide-session-v1") === null);

  await type(t, "Email", "nobody@nowhere.com");
  await clickSubmit(t);
  check("unknown email is named on the field", /No account for this email/i.test(fieldError(t, "Email") ?? ""), fieldError(t, "Email") ?? "(none)");
  check("with a pointer to sign up", !!byText(t, "Create one"));
}

section("password entry is usable");
{
  const t = await mount();
  check("starts masked", byLabel(t, "Password").type === "password");
  const toggle = t.q(".pw-toggle");
  check("has a show/hide control", !!toggle, toggle?.getAttribute("aria-label") ?? "(none)");
  await click(t, toggle);
  check("reveals the password", byLabel(t, "Password").type === "text");
  check("and reports pressed state", t.q(".pw-toggle").getAttribute("aria-pressed") === "true");
  await click(t, toggle);
  check("hides it again", byLabel(t, "Password").type === "password");
}

section("form is wired for assistive tech");
{
  const t = await mount();
  await signUpTab(t);
  const inputs = t.qa(".auth-card input");
  const labelled = inputs.filter((i) => i.id && t.document.querySelector(`label[for="${i.id}"]`));
  check("every field has a real label", labelled.length === inputs.length, `${labelled.length}/${inputs.length}`);
  check("password autocomplete hints at new-password", byLabel(t, "Password").autocomplete === "new-password", byLabel(t, "Password").autocomplete);
  const pwHintId = byLabel(t, "Password").getAttribute("aria-describedby") ?? "";
  check(
    "hints are linked before there is an error",
    /At least 8 characters/.test(t.document.getElementById(pwHintId)?.textContent ?? ""),
    t.document.getElementById(pwHintId)?.textContent ?? "(none)"
  );
  await clickSubmit(t);
  const name = byLabel(t, "Name");
  check("invalid fields are marked aria-invalid", name.getAttribute("aria-invalid") === "true");
  check("and described by their message", !!t.document.getElementById(name.getAttribute("aria-describedby") ?? ""));
  const live = t.q('[role="alert"]');
  check("errors are announced", !!live, live?.textContent.trim() ?? "(none)");
  check("and name the fields to fix", /Name, Email, Password and Confirm password fields/.test(live?.textContent ?? ""), live?.textContent.trim() ?? "(none)");
  const tablist = t.q('[role="tablist"]');
  await t.act(async () => {
    tablist.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  check("arrow keys switch tabs", t.q('[role="tab"][aria-selected="true"]')?.textContent.trim() === "Sign up");
}

section("sessions survive a reload");
{
  const t = await mount();
  await type(t, "Email", "alice@demo.com");
  await type(t, "Password", "demo123");
  await clickSubmit(t);
  const reloaded = await mount("http://localhost:5173/", {
    local: dumpStorage(t.window.localStorage),
    session: dumpStorage(t.window.sessionStorage),
  });
  check("reload keeps you signed in", reloaded.text().includes("Your trips"));
  check("as the same person", reloaded.q('[aria-label^="Account menu for"]')?.getAttribute("aria-label") === "Account menu for Alice Chen");

  await signOut(reloaded);
  const afterSignOut = await mount("http://localhost:5173/", {
    local: dumpStorage(reloaded.window.localStorage),
    session: dumpStorage(reloaded.window.sessionStorage),
  });
  check("sign out survives a reload", !!afterSignOut.q('[role="tab"]'), afterSignOut.text().slice(0, 40));
}
