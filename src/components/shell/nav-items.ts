import {
  ArrowDownToLine,
  CalendarClock,
  Goal,
  House,
  Landmark,
  ListChecks,
  ListOrdered,
  PieChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobileTab: boolean };

/** Desktop sidebar order. Items with `mobileTab` appear in the phone's bottom tab bar; the rest live under More. */
export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: House, mobileTab: true },
  { href: "/transactions", label: "Transactions", icon: ListOrdered, mobileTab: true },
  { href: "/plan", label: "Plan", icon: PieChart, mobileTab: true },
  { href: "/goals", label: "Goals", icon: Goal, mobileTab: false },
  { href: "/recurring", label: "Recurring", icon: CalendarClock, mobileTab: false },
  { href: "/accounts", label: "Accounts", icon: Landmark, mobileTab: false },
  { href: "/import", label: "Import", icon: ArrowDownToLine, mobileTab: false },
  { href: "/settings", label: "Settings", icon: Settings, mobileTab: false },
];

/** Shown in the nav only while first-run setup isn't finished. */
export const setupNavItem: NavItem = { href: "/setup", label: "Setup", icon: ListChecks, mobileTab: false };

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
