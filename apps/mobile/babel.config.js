module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // NativeWind v4 không cần 'nativewind/babel' nữa — metro config lo rồi
      'react-native-reanimated/plugin',
    ],
  }
}
