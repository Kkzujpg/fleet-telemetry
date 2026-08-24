import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth/session-context';

/**
 * La única pantalla en la que la app puede aterrizar sin otro contexto de
 * ruta (cold start, deep link a "/"). Redirige de forma declarativa en vez
 * de depender de router.replace() desde un efecto, que puede no hacer nada
 * en silencio si se dispara antes de que el primer render del navegador
 * raíz haga commit.
 */
export default function IndexScreen() {
  const { status } = useSession();

  if (status === 'loading') {
    return null;
  }

  return <Redirect href={status === 'authenticated' ? '/(tabs)/fleet' : '/login'} />;
}
