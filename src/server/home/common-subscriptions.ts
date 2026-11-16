// Plain data, safe to import from client components.

/** Common subscriptions with typical US prices; amounts are editable before they're added. */
export const COMMON_SUBSCRIPTIONS: { name: string; cents: number; matchPattern: string }[] = [
  { name: "Netflix", cents: 1549, matchPattern: "Netflix" },
  { name: "Spotify", cents: 1199, matchPattern: "Spotify" },
  { name: "Hulu", cents: 999, matchPattern: "Hulu" },
  { name: "Disney+", cents: 1599, matchPattern: "Disney" },
  { name: "YouTube Premium", cents: 1399, matchPattern: "YouTube" },
  { name: "Amazon Prime", cents: 1499, matchPattern: "Amazon Prime" },
  { name: "Apple iCloud+", cents: 299, matchPattern: "Apple.com/bill" },
  { name: "Max", cents: 1699, matchPattern: "Max.com" },
  { name: "Peacock", cents: 799, matchPattern: "Peacock" },
  { name: "Paramount+", cents: 799, matchPattern: "Paramount" },
];
