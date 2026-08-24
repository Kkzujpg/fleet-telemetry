import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertsList } from "../../../components/alerts/AlertsList";

export default function AlertsPage() {
  // Cookie de pista solo para UI, seteada en el login (ver
  // app/api/auth/login/route.ts) - no es un límite de confianza. El guard
  // @Roles('ADMIN') del backend es lo que realmente lo hace cumplir; este
  // redirect solo evita mostrar el shell de la página a alguien que
  // inmediatamente recibiría un 403 en cada request sobre ella.
  const role = cookies().get("role")?.value;
  if (role !== "ADMIN") {
    redirect("/");
  }

  return <AlertsList />;
}
