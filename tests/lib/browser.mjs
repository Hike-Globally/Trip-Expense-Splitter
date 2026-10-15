// Emulates real-browser submit behaviour: the browser blocks submit when the
// form fails constraint validation, so we must not dispatch in that case.
import { mount, byText, byLabel, fieldError, type, click, setValue, activateTab } from "./driver.mjs";

export async function clickSubmit(t) {
  activateTab(t);
  const form = t.q("form");
  const btn = form.querySelector('button[type="submit"]') ?? byText(t, "Enter") ?? byText(t, "Join Splitide");
  const invalid = [];
  // A form with novalidate hands validation to the app: the browser submits it.
  if (!form.noValidate && form.checkValidity && !form.checkValidity()) {
    for (const el of t.qa("input, select, textarea")) {
      if (!el.checkValidity()) {
        invalid.push({
          label: (el.closest(".field")?.querySelector("label")?.textContent ?? el.name ?? el.type).trim(),
          name: el.name ?? el.id ?? el.type,
          value: el.value,
          type: el.type,
          validationMessage: el.validationMessage,
        });
      }
    }
  }
  if (invalid.length) return { blocked: true, invalid };
  await click(t, btn);
  return { blocked: false, invalid: [] };
}

/** Open the account menu and sign out. */
export async function signOut(t) {
  activateTab(t);
  const chip = t.q('[aria-label^="Account menu"]');
  if (!chip) throw new Error("no account menu button on screen");
  await click(t, chip);
  const btn = byText(t, "Sign out");
  if (!btn) throw new Error("account menu has no Sign out item");
  await click(t, btn);
}

/** Switch the auth screen to the sign-up tab. */
export async function signUpTab(t) {
  activateTab(t);
  const tab = t.qa('[role="tab"]').find((b) => b.textContent.trim() === "Sign up");
  if (!tab) throw new Error("no Sign up tab");
  await click(t, tab);
}
