import { Dashboard } from "@/components/Dashboard";
import { DashboardProvider } from "@/state/DashboardContext";

export default function Page() {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  );
}
