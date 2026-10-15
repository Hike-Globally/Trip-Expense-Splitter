/** Shared account validation, used by both the auth form and the store so a
 *  bad account can never be created through any code path. */

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
export const MAX_NAME = 60;

export interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  confirm?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/** Collapse runs of whitespace so "Ada   Lovelace" is stored as "Ada Lovelace". */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Deliberately strict enough to catch typos, not to police exotic addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validateName(raw: string): string | undefined {
  const name = normalizeName(raw);
  if (!name) return "Add your name so your trip mates know who you are.";
  if (name.length < 2) return "That looks too short — use at least 2 letters.";
  if (name.length > MAX_NAME) return `Keep your name under ${MAX_NAME} characters.`;
  return undefined;
}

export function validateEmail(raw: string, { required = true } = {}): string | undefined {
  const email = raw.trim();
  if (!email) return required ? "Enter your email address." : undefined;
  if (email.length > 254) return "That email address is too long.";
  if (!EMAIL_RE.test(email)) return "Check that email — it looks like it has a typo.";
  return undefined;
}

/** Sign-up strength check. */
export function validatePassword(raw: string): string | undefined {
  if (!raw) return "Choose a password.";
  if (!raw.trim()) return "A password needs more than spaces.";
  if (raw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (raw.length > MAX_PASSWORD) return `Use ${MAX_PASSWORD} characters or fewer.`;
  return undefined;
}

/** Sign-in only checks presence — existing accounts keep whatever they chose. */
export function validateExistingPassword(raw: string): string | undefined {
  if (!raw) return "Enter your password.";
  return undefined;
}

export function validateConfirm(raw: string, password: string): string | undefined {
  if (!raw) return "Re-enter your password to be sure it's right.";
  if (raw !== password) return "Those passwords don't match.";
  return undefined;
}

export function validateSignUp({ name, email, password, confirm }: SignUpInput): FieldErrors {
  const errors: FieldErrors = {
    name: validateName(name),
    email: validateEmail(email),
    password: validatePassword(password),
  };
  if (confirm !== undefined) errors.confirm = validateConfirm(confirm, password);
  return dropEmpty(errors);
}

export function validateSignIn({ email, password }: SignInInput): FieldErrors {
  return dropEmpty({
    email: email.trim() ? undefined : "Enter your email address.",
    password: validateExistingPassword(password),
  });
}

/** First error in field order, for the summary line and focus management. */
export function firstError(errors: FieldErrors, order: (keyof FieldErrors)[]): keyof FieldErrors | null {
  for (const key of order) if (errors[key]) return key;
  return null;
}

export function hasErrors(errors: FieldErrors): boolean {
  return firstError(errors, ["name", "email", "password", "confirm"]) !== null;
}

function dropEmpty(errors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(errors)) if (v) out[k as keyof FieldErrors] = v;
  return out;
}
