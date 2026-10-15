export type SplitType = "equal" | "shares" | "percent" | "exact";

export type Category = "food" | "stay" | "transport" | "activities" | "shopping" | "other";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "stay", label: "Stay" },
  { id: "transport", label: "Transport" },
  { id: "activities", label: "Activities" },
  { id: "shopping", label: "Shopping" },
  { id: "other", label: "Other" },
];

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

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
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
  category?: Category;
  receipt?: string; // data URL
  comments?: Comment[];
}

export interface Settlement {
  id: string;
  from: string;
  to: string;
  amountHome: number;
  paid: boolean;
  markedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  tripId?: string;
  text: string;
  createdAt: string;
  read: boolean;
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
  defaultParticipants?: string[];
  comments?: Comment[];
}

export interface DB {
  users: User[];
  trips: Trip[];
  /** Last user who signed in on this device. Informational: the live session
   *  is kept per browser tab (see store.sessionUserId). */
  sessionUserId: string | null;
  /** Set once the app stopped sharing one session across all tabs. */
  sessionScope?: "tab";
  notifications?: Notification[];
}
