# Veyluro Android Native

Native Android client for Veyluro, built in parallel with the React Native app.

## Stack

- Kotlin
- Jetpack Compose
- OkHttp
- kotlinx.serialization
- AndroidX DataStore

## Goals

- Keep the existing backend API.
- Start with login, room list, and chat shell.
- Rebuild E2EE as a native implementation with clear key/session reset flows.
- Avoid React Native, Expo, Hermes, CMake, and JS crypto dependencies.

## Build

```bash
cd apps/android-native
gradle :app:assembleDebug
```

Override backend URLs with Gradle properties:

```bash
gradle :app:assembleDebug \
  -PVEYLURO_API_URL=https://nexus.anhcong.dev:64542 \
  -PVEYLURO_WS_URL=wss://nexus.anhcong.dev:64542
```
