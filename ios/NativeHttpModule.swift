import Foundation
import Sentry

/**
 * NativeHttpModule (iOS)
 *
 * Makes HTTP requests using URLSession from the iOS native layer.
 *
 * Sentry Cocoa auto-swizzles URLSession when enableNetworkTracking = true
 * (the default), so any URLSession request made while there is an active
 * transaction automatically appears as a child span.
 *
 * Same pattern as Android: we manually start a Sentry transaction before the
 * request so the URLSession span has a parent and shows up in the trace
 * waterfall — even when autoInitializeNativeSdk = false on the JS side.
 */
@objc(NativeHttpModule)
class NativeHttpModule: NSObject {

    @objc
    func makeRequest(_ url: String,
                     resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {

        guard let requestUrl = URL(string: url) else {
            reject("INVALID_URL", "Invalid URL: \(url)", nil)
            return
        }

        // Start a Sentry transaction and bind it to scope so the URLSession
        // swizzling can attach child spans to it.
        let transaction = SentrySDK.startTransaction(
            name: "NativeHttpRequest",
            operation: "http.client.native",
            bindToScope: true
        )
        transaction.setTag(value: "native_module", key: "screen")
        transaction.setData(value: url, key: "requested_url")

        // URLSession auto-instrumented by Sentry Cocoa SDK.
        let task = URLSession.shared.dataTask(with: requestUrl) { data, response, error in
            if let error = error {
                transaction.finish(status: .internalError)
                SentrySDK.capture(error: error)
                reject("HTTP_ERROR", error.localizedDescription, error)
                return
            }

            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? "empty response"
            transaction.finish(status: .ok)
            resolve(body)
        }
        task.resume()
    }

    @objc
    static func requiresMainQueueSetup() -> Bool { false }
}
