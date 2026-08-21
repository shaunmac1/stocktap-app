import React from "react";
import { Link, useLocation } from "wouter";
import { Home, Library, ClipboardList, ScanLine, BarChart3 } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/library", icon: Library, label: "Library" },
    { href: "/stocktake", icon: ClipboardList, label: "Stocktake" },
    { href: "/spot-check", icon: ScanLine, label: "Spot Check" },
    { href: "/reports", icon: BarChart3, label: "Reports" },
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
              <Icon
                className={`w-6 h-6 mb-1 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
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
