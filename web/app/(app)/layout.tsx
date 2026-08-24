import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SocketProvider } from "../../lib/socket/SocketProvider";
import { OfflineProvider } from "../../lib/offline/OfflineProvider";
import { AppShell } from "../../components/shell/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  // Solo un chequeo barato de presencia - sin llamada al backend, sin
  // rotación de token. Quien realmente lo hace cumplir son los guards del
  // backend; esto solo evita renderizar el shell autenticado para un
  // navegador que claramente no tiene cookie de sesión.
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
