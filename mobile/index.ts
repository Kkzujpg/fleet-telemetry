import { Buffer } from 'buffer';
import { LogBox } from 'react-native';

// Upstream data-quality warning from the openfreemap "liberty" style's own
// line layer (a malformed geometry in a specific vector tile) - not
// something our code can fix, and it doesn't affect rendering.
LogBox.ignoreLogs(['Invalid geometry in line layer']);

// shared/cursor.ts uses node's Buffer for base64url-encoding pagination
// cursors. RN has no such global, so polyfill it here, before expo-router's
// entry (and anything it imports) gets a chance to run. `require`, not
// `import`, for the entry line below - import statements are hoisted above
// this assignment, which would run the polyfill too late.
if (typeof (global as { Buffer?: unknown }).Buffer === 'undefined') {
  (global as { Buffer?: unknown }).Buffer = Buffer;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
