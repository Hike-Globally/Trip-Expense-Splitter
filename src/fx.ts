/** Static mid-market-style rates vs USD. Convert A→B via USD. */
export const RATES_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  NPR: 134.5,
  INR: 83.4,
  JPY: 149.2,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.88,
  CNY: 7.24,
  SGD: 1.34,
  HKD: 7.81,
  NZD: 1.66,
  KRW: 1350,
  THB: 36.2,
  MYR: 4.72,
  IDR: 15750,
  PHP: 57.8,
  VND: 25400,
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  TRY: 32.4,
  ZAR: 18.6,
  BRL: 5.05,
  MXN: 17.1,
  ARS: 890,
  CLP: 950,
  COP: 3950,
  PEN: 3.75,
  SEK: 10.5,
  NOK: 10.7,
  DKK: 6.87,
  PLN: 3.95,
  CZK: 23.1,
  HUF: 360,
  RON: 4.57,
  BGN: 1.8,
  ISK: 138,
  RUB: 92,
  UAH: 39.5,
  ILS: 3.72,
  EGP: 48.5,
  NGN: 1550,
  KES: 129,
  GHS: 15.4,
  MAD: 10.1,
  TZS: 2650,
  PKR: 278,
  BDT: 117,
  LKR: 300,
  MMK: 2100,
  KHR: 4100,
  LAK: 21500,
  TWD: 32.1,
  MOP: 8.04,
};

export const CURRENCIES = Object.keys(RATES_USD).sort();

export function convert(amount: number, from: string, to: string): number {
  const a = RATES_USD[from];
  const b = RATES_USD[to];
  if (a == null || b == null) throw new Error(`No FX rate for ${from} or ${to}`);
  return (amount / a) * b;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
