#import <AppKit/AppKit.h>
#import <Security/Security.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>

static NSString * const BundleID = @"com.openai.codex";
static NSString * const Service = @"com.github.HELIXXr.CodexProfileDock";
static const NSUInteger MaxAuth = 1024 * 1024;

static long long launchMilliseconds(NSRunningApplication *app) {
    return (long long)(app.launchDate.timeIntervalSince1970 * 1000);
}

static int writeBytes(NSData *data) {
    if (!data) return 1;
    return fwrite(data.bytes, 1, data.length, stdout) == data.length ? 0 : 1;
}

static int desktop(void) {
    NSArray *running = [NSRunningApplication runningApplicationsWithBundleIdentifier:BundleID];
    NSMutableArray<NSRunningApplication *> *apps = [NSMutableArray array];
    for (NSRunningApplication *app in running) {
        if (!app.terminated && app.bundleURL.path && app.launchDate) [apps addObject:app];
    }
    if (apps.count > 1) return 1;
    NSRunningApplication *app = apps.firstObject;
    NSDictionary *info = app ? @{
        @"path": app.bundleURL.path,
        @"pid": @(app.processIdentifier),
        @"started": @(launchMilliseconds(app)),
    } : @{};
    return writeBytes([NSJSONSerialization dataWithJSONObject:info options:0 error:NULL]);
}

static int quit(const char *pidText, const char *timeText) {
    long pid = strtol(pidText, NULL, 10);
    long long started = strtoll(timeText, NULL, 10);
    if (pid <= 1 || pid > INT_MAX || started <= 0) return 1;
    NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)pid];
    if (![app.bundleIdentifier isEqualToString:BundleID] || launchMilliseconds(app) != started) return 1;
    return [app terminate] ? 0 : 1;
}

static int keychain(NSString *action, NSString *account) {
    if (![[NSUUID alloc] initWithUUIDString:account]) return 1;
    NSMutableDictionary *item = [@{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: Service,
        (__bridge id)kSecAttrAccount: account,
    } mutableCopy];

    if ([action isEqualToString:@"put"]) {
        NSMutableData *data = [NSMutableData data];
        NSFileHandle *input = NSFileHandle.fileHandleWithStandardInput;
        while (data.length <= MaxAuth) {
            NSData *chunk = [input readDataOfLength:16384];
            if (!chunk.length) break;
            [data appendData:chunk];
        }
        if (!data.length || data.length > MaxAuth) return 1;
        item[(__bridge id)kSecValueData] = data;
        return SecItemAdd((__bridge CFDictionaryRef)item, NULL) == errSecSuccess ? 0 : 1;
    }
    if ([action isEqualToString:@"get"]) {
        item[(__bridge id)kSecReturnData] = @YES;
        item[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
        CFTypeRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)item, &result);
        NSData *data = CFBridgingRelease(result);
        return status == errSecSuccess && data.length <= MaxAuth ? writeBytes(data) : 1;
    }
    if ([action isEqualToString:@"delete"]) {
        OSStatus status = SecItemDelete((__bridge CFDictionaryRef)item);
        return status == errSecSuccess || status == errSecItemNotFound ? 0 : 1;
    }
    return 1;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) return 1;
        NSString *action = [NSString stringWithUTF8String:argv[1]];
        if (argc == 2 && [action isEqualToString:@"desktop"]) return desktop();
        if (argc == 2 && [action isEqualToString:@"probe"]) {
            SecKeychainRef defaultKeychain = NULL;
            OSStatus status = SecKeychainCopyDefault(&defaultKeychain);
            if (defaultKeychain) CFRelease(defaultKeychain);
            if (status != errSecSuccess) {
                fprintf(stderr, "Default keychain unavailable (%d).\n", (int)status);
                return 1;
            }
            puts("ok");
            return 0;
        }
        if (argc == 4 && [action isEqualToString:@"quit"]) return quit(argv[2], argv[3]);
        if (argc == 3) return keychain(action, [NSString stringWithUTF8String:argv[2]]);
        return 1;
    }
}
