module.exports = {
  expo: {
    name: 'SentryNativeHttpTest',
    slug: 'sentry-native-http-test',
    version: '1.0.0',
    // Required by Expo Router for deep linking
    scheme: 'sentry-native-http-test',
    platforms: ['ios', 'android'],
    android: {
      package: 'com.sentryrntest',
      adaptiveIcon: {
        backgroundColor: '#ffffff',
      },
    },
    ios: {
      bundleIdentifier: 'com.sentryrntest',
    },
    plugins: [
      // Sentry Expo plugin — handles:
      //   - Uploading JS source maps on `expo build`
      //   - Patching android/build.gradle and ios/Podfile to include Sentry native SDKs
      //   - Wiring sentry.properties into the Android build
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          // Fill in your org + project slugs (found in Sentry Settings > Projects)
          organization: 'will-captel',
          project: 'react-native',
          // authToken is optional here; set SENTRY_AUTH_TOKEN env var instead
        },
      ],
      'expo-router',
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
