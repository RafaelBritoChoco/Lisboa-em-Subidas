import * as esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm', // since our package.json is type="module"
  outfile: 'server.js',
  external: [
    'express',
    'vite',
    'cors',
    '@googlemaps/google-maps-services-js',
    'dotenv',
  ], // Do not bundle these, they format better natively
}).catch(() => process.exit(1));
