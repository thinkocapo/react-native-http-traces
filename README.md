# react-native-http-traces

## Purpose

This app was built to test and prove that **HTTP requests made from the Android and iOS native layers of a React Native app** are captured as spans in Sentry — and are visible in the trace waterfall.

### The problem it addresses

The Sentry React Native SDK auto-instruments `fetch` and `XMLHttpRequest` on the JavaScript side. But some React Native apps make HTTP requests purely from native code — for example, from a Kotlin module using OkHttp on Android, or a Swift module using URLSession on iOS. Those requests are invisible to the JS SDK.

The question this app answers: **can those native-layer HTTP requests still show up as spans in Sentry?**

### What it tests

- HTTP requests fired from **Android native code** (OkHttp + `SentryOkHttpInterceptor`) appear as spans in Sentry — visible in the Performance waterfall
- HTTP requests fired from **iOS native code** (URLSession, auto-swizzled by Sentry Cocoa) appear as spans in Sentry — visible in the Performance waterfall
- **JS-layer traces** run independently alongside the native traces — navigation transactions and React Component Profiler spans from the JavaScript layer land in the same Sentry project
- All three layers (JS, Android, iOS) send to the **same DSN / same Sentry project**

> ⚠️ **Current state of the product:** The native HTTP request spans appear in their **own separate traces** — they do **not** appear nested inside the JS navigation trace for the Home or Next Screen. When you open the `Route Change to /index` trace in Sentry, you will not see the native HTTP spans there. They show up as their own standalone `NativeHttpRequest` transactions. This is expected given how `autoInitializeNativeSdk: false` works — the JS and native SDKs operate independently with separate trace contexts. This is the current product behaviour, not a bug.

### What the app does

- Two screens (Home → Next Screen → back) built with Expo Router
- Each screen **fires native HTTP requests on mount** and via a button tap — the requests go to `jsonplaceholder.typicode.com` as dummy endpoints
- Home screen has several React components wrapped with `Sentry.withProfiler()` to produce component-level spans
- Navigation transactions are captured automatically via `reactNavigationIntegration`

---

## SDK Configuration

### The key design decision: `autoInitializeNativeSdk: false`

By default, `Sentry.init()` in JavaScript also initializes the native Sentry SDKs via the React Native bridge. Setting `autoInitializeNativeSdk: false` disables this, allowing each native layer to own its own initialization with full control over options (sample rate, OkHttp wiring, URLSession tracking, etc.).

**Important consequence: JS traces and native traces are separate.** Because the JS and native SDKs operate independently with no shared trace context, the native HTTP spans will **not** appear inside the `Route Change to /index` or `Route Change to /next-screen` transactions. They arrive in Sentry as their own standalone `NativeHttpRequest` transactions. This is the current state of the product — the two worlds are visible in the same Sentry project but in separate trace waterfalls. If a native request happened to fire while a JS transaction is still active *and* the bridge propagated the trace context, they *may* share a trace ID, but this cannot be relied upon.

---

### JavaScript Layer

**File:** `app/_layout.tsx`

```ts
import * as Sentry from '@sentry/react-native';
import { useNavigationContainerRef } from 'expo-router';

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'YOUR_DSN_HERE',
  tracesSampleRate: 1.0,

  // Do NOT let the JS bridge call SentryAndroid.init() / SentrySDK.start().
  // Native SDKs are initialized manually in MainApplication.kt / AppDelegate.swift.
  autoInitializeNativeSdk: false,

  integrations: [navigationIntegration],
});

function RootLayout() {
  const ref = useNavigationContainerRef();
  useEffect(() => {
    if (ref?.current) navigationIntegration.registerNavigationContainer(ref);
  }, [ref.current]);
  return <Stack />;
}

export default Sentry.wrap(RootLayout);
```

**What it produces in Sentry:**
- `Route Change to /index` — navigation transaction with `HomeScreen`, `WelcomeCard`, `InfoCard`, `StatusCard` component profiler spans
- `Route Change to /next-screen` — navigation transaction with `NextScreen` component profiler span

---

### Android Layer

#### `android/app/build.gradle`

