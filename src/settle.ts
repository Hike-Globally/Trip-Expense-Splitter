import type { Expense, Member, Settlement } from "./types";
import { convert } from "./fx";

export function expenseSharesHome(
  exp: Expense,
  home: string
): Record<string, number> {
  const totalHome = convert(exp.amount, exp.currency, home);
  const parts = exp.participants;
  const out: Record<string, number> = {};
  if (!parts.length) return out;

  if (exp.splitType === "equal") {
    const each = totalHome / parts.length;
    parts.forEach((id) => (out[id] = each));
    return out;
  }

  if (exp.splitType === "shares") {
    const map = Object.fromEntries(exp.splits.map((s) => [s.userId, s.value]));
    const sum = parts.reduce((a, id) => a + (map[id] || 0), 0);
    parts.forEach((id) => {
      out[id] = sum ? (totalHome * (map[id] || 0)) / sum : 0;
    });
    return out;
  }

  if (exp.splitType === "percent") {
    const map = Object.fromEntries(exp.splits.map((s) => [s.userId, s.value]));
    parts.forEach((id) => {
      out[id] = (totalHome * (map[id] || 0)) / 100;
    });
    return out;
  }

  // exact amounts in expense currency
  const map = Object.fromEntries(exp.splits.map((s) => [s.userId, s.value]));
  parts.forEach((id) => {
    out[id] = convert(map[id] || 0, exp.currency, home);
  });
  return out;
}

export interface Balance {
  userId: string;
  name: string;
  paid: number;
  share: number;
  net: number;
}

export function balances(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
  home: string
): Balance[] {
  const paid: Record<string, number> = {};
  const share: Record<string, number> = {};
  members.forEach((m) => {
    paid[m.userId] = 0;
    share[m.userId] = 0;
  });

  for (const e of expenses) {
    paid[e.paidBy] = (paid[e.paidBy] || 0) + convert(e.amount, e.currency, home);
    const sh = expenseSharesHome(e, home);
    for (const [id, v] of Object.entries(sh)) share[id] = (share[id] || 0) + v;
  }

  for (const s of settlements.filter((x) => x.paid)) {
    paid[s.from] = (paid[s.from] || 0) + s.amountHome;
    share[s.from] = (share[s.from] || 0) + s.amountHome;
  }

  return members.map((m) => ({
    userId: m.userId,
    name: m.name,
    paid: paid[m.userId] || 0,
    share: share[m.userId] || 0,
    net: (paid[m.userId] || 0) - (share[m.userId] || 0),
  }));
}

/** Minimize number of transfers (greedy). */
export function simplify(bals: Balance[]): { from: string; to: string; amount: number }[] {
  const debtors = bals
    .filter((b) => b.net < -0.005)
    .map((b) => ({ id: b.userId, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = bals
    .filter((b) => b.net > 0.005)
    .map((b) => ({ id: b.userId, amt: b.net }))
    .sort((a, b) => b.amt - a.amt);

  const txs: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0.005) {
      txs.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(pay * 100) / 100 });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return txs;
}
