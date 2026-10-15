export type SplitType = "equal" | "shares" | "percent" | "exact";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
}

export interface SplitLine {
  userId: string;
  /** weight for shares, 0-100 for percent, amount in expense currency for exact */
  value: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  date: string;
  notes: string;
  participants: string[];
  splitType: SplitType;
  splits: SplitLine[];
}

export interface Settlement {
  id: string;
  from: string;
  to: string;
  amountHome: number;
  paid: boolean;
  markedAt?: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  homeCurrency: string;
  inviteCode: string;
  ownerId: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  createdAt: string;
}

export interface DB {
  users: User[];
  trips: Trip[];
  sessionUserId: string | null;
}