Add the Sentry OkHttp integration. The version must match `sentry-android` bundled by `@sentry/react-native` — check `node_modules/@sentry/react-native/android/build.gradle` for the version.

```groovy
dependencies {
    implementation("io.sentry:sentry-android-okhttp:7.22.5")
}
```

#### `MainApplication.kt`

Initialize Sentry Android in `onCreate()` **before the RN bridge starts**. Since `autoInitializeNativeSdk: false` is set in JS, the JS SDK will not call this — the native layer owns it.

```kotlin
import io.sentry.android.core.SentryAndroid

override fun onCreate() {
    super.onCreate()

    SentryAndroid.init(this) { options ->
        options.dsn = "YOUR_DSN_HERE"  // same DSN as JS layer
        options.tracesSampleRate = 1.0
        options.isDebug = BuildConfig.DEBUG
        options.isEnableAutoSessionTracking = true
    }

    // ... SoLoader.init, RN bootstrap, etc.
}
```

Also register `NativeHttpPackage` in `getPackages()`:

```kotlin
override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages
    packages.add(NativeHttpPackage())
    return packages
}
```

#### `NativeHttpModule.kt`

The OkHttp client is built with both Sentry interceptors. Before each request, a Sentry transaction is started and **bound to scope** — this gives the OkHttp spans a parent transaction to attach to.

```kotlin
import io.sentry.android.okhttp.SentryOkHttpInterceptor
import io.sentry.android.okhttp.SentryOkHttpEventListener
import io.sentry.Sentry
import io.sentry.SpanStatus
import io.sentry.TransactionOptions

private val client = OkHttpClient.Builder()
    .addInterceptor(SentryOkHttpInterceptor())    // creates HTTP span + injects trace headers
    .eventListener(SentryOkHttpEventListener())   // adds DNS / TLS / connect / response sub-spans
    .build()

@ReactMethod
fun makeRequest(url: String, promise: Promise) {
    // isBindToScope = true → makes this the active transaction so
    // SentryOkHttpInterceptor can attach child spans to it
    val transaction = Sentry.startTransaction(
        "NativeHttpRequest", "http.client.native",
        TransactionOptions().apply { isBindToScope = true }
    )
    Thread {
        try {
            val response = client.newCall(Request.Builder().url(url).build()).execute()
            transaction.finish(SpanStatus.OK)
            promise.resolve(response.body?.string())
        } catch (e: Exception) {
            transaction.finish(SpanStatus.INTERNAL_ERROR)
            promise.reject("HTTP_ERROR", e.message, e)
        }
    }.start()
}
```

**What it produces in Sentry:**
- `NativeHttpRequest` transaction
  - `GET https://...` span (from `SentryOkHttpInterceptor`)
    - `dns`, `connect`, `tls_handshake`, `send_request_headers`, `response_body` sub-spans (from `SentryOkHttpEventListener`)

---

### iOS Layer

**Files:** `AppDelegate.swift`, `NativeHttpModule.swift`

#### `AppDelegate.swift`

```swift
import Sentry

func application(_ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: ...) -> Bool {

    SentrySDK.start { options in
        options.dsn = "YOUR_DSN_HERE"  // same DSN as JS + Android
        options.tracesSampleRate = 1.0
        options.enableNetworkTracking = true  // auto-swizzles URLSession (this is the default)
    }
    // ... rest of app launch
}
```

#### `NativeHttpModule.swift`

`enableNetworkTracking = true` means Sentry Cocoa auto-swizzles `URLSession` — no interceptor wiring needed. Any `URLSession` request made while a transaction is active automatically becomes a child span. As on Android, a transaction is started and bound to scope before the request fires.

```swift
import Sentry

@objc func makeRequest(_ url: String,
  resolve: @escaping RCTPromiseResolveBlock,
  reject:  @escaping RCTPromiseRejectBlock) {

    // bindToScope: true → URLSession swizzling attaches the network span as a child
    let transaction = SentrySDK.startTransaction(
        name: "NativeHttpRequest",
        operation: "http.client.native",
        bindToScope: true
    )

    URLSession.shared.dataTask(with: URL(string: url)!) { data, _, error in
        if let error = error {
            transaction.finish(status: .internalError)
            reject("HTTP_ERROR", error.localizedDescription, error); return
        }
        transaction.finish(status: .ok)
        resolve(String(data: data!, encoding: .utf8))
    }.resume()
}
```

