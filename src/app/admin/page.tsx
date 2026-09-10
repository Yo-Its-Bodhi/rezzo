import { StaffDashboard } from "@/components/staff-dashboard";
import { SiteHeader } from "@/components/site-header";
import { hasStaffSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  if (!(await hasStaffSession())) redirect("/staff/login");
  return (
    <div className="admin-page">
      <SiteHeader staff />
      <StaffDashboard />
    </div>
  );
}
