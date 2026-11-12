import React from "react";
import { reportFault } from "@/lib/fault-report";

/** If a screen breaks, say so plainly instead of going blank, and tell us about it. */
export class CrashScreen extends React.Component<{ children: React.ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(error: unknown) { reportFault("crash", error); }
  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground" data-testid="crash-screen">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold">That screen broke</h1>
          <p className="text-sm text-muted-foreground">Sorry about that. Anything you counted is saved on this phone, and StockTap has been told what went wrong.</p>
          <button type="button" className="w-full h-14 rounded-lg bg-primary text-primary-foreground font-bold" onClick={() => { window.location.href = "/"; }} data-testid="button-crash-reload">Open StockTap again</button>
        </div>
      </div>
    );
  }
}
