import { Buffer } from 'buffer';
import { LogBox } from 'react-native';

// Advertencia de calidad de datos del proveedor, de la propia capa de líneas
// del estilo "liberty" de openfreemap (una geometría mal formada en un tile
// vectorial específico) - no es algo que nuestro código pueda arreglar, y no
// afecta el renderizado.
LogBox.ignoreLogs(['Invalid geometry in line layer']);

// shared/cursor.ts usa el Buffer de node para codificar en base64url los
// cursores de paginación. RN no tiene ese global, así que se hace polyfill
// acá, antes de que el entry de expo-router (y lo que este importe) tenga
// chance de correr. `require`, no `import`, para la línea de entry de abajo -
// las declaraciones import se hoistean por encima de esta asignación, lo que
// correría el polyfill demasiado tarde.
if (typeof (global as { Buffer?: unknown }).Buffer === 'undefined') {
  (global as { Buffer?: unknown }).Buffer = Buffer;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
