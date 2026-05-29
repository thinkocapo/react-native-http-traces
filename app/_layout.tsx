import { Stack, useNavigationContainerRef } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Sentry navigation integration — must be created OUTSIDE the component so it
// is only instantiated once and passed into Sentry.init().
// ─────────────────────────────────────────────────────────────────────────────
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Sentry.init — JavaScript layer only.
//
// autoInitializeNativeSdk: false
//   We do NOT let the JS bridge call SentryAndroid.init() / SentrySDK.start().
//   Instead we initialize the native SDKs ourselves:
//     Android → MainApplication.kt  (onCreate, before RN starts)
//     iOS     → AppDelegate.swift   (didFinishLaunchingWithOptions)
//   This gives us full control over native options (tracesSampleRate,
//   OkHttp interceptor wiring, URLSession tracking, etc.).
//
//   Side effect: JS traces and native traces will be INDEPENDENT — each with
//   their own trace ID. That is intentional for this test app:
//     • JS trace  = navigation transaction + component profiler spans
//     • Native trace = transaction started in NativeHttpModule + OkHttp spans
// ─────────────────────────────────────────────────────────────────────────────
Sentry.init({
  // ← PASTE YOUR DSN HERE (same DSN you set in MainApplication.kt / AppDelegate.swift)
  dsn: 'https://2faf6dcc8ba24113bd86a22fef53b1ec@o262702.ingest.us.sentry.io/5782557',

  tracesSampleRate: 1.0,   // capture every transaction while testing
  debug: true,             // log SDK activity to Metro console

  autoInitializeNativeSdk: false,

  integrations: [navigationIntegration],
});

function RootLayout() {
  // Expo Router manages its own NavigationContainer internally.
  // We grab a ref to it so we can hand it to Sentry.
  const ref = useNavigationContainerRef();

  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="next-screen" options={{ title: 'Next Screen' }} />
    </Stack>
  );
}

// Sentry.wrap adds a top-level JS error boundary and marks the root component
// so Sentry can track app start time.
export default Sentry.wrap(RootLayout);
