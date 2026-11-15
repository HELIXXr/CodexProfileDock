#import <AppKit/AppKit.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <poll.h>
#include <unistd.h>
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

static BOOL authorizeSession(void) {
    LAContext *context = [[LAContext alloc] init];
    NSError *error = nil;
    if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error]) return NO;
    __block BOOL finished = NO;
    __block BOOL allowed = NO;
    [context evaluatePolicy:LAPolicyDeviceOwnerAuthentication
            localizedReason:@"Allow Profile Dock to access saved Codex accounts."
                      reply:^(BOOL success, NSError *failure) {
        dispatch_async(dispatch_get_main_queue(), ^{
            allowed = success;
            finished = YES;
        });
    }];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:60];
    while (!finished && deadline.timeIntervalSinceNow > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                               beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }
    [context invalidate];
    return finished && allowed;
}

static NSData *sessionData(NSString *action, NSString *account, NSData *data, BOOL *ok) {
    NSMutableDictionary *query = [@{
        (__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:Service,
        (__bridge id)kSecAttrAccount:account,
    } mutableCopy];
    if ([action isEqualToString:@"put"]) {
        query[(__bridge id)kSecValueData] = data;
        *ok = SecItemAdd((__bridge CFDictionaryRef)query,NULL) == errSecSuccess;
    } else if ([action isEqualToString:@"get"]) {
        query[(__bridge id)kSecReturnData] = @YES;
        query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
        CFTypeRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query,&result);
        NSData *bytes = CFBridgingRelease(result);
        *ok = status == errSecSuccess && bytes.length <= MaxAuth;
        return *ok ? bytes : nil;
    } else if ([action isEqualToString:@"delete"]) {
        OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
        *ok = status == errSecSuccess || status == errSecItemNotFound;
    }
    return nil;
}

static int session(void) {
    char *line = NULL;
    size_t capacity = 0;
    BOOL authorized = NO;
    NSDate *expires = nil;
    while (YES) {
        struct pollfd descriptor = {.fd=STDIN_FILENO,.events=POLLIN};
        if (poll(&descriptor,1,60000) <= 0) break;
        ssize_t length = getline(&line,&capacity,stdin);
        if (length <= 0) break;
        if ((NSUInteger)length > MaxAuth * 2) { free(line); return 1; }
        @autoreleasepool {
            NSData *input = [NSData dataWithBytes:line length:(NSUInteger)length];
            NSDictionary *request = [NSJSONSerialization JSONObjectWithData:input options:0 error:NULL];
            if (![request isKindOfClass:[NSDictionary class]]) break;
            NSString *account=request[@"account"], *action=request[@"action"], *encoded=request[@"data"];
            if (![account isKindOfClass:[NSString class]] || ![[NSUUID alloc] initWithUUIDString:account] ||
                ![action isKindOfClass:[NSString class]] ||
                ![@[@"get",@"put",@"delete"] containsObject:action] ||
                ![encoded isKindOfClass:[NSString class]] ||
                ![request[@"id"] isKindOfClass:[NSNumber class]]) break;
            NSData *data=[[NSData alloc] initWithBase64EncodedString:encoded options:0];
            if (data.length > MaxAuth || ([action isEqualToString:@"put"] && !data.length)) break;
            if (!authorized) {
                if (!authorizeSession()) {
                    writeBytes([NSJSONSerialization dataWithJSONObject:@{@"id":request[@"id"],@"ok":@NO} options:0 error:NULL]);
                    puts(""); fflush(stdout); break;
                }
                authorized=YES;
                expires=[NSDate dateWithTimeIntervalSinceNow:120];
            }
            if (expires.timeIntervalSinceNow <= 0) break;
            BOOL ok=NO;
            NSData *reply=sessionData(action,account,data,&ok);
            NSDictionary *output=@{@"id":request[@"id"],@"ok":@(ok),
                                   @"data":reply ? [reply base64EncodedStringWithOptions:0] : @""};
            writeBytes([NSJSONSerialization dataWithJSONObject:output options:0 error:NULL]);
            puts(""); fflush(stdout);
        }
    }
    free(line);
    return 0;
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
        if (argc == 2 && [action isEqualToString:@"session"]) return session();
        return 1;
    }
}
