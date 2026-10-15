export interface PayOption {
  label: string;
  url: string;
  note?: string;
}

export function payOptions(amount: number, currency: string, toName: string): PayOption[] {
  const am = amount.toFixed(2);
  const name = encodeURIComponent(toName);
  const opts: PayOption[] = [];
  // UPI (India)
  if (currency === "INR") {
    opts.push({ label: "UPI", url: `upi://pay?pn=${name}&am=${am}&cu=INR&tn=Splitide`, note: "Opens any UPI app" });
  }
  // eSewa (Nepal) - NPR
  if (currency === "NPR") {
    opts.push({ label: "eSewa", url: `esewa://pay?amt=${am}`, note: "Opens eSewa app" });
    opts.push({ label: "Khalti", url: `khalti://pay?amount=${Math.round(amount * 100)}`, note: "Opens Khalti app" });
  }
  // Venmo (USD)
  if (currency === "USD") {
    opts.push({ label: "Venmo", url: `venmo://paycharge?txn=pay&recipients=${name}&amount=${am}&note=Splitide`, note: "Opens Venmo" });
  }
  // Generic fallbacks (open web)
  opts.push({ label: "PayPal", url: `https://www.paypal.com/myaccount/transfer`, note: "Web" });
  return opts;
}
