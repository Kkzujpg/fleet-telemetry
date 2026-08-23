import { SetMetadata } from '@nestjs/common';

export const BLOCK_IN_PRODUCTION_KEY = 'blockInProduction';

/**
 * Marks a route as unavailable when NODE_ENV=production. No guard reads this
 * yet - it's registered in a later block. Marking routes now means that
 * block only has to add the guard, not touch every controller again.
 */
export const BlockInProduction = () => SetMetadata(BLOCK_IN_PRODUCTION_KEY, true);
