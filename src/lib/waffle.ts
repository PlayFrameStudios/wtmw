/** The $100 waffle: one square per dollar of a total. */

export interface Share<T> {
  item: T;
  /** Whole squares (dollars of $100). The squares always total exactly 100. */
  squares: number;
  /** Exact dollars per $100, e.g. 37.42. */
  exact: number;
}

/**
 * Splits $100 across items by largest remainder: everyone gets the floor of
 * their exact share, then the dollars left over go to the biggest fractions.
 * Returned biggest first, the order the waffle fills its columns.
 */
export function per100<T>(items: T[], value: (t: T) => number): Share<T>[] {
  const total = items.reduce((a, t) => a + value(t), 0);
  if (total <= 0) throw new Error('per100: total must be positive');
  const shares = items.map((item) => {
    const exact = (value(item) / total) * 100;
    return { item, exact, squares: Math.floor(exact) };
  });
  const left = 100 - shares.reduce((a, s) => a + s.squares, 0);
  [...shares]
    .sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))
    .slice(0, left)
    .forEach((s) => s.squares++);
  return shares.sort((a, b) => b.exact - a.exact);
}

/** One item of a drawn waffle: what its squares are called and colored, and where its details are. */
export interface WaffleItem {
  id: string;
  name: string;
  color: string;
  /** The dollars it stands for, for the table. */
  value: number;
  squares: number;
  exact: number;
  /** Its details, a tap away (#33), and the link's words: "Department details". */
  href: string;
  details: string;
}

/** The 100 squares in fill order: columns top to bottom, biggest item first. */
export function squares<T>(shares: Share<T>[]): T[] {
  return shares.flatMap((s) => Array<T>(s.squares).fill(s.item));
}

/** Whole dollars of every $100, as the chart shows them (#44): an item too small for a square is "less than $1", not "$0", which reads as unfunded. */
export function perHundred(squares: number, exact: number): string {
  return squares === 0 && exact > 0 ? 'less than $1' : `$${squares}`;
}
