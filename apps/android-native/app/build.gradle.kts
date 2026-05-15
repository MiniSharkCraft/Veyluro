plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
}

android {
  namespace = "dev.anhcong.veyluro"
  compileSdk = 36

  buildFeatures {
    buildConfig = true
    compose = true
  }

  defaultConfig {
    applicationId = "dev.anhcong.veyluro"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0-native"

    val apiUrl = providers.gradleProperty("VEYLURO_API_URL")
      .orElse("https://nexus.anhcong.dev:64542")
      .get()
    val wsUrl = providers.gradleProperty("VEYLURO_WS_URL")
      .orElse("wss://nexus.anhcong.dev:64542")
      .get()

    buildConfigField("String", "API_URL", "\"$apiUrl\"")
    buildConfigField("String", "WS_URL", "\"$wsUrl\"")
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation("androidx.activity:activity-compose:1.10.1")
  implementation("androidx.compose.material3:material3:1.3.2")
  implementation("androidx.compose.material:material-icons-extended:1.7.8")
  implementation("androidx.compose.ui:ui:1.8.3")
  implementation("androidx.compose.ui:ui-tooling-preview:1.8.3")
  implementation("androidx.core:core-ktx:1.16.0")
  implementation("androidx.datastore:datastore-preferences:1.1.7")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
  implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

  debugImplementation("androidx.compose.ui:ui-tooling:1.8.3")
}
