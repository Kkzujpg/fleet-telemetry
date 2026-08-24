import { SetMetadata } from '@nestjs/common';

export const BLOCK_IN_PRODUCTION_KEY = 'blockInProduction';

/**
 * Marca una ruta como no disponible cuando NODE_ENV=production. Todavía
 * ningún guard lee esto - se registra para un bloque posterior. Marcar las
 * rutas ahora hace que ese bloque solo tenga que agregar el guard, sin volver
 * a tocar cada controller.
 */
export const BlockInProduction = () => SetMetadata(BLOCK_IN_PRODUCTION_KEY, true);