**What it produces in Sentry:**
- `NativeHttpRequest` transaction
  - `GET https://...` span (auto-instrumented by Sentry Cocoa URLSession swizzling)

---

## What appears in Sentry Performance

All three layers send to the **same Sentry project** (same DSN). JS and native traces each have their own trace ID — they are **separate traces**, not nested inside one another.

**JS traces** (from `reactNavigationIntegration`):

| Transaction | Source | Child spans |
|---|---|---|
| `Route Change to /index` | JS SDK | HomeScreen · WelcomeCard · InfoCard · StatusCard component profiler spans |
| `Route Change to /next-screen` | JS SDK | NextScreen component profiler span |

**Native traces** (separate — do not appear inside the JS traces above):

| Transaction | Source | Child spans |
|---|---|---|
| `NativeHttpRequest` | Android SDK | GET span · dns · connect · tls_handshake · send_request_headers · response_body |
| `NativeHttpRequest` | iOS SDK | GET span (URLSession auto-instrumented) |

> The native HTTP spans are **not** visible inside the `Route Change to /index` trace waterfall. They exist as their own top-level transactions. This is the current state of the product — both sets of traces are real and useful, they just live separately in Sentry Performance.

---

## Running the app

### Prerequisites

- Node.js 18+
- Android Studio with an AVD (API 35 recommended) and `ANDROID_HOME` set
- `JAVA_HOME` pointing to JDK 17+ (Android Studio's bundled JDK works: `/Applications/Android Studio.app/Contents/jbr/Contents/Home`)

### Android

```bash
npm install --legacy-peer-deps

# Prebuild generates the android/ folder, then patch-android.sh applies
# our custom native files (MainApplication.kt changes, NativeHttpPackage,
# NativeHttpModule, sentry-android-okhttp dependency).
# Run this every time you need to re-run expo prebuild.
npx expo prebuild --platform android --clean && ./scripts/patch-android.sh

# Build and install on a running emulator or connected device
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npx expo run:android
```

### iOS

```bash
npm install --legacy-peer-deps
npx expo prebuild --platform ios --clean

# Apply the Sentry init to AppDelegate.swift (see ios/AppDelegate.swift.patch)
# Copy ios/NativeHttpModule.swift and ios/NativeHttpModule.m into the Xcode project

npx expo run:ios
```

### Why `scripts/patch-android.sh` exists

`expo prebuild --clean` regenerates the entire `android/` folder, wiping any manual edits to `MainApplication.kt` and `build.gradle`. The patch script re-applies all custom changes in one command so the workflow is repeatable without manual file editing.

---

## Project structure

```
├── app/
│   ├── _layout.tsx          # Sentry.init (JS), navigation integration, Sentry.wrap
│   ├── index.tsx            # Home screen — Component Profiler, native HTTP on mount + button
│   └── next-screen.tsx      # Next screen — native HTTP on mount + button, back navigation
├── src/
│   └── NativeHttp.ts        # JS wrapper around NativeModules.NativeHttp
├── android/
│   └── app/src/main/java/com/sentryrntest/
│       ├── MainApplication.kt   # SentryAndroid.init + NativeHttpPackage registration
│       ├── NativeHttpModule.kt  # OkHttp + SentryOkHttpInterceptor + manual transaction
│       └── NativeHttpPackage.kt # Registers NativeHttpModule with the RN bridge
├── ios/
│   ├── NativeHttpModule.swift   # URLSession + manual transaction
│   ├── NativeHttpModule.m       # Obj-C bridge header
│   └── AppDelegate.swift.patch  # Instructions for adding SentrySDK.start to AppDelegate
└── scripts/
    ├── patch-android.sh         # Re-applies all native patches after expo prebuild --clean
    ├── NativeHttpModule.kt      # Canonical source for the Android native module
    └── NativeHttpPackage.kt     # Canonical source for the Android package registration
```
