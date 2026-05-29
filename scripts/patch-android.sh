#!/usr/bin/env bash
# patch-android.sh
# Run this every time after `expo prebuild --platform android --clean`.
# Applies all custom changes that prebuild wipes.
set -e

JAVA_DIR="android/app/src/main/java/com/sentryrntest"
BUILD_GRADLE="android/app/build.gradle"
SCRIPTS_DIR="$(dirname "$0")"

echo "▶ Copying NativeHttpModule.kt + NativeHttpPackage.kt..."
cp "$SCRIPTS_DIR/NativeHttpModule.kt" "$JAVA_DIR/NativeHttpModule.kt"
cp "$SCRIPTS_DIR/NativeHttpPackage.kt" "$JAVA_DIR/NativeHttpPackage.kt"

echo "▶ Patching MainApplication.kt..."
# 1. Add SentryAndroid import
sed -i '' \
  's/^import expo.modules.ReactNativeHostWrapper$/import expo.modules.ReactNativeHostWrapper\n\nimport io.sentry.android.core.SentryAndroid/' \
  "$JAVA_DIR/MainApplication.kt"

# 2. Register NativeHttpPackage
sed -i '' \
  's|// Packages that cannot be autolinked yet.*||' \
  "$JAVA_DIR/MainApplication.kt"
sed -i '' \
  's|val packages = PackageList(this).packages$|val packages = PackageList(this).packages\n            packages.add(NativeHttpPackage())|' \
  "$JAVA_DIR/MainApplication.kt"

# 3. Add SentryAndroid.init before SoLoader.init
sed -i '' \
  's|    super.onCreate()|    super.onCreate()\n\n    SentryAndroid.init(this) { options ->\n      options.dsn = "https://2faf6dcc8ba24113bd86a22fef53b1ec@o262702.ingest.us.sentry.io/5782557"\n      options.tracesSampleRate = 1.0\n      options.isDebug = BuildConfig.DEBUG\n      options.isEnableAutoSessionTracking = true\n    }|' \
  "$JAVA_DIR/MainApplication.kt"

echo "▶ Patching build.gradle..."
# 1. Remove enableBundleCompression (not supported in this RN version)
sed -i '' \
  's|enableBundleCompression = .*|// enableBundleCompression not supported in this RN version — removed|' \
  "$BUILD_GRADLE"

# 2. Add sentry-android-okhttp after react-android dependency
sed -i '' \
  's|implementation("com.facebook.react:react-android")|implementation("com.facebook.react:react-android")\n\n    // Sentry OkHttp integration — version matches sentry-android bundled by @sentry\/react-native\n    implementation("io.sentry:sentry-android-okhttp:7.22.5")|' \
  "$BUILD_GRADLE"

echo "✅ Android patches applied."
