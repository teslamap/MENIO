plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ge.menio.merchant"
    compileSdk = 35

    buildFeatures {\n        buildConfig = true\n    }\n\n    defaultConfig {
        applicationId = "ge.menio.merchant"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
}
