const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)
const commonPath = path.resolve(__dirname, '../../packages/common')

config.watchFolders = [...(config.watchFolders || []), commonPath]
config.resolver = {
  ...(config.resolver || {}),
  extraNodeModules: {
    ...((config.resolver && config.resolver.extraNodeModules) || {}),
    '@messmini/common': commonPath,
  },
}

module.exports = withNativeWind(config, { input: './global.css' })
