import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initFaultReporting } from "./lib/fault-report";
import { CrashScreen } from "./components/CrashScreen";

initFaultReporting();

createRoot(document.getElementById("root")!).render(<CrashScreen><App /></CrashScreen>);
