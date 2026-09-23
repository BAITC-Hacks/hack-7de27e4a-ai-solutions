import { fileURLToPath } from 'node:url';
/** Windows runtimes that cannot execute Vite's optional `net use` realpath probe. */
export default {
  resolve: { preserveSymlinks: true, alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], pool: 'threads' },
};
