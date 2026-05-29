// Objective-C bridge that exposes NativeHttpModule.swift to the React Native bridge.
// React Native's codegen requires this file to exist alongside the Swift implementation.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeHttpModule, NSObject)

RCT_EXTERN_METHOD(
  makeRequest:(NSString *)url
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)

@end
