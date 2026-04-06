const fs = require('fs/promises')
const path = require('path')
const esbuild = require('esbuild')

const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, 'dist')

const config = {
  entryPoints: [ path.resolve(rootDir, 'client', 'common-client-plugin.js') ],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: [ 'es2020' ],
  outfile: path.resolve(distDir, 'common-client-plugin.js')
}

Promise.all([
  fs.mkdir(distDir, { recursive: true }),
  esbuild.build(config)
])
  .then(() => fs.copyFile(
    path.resolve(rootDir, 'assets', 'style.css'),
    path.resolve(distDir, 'style.css')
  ))
  .catch(() => process.exit(1))
