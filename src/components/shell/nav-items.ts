import {
  ArrowDownToLine,
  CalendarClock,
  Goal,
  House,
  Landmark,
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

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
