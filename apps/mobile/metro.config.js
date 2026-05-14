const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)
const commonPath = path.resolve(__dirname, '../../packages/common')

config.watchFolders = [...(config.watchFolders || []), commonPath]
config.resolver = {
  ...(config.resolver || {}),
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],
  extraNodeModules: {
    ...((config.resolver && config.resolver.extraNodeModules) || {}),
    '@messmini/common': commonPath,
    'expo-crypto': path.resolve(__dirname, 'node_modules/expo-crypto'),
  },
}

module.exports = withNativeWind(config, { input: './global.css' })
