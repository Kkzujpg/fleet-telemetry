import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SocketProvider } from "../../lib/socket/SocketProvider";
import { OfflineProvider } from "../../lib/offline/OfflineProvider";
import { AppShell } from "../../components/shell/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  // Cheap presence check only - no backend call, no token rotation. Real
  // enforcement is the backend's guards; this just avoids rendering the
  // authenticated shell for a browser that plainly has no session cookie.
  if (!cookies().has("refreshToken")) {
    redirect("/login");
  }

  return (
    <SocketProvider>
      <OfflineProvider>
        <AppShell>{children}</AppShell>
      </OfflineProvider>
    </SocketProvider>
  );
}
