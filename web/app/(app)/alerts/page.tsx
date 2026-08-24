import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertsList } from "../../../components/alerts/AlertsList";

export default function AlertsPage() {
  // UI-only hint cookie set at login (see app/api/auth/login/route.ts) - not a
  // trust boundary. The backend's @Roles('ADMIN') guard is what actually
  // enforces this; this redirect just avoids showing the page shell to
  // someone who'd immediately get a 403 from every request on it.
  const role = cookies().get("role")?.value;
  if (role !== "ADMIN") {
    redirect("/");
  }

  return <AlertsList />;
}
