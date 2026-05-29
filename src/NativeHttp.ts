/**
 * Thin JS wrapper around the NativeHttp native module.
 *
 * Android: NativeHttpModule.kt  — OkHttp + SentryOkHttpInterceptor
 * iOS:     NativeHttpModule.swift — URLSession (auto-swizzled by Sentry Cocoa)
 *
 * Both implementations manually start a Sentry transaction before the request
 * so the network span has a parent and shows up in the Sentry trace waterfall.
 */
import { NativeModules } from 'react-native';

const { NativeHttp } = NativeModules;

export function makeNativeHttpRequest(url: string): Promise<string> {
  if (!NativeHttp) {
    console.warn(
      '[NativeHttp] Native module not found. ' +
        'Did you run `expo prebuild` and add NativeHttpPackage to MainApplication?'
    );
    return Promise.reject(new Error('NativeHttp module not available'));
  }
  return NativeHttp.makeRequest(url) as Promise<string>;
}
