import { StaffDashboard } from "@/components/staff-dashboard";
import { SiteHeader } from "@/components/site-header";

export default function AdminPage() {
  return (
    <div className="admin-page">
      <SiteHeader staff />
      <StaffDashboard />
    </div>
  );
}
