/**
 * Expo Config Plugin — Veyluro iOS Integrity Module
 *
 * Runs during `expo prebuild` / EAS Build:
 *   1. Copies ios/IntegrityModule.mm into the generated Xcode project
 *   2. Adds it to the main target's Compile Sources build phase
 *   3. Security.framework + CommonCrypto are system frameworks, no extra linking needed
 */

const { withXcodeProject } = require('@expo/config-plugins')
const path = require('path')
const fs   = require('fs')

const SRC = path.resolve(__dirname, '../ios/IntegrityModule.mm')

const withIntegrity = (config) => {
  return withXcodeProject(config, (cfg) => {
    const iosDir    = cfg.modRequest.platformProjectRoot   // …/ios/
    const xcProject = cfg.modResults                       // xcode pbxProject instance
    const projectName = cfg.modRequest.projectName         // e.g. "amooneclipse"

    // 1. Copy IntegrityModule.mm into ios/
    const dest = path.join(iosDir, 'IntegrityModule.mm')
    fs.copyFileSync(SRC, dest)

    // 2. Locate the main app target UUID
    const targets = xcProject.pbxNativeTargetSection()
    let targetUuid = null
    for (const [uuid, target] of Object.entries(targets)) {
      if (!target || typeof target !== 'object' || !target.name) continue
      const name = target.name.replace(/"/g, '')
      if (name === projectName) { targetUuid = uuid; break }
    }
    // Fallback: first PBXNativeTarget
    if (!targetUuid) {
      const entry = Object.entries(targets).find(([, v]) => v && v.isa === 'PBXNativeTarget')
      if (entry) targetUuid = entry[0]
    }

    // 3. Add to Compile Sources (xcode lib handles duplicate detection)
    xcProject.addSourceFile(
      'IntegrityModule.mm',
      targetUuid ? { target: targetUuid } : {},
      projectName
    )

    return cfg
  })
}

module.exports = withIntegrity
