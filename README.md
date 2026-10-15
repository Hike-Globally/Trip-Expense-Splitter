# Splitide — trip expense splitter

Mobile-first web app to split group trip costs across many currencies, show balances, and settle with the fewest payments.

## Accounts

Anyone can create an account from the **Sign up** tab and sign in with an email and password afterwards.

- **Sign up** — name, email, password (at least 8 characters, typed twice).
- **Sign in** — email and password, with the demo travellers one tap away under *Try a demo account*.
- Accounts live in this browser (`localStorage`): no server, no confirmation email, and no password reset — hence the confirmation field on sign up.
- A **session belongs to one browser tab**, so two people can stay signed in as themselves on a shared phone while trips keep syncing between tabs. A new tab starts signed out.
- An account left over from before per-tab sessions were introduced is picked up by the first tab that opens it, so nobody is signed out by the upgrade.

## Demo

Sign in with `alice@demo.com` / `demo123` (also bob@, cara@) — all three share a seeded Kathmandu trip. The invite code for that trip is `KTM-DEMO`; signing up through an invite link (`?join=KTM-DEMO`) joins the trip straight away.

## Run

```bash
npm install
npm run dev
```

Accounts and trips persist in the browser (`localStorage`).

## Test

```bash
npm test
```

Renders the real app in a headless DOM (jsdom) and drives the sign-up, sign-in, multi-tab session and upgrade paths. See `tests/`.
