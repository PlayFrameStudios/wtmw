/** Compact money for headlines: $283.8M, −$29.2M, $12K. Receipts show full precision instead. */
export function shortMoney(value: number, digits = 1): string {
  const sign = value < 0 ? '−' : '';
  const a = Math.abs(value);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  // Rounded half up on whole dollars: $12,450,000 is $12.5M, where (12.45).toFixed(1) gives "12.4".
  if (a >= 1e6) return `${sign}$${(Math.round(a / 10 ** (6 - digits)) / 10 ** digits).toFixed(digits)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${a.toLocaleString('en-US')}`;
}
