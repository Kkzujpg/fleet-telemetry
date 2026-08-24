import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth/session-context';

/**
 * The only screen the app can land on with no other route context (cold
 * start, deep link to "/"). Redirects declaratively instead of relying on
 * router.replace() from an effect, which can silently no-op if it fires
 * before the root navigator's first render commits.
 */
export default function IndexScreen() {
  const { status } = useSession();

  if (status === 'loading') {
    return null;
  }

  return <Redirect href={status === 'authenticated' ? '/(tabs)/fleet' : '/login'} />;
}
