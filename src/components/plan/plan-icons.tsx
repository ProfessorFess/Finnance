import { CircleDollarSign, Coffee, type LucideIcon, PiggyBank, Receipt, Shield, ShoppingBasket, Wallet } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "piggy-bank": PiggyBank,
  receipt: Receipt,
  coffee: Coffee,
  shield: Shield,
  wallet: Wallet,
  "shopping-basket": ShoppingBasket,
};

export function BucketIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CircleDollarSign;
  return <Icon className={className} />;
}
