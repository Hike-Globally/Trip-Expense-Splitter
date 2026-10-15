import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DB } from "./types";
import * as store from "./store";
import {
  MAX_NAME,
  MIN_PASSWORD,
  hasErrors,
  validateConfirm,
  validateEmail,
  validateExistingPassword,
  validateName,
  validatePassword,
  type FieldErrors,
} from "./validate";

type Mode = "in" | "up";

const DEMO_PASSWORD = "demo123";
const DEMO_ACCOUNTS = [
  { email: "alice@demo.com", name: "Alice" },
  { email: "bob@demo.com", name: "Bob" },
  { email: "cara@demo.com", name: "Cara" },
];

export default function Auth({
  db,
  inviteCode,
  onDone,
}: {
  db: DB;
  /** Trip invite code from a share link (?join=CODE) the visitor followed. */
  inviteCode?: string | null;
  onDone: (d: DB) => void;
}) {
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  /** Errors stay hidden until the form has been used once. */
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [serverFields, setServerFields] = useState<FieldErrors>({});

  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    email: `${uid}-email`,
    password: `${uid}-password`,
    confirm: `${uid}-confirm`,
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);

  const isSignUp = mode === "up";

  /** Local validation, recomputed as the user types. */
  const checked = useMemo<FieldErrors>(
    () =>
      isSignUp
        ? prune({
            name: validateName(name),
            email: validateEmail(email),
            password: validatePassword(password),
            confirm: validateConfirm(confirm, password),
          })
        : prune({
            email: email.trim() ? undefined : "Enter your email address.",
            password: validateExistingPassword(password),
          }),
    [isSignUp, name, email, password, confirm]
  );

  const visible = submitted ? prune({ ...checked, ...serverFields }) : prune(serverFields);
  const problems = Object.keys(visible) as (keyof FieldErrors)[];
  const knownEmail = email.trim() ? store.emailTaken(db, email) : false;
  const hints = {
    name: isSignUp ? "Shown to the people you split with." : undefined,
    email:
      !isSignUp && submitted && !knownEmail && !checked.email
        ? "No account for this email on this device."
        : undefined,
    password: isSignUp ? `At least ${MIN_PASSWORD} characters.` : undefined,
    confirm: isSignUp ? "Catches typos — there's no password reset on this device." : undefined,
  };

  useEffect(() => {
    // Move focus when switching between sign in and sign up — but not on the
    // first paint, so phones don't pop the keyboard as the page loads.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (isSignUp) nameRef.current?.focus();
    else emailRef.current?.focus();
  }, [isSignUp]);

  // A rejected attempt should stop looking like a rejection once it's edited.
  useEffect(() => {
    setFormError("");
    setServerFields({});
  }, [name, email, password, confirm]);

  function firstInvalid(errors: FieldErrors): HTMLInputElement | null {
    if (errors.name) return nameRef.current;
    if (errors.email) return emailRef.current;
    if (errors.password) return passwordRef.current;
    if (errors.confirm) return confirmRef.current;
    return null;
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setSubmitted(false);
    setFormError("");
    setServerFields({});
    setPassword("");
    setConfirm("");
    setShowPassword(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setServerFields({});
    setSubmitted(true);

    if (hasErrors(checked)) {
      firstInvalid(checked)?.focus();
      return;
    }

    try {
      if (isSignUp) store.register(db, name, email, password, confirm);
      else store.login(db, email, password);
      onDone(db);
    } catch (ex) {
      const err = ex as store.AccountError;
      setFormError(err.message || "Something went wrong. Try again.");
      if (err.fields && Object.keys(err.fields).length) {
        setServerFields(prune(err.fields));
        firstInvalid(err.fields)?.focus();
      }
    }
  }

  function fillDemo(demoEmail: string) {
    setMode("in");
    setSubmitted(false);
    setFormError("");
    setServerFields({});
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    emailRef.current?.focus();
  }

  function onTabKeys(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" && !isSignUp) {
      e.preventDefault();
      switchMode("up");
    } else if (e.key === "ArrowLeft" && isSignUp) {
      e.preventDefault();
      switchMode("in");
    }
  }

  const submitLabel = isSignUp ? "Create account" : "Sign in";
  const otherModeLabel = isSignUp ? "Already have an account?" : "New to Splitide?";
  const otherModeAction = isSignUp ? "Sign in" : "Create one";

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
        {inviteCode && (
          <div className="auth-invite" role="status">
            <span className="auth-invite-tag">Invite {inviteCode}</span>
            <span>
              {isSignUp
                ? "Create an account and you'll join the trip straight away."
                : "Sign in and you'll join the trip straight away."}
            </span>
          </div>
        )}

        <div
          className="tabs"
          role="tablist"
          aria-label="Sign in or create an account"
          onKeyDown={onTabKeys}
        >
          <button
            type="button"
            role="tab"
            id={`${uid}-tab-in`}
            aria-selected={!isSignUp}
            aria-controls={`${uid}-panel`}
            tabIndex={isSignUp ? -1 : 0}
            className={`tab ${!isSignUp ? "on" : ""}`}
            onClick={() => switchMode("in")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            id={`${uid}-tab-up`}
            aria-selected={isSignUp}
            aria-controls={`${uid}-panel`}
            tabIndex={isSignUp ? 0 : -1}
            className={`tab ${isSignUp ? "on" : ""}`}
            onClick={() => switchMode("up")}
          >
            Sign up
          </button>
        </div>

        <div
          role="tabpanel"
          id={`${uid}-panel`}
          aria-labelledby={isSignUp ? `${uid}-tab-up` : `${uid}-tab-in`}
        >
          <h1 className="auth-title display">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-sub">
            {isSignUp
              ? "No confirmation emails — your account lives in this browser."
              : "Pick up your trips and balances where you left them."}
          </p>

          {formError ? (
            <div className="error" role="alert">
              <span>{formError}</span>
              {isSignUp && knownEmail && (
                <button type="button" className="link-btn" onClick={() => switchMode("in")}>
                  Sign in instead
                </button>
              )}
            </div>
          ) : submitted && problems.length > 0 ? (
            <div className="error" role="alert">
              Check {listFields(problems)}.
            </div>
          ) : null}

          <form onSubmit={submit} noValidate>
            {isSignUp && (
              <Field id={ids.name} label="Name" error={visible.name} hint={hints.name}>
                <input
                  id={ids.name}
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={MAX_NAME}
                  enterKeyHint="next"
                  placeholder="Ada Lovelace"
                  aria-invalid={!!visible.name}
                  aria-describedby={describedBy(ids.name, visible.name, hints.name)}
                  required
                />
              </Field>
            )}

            <Field id={ids.email} label="Email" error={visible.email} hint={hints.email}>
              <input
                id={ids.email}
                ref={emailRef}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={isSignUp ? "email" : "username"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="you@example.com"
                aria-invalid={!!visible.email}
                aria-describedby={describedBy(ids.email, visible.email, hints.email)}
                required
              />
            </Field>

            <Field id={ids.password} label="Password" error={visible.password} hint={hints.password}>
              <div className="pw-wrap">
                <input
                  id={ids.password}
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  enterKeyHint={isSignUp ? "next" : "go"}
                  aria-invalid={!!visible.password}
                  aria-describedby={describedBy(ids.password, visible.password, hints.password)}
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            {isSignUp && (
              <Field id={ids.confirm} label="Confirm password" error={visible.confirm} hint={hints.confirm}>
                <input
                  id={ids.confirm}
                  ref={confirmRef}
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  aria-invalid={!!visible.confirm}
                  aria-describedby={describedBy(ids.confirm, visible.confirm, hints.confirm)}
                  required
                />
              </Field>
            )}

            <button className="btn btn-primary" type="submit">
              {submitLabel}
            </button>
          </form>

          <p className="auth-switch">
            {otherModeLabel}{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => switchMode(isSignUp ? "in" : "up")}
            >
              {otherModeAction}
            </button>
          </p>

          {!isSignUp && (
            <div className="demo-box">
              <button
                type="button"
                className="link-btn"
                aria-expanded={showDemo}
                onClick={() => setShowDemo((v) => !v)}
              >
                {showDemo ? "Hide demo accounts" : "Try a demo account"}
              </button>
              {showDemo && (
                <div className="demo-chips">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button key={a.email} type="button" className="chip" onClick={() => fillDemo(a.email)}>
                      {a.name}
                    </button>
                  ))}
                  <p className="hint">
                    Fills the form with a demo traveller (password <b>{DEMO_PASSWORD}</b>). All three
                    share a seeded Kathmandu trip.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${error ? "field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** "the Email field" / "the Name, Email and Password fields" */
const FIELD_LABELS: Record<keyof FieldErrors, string> = {
  name: "Name",
  email: "Email",
  password: "Password",
  confirm: "Confirm password",
};

function listFields(keys: (keyof FieldErrors)[]): string {
  const labels = keys.map((k) => FIELD_LABELS[k]);
  if (labels.length === 1) return `the ${labels[0]} field`;
  return `the ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]} fields`;
}

/** Point the input at whichever of its message / hint is on screen. */
function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

function prune(errors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(errors)) if (v) out[k as keyof FieldErrors] = v;
  return out;
}
