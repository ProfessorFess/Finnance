import type { Metadata, Viewport } from "next";
import { Fraunces, Schibsted_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], variable: "--font-display" });
const body = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Finnance",
  description: "Your personal finance dashboard.",
  applicationName: "Finnance",
  appleWebApp: { capable: true, title: "Finnance", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
