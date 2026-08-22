import React from "react";
import { Link, useLocation } from "wouter";
import { Home, Coins, Thermometer, Library, ClipboardList, ScanLine, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOutstandingToday } from "@/hooks/useChecks";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { venue } = useAuth();
  const outstanding = useOutstandingToday(venue?.id);

  const navItems = [
    { href: "/", icon: Home, label: "Home", badge: 0 },
    { href: "/daily-board", icon: Coins, label: "Board", badge: 0 },
    { href: "/checks", icon: Thermometer, label: "Checks", badge: outstanding.total },
    { href: "/library", icon: Library, label: "Library", badge: 0 },
    { href: "/stocktake", icon: ClipboardList, label: "Stocktake", badge: 0 },
    { href: "/spot-check", icon: ScanLine, label: "Spot Check", badge: 0 },
    { href: "/reports", icon: BarChart3, label: "Reports", badge: 0 },
  ];

  return (
    <div className="min-h-[100dvh] w-full max-w-md mx-auto bg-background relative pb-16 shadow-xl flex flex-col">

      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        {children}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-card border-t border-border flex justify-around items-center p-2 pb-safe z-50">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center py-1"
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 mb-1 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{item.badge}</span>
                )}
              </div>
              <span
                className={`text-[10px] ${
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
