package com.sentryrntest

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.sentry.ITransaction
import io.sentry.Sentry
import io.sentry.SpanStatus
import io.sentry.TransactionOptions
import io.sentry.android.okhttp.SentryOkHttpEventListener
import io.sentry.android.okhttp.SentryOkHttpInterceptor
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * NativeHttpModule
 *
 * Makes HTTP requests using OkHttp from the Android native layer.
 *
 * SentryOkHttpInterceptor  — adds the request as a child span of the active
 *                            Sentry transaction, and propagates trace headers.
 * SentryOkHttpEventListener — adds detailed timing child spans (DNS, connect,
 *                             TLS, send headers, response body, etc.).
 *
 * Because autoInitializeNativeSdk = false in JS Sentry.init(), the JS
 * navigation transaction does NOT become the active transaction in the native
 * layer.  To ensure the OkHttp spans have a parent (and therefore appear in
 * a trace waterfall), we manually start a Sentry transaction here, bind it
 * to scope, make the request, then finish the transaction.
 *
 * Result in Sentry:
 *   Transaction: "NativeHttpRequest"  (op: "http.client.native")
 *     └─ Span: GET https://...         (from SentryOkHttpInterceptor)
 *          ├─ dns                       (from SentryOkHttpEventListener)
 *          ├─ connect
 *          ├─ tls_handshake
 *          ├─ send_request_headers
 *          └─ response_body_read
 */
class NativeHttpModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // OkHttpClient is shared across calls — creating it once is the OkHttp recommendation.
    // Both Sentry interceptors are registered here.
    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(SentryOkHttpInterceptor())          // creates HTTP span + trace headers
        .eventListener(SentryOkHttpEventListener())         // adds detailed timing sub-spans
        .build()

    override fun getName(): String = "NativeHttp"

    @ReactMethod
    fun makeRequest(url: String, promise: Promise) {
        // Start a Sentry transaction in the native layer.
        // isBindToScope = true → makes this the active transaction so
        // SentryOkHttpInterceptor can attach child spans to it.
        val txOptions = TransactionOptions().apply { isBindToScope = true }
        val transaction: ITransaction = Sentry.startTransaction(
            "NativeHttpRequest",   // name shown in Sentry Performance UI
            "http.client.native",  // op — use http.client convention
            txOptions
        )
        transaction.setTag("screen", "native_module")
        transaction.setData("requested_url", url)

        // Run the network call off the main thread.
        Thread {
            try {
                val request = Request.Builder()
                    .url(url)
                    .build()

                okHttpClient.newCall(request).execute().use { response ->
                    val body = response.body?.string() ?: "empty response"
                    transaction.finish(SpanStatus.OK)
                    promise.resolve(body)
                }
            } catch (e: Exception) {
                transaction.finish(SpanStatus.INTERNAL_ERROR)
                Sentry.captureException(e)
                promise.reject("HTTP_ERROR", e.message ?: "Unknown error", e)
            }
        }.start()
    }
}
