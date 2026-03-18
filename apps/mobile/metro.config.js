const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch packages/common để HMR hoạt động trong dev
config.watchFolders = [path.resolve(workspaceRoot, 'packages', 'common')]
// Resolve @messmini/common trực tiếp — không cần symlinks
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

// Stub Node built-ins + WASM + map @messmini/common
const empty = require.resolve('./src/lib/crypto-stub.js')
config.resolver.extraNodeModules = {
  '@messmini/common': path.resolve(workspaceRoot, 'packages', 'common'),
  crypto:         empty,
  fs:             empty,
  path:           empty,
  os:             empty,
  stream:         empty,
  util:           empty,
  events:         empty,
  assert:         empty,
  constants:      empty,
  zlib:           empty,
  http:           empty,
  https:          empty,
  net:            empty,
  tls:            empty,
  child_process:  empty,
  worker_threads: empty,
  'hash-wasm':    empty,
}

module.exports = withNativeWind(config, { input: './global.css' })
