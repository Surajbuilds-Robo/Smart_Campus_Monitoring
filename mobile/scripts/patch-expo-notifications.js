/**
 * Postinstall patch script for expo-notifications.
 * Fixes startup crash on Android (in Expo Go and custom runtimes without FCM)
 * where TopicSubscriptionModule.android.js calls requireNativeModule instead of
 * requireOptionalNativeModule with a safe fallback stub (matching TopicSubscriptionModule.js).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetBuildFile = path.resolve(
  __dirname,
  '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js'
);
const targetSrcFile = path.resolve(
  __dirname,
  '../node_modules/expo-notifications/src/TopicSubscriptionModule.android.ts'
);

const patchedBuildContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

const nativeModule = typeof requireOptionalNativeModule === 'function'
  ? requireOptionalNativeModule('ExpoTopicSubscriptionModule')
  : null;

const fallback = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

export default nativeModule || fallback;
//# sourceMappingURL=TopicSubscriptionModule.android.js.map
`;

const patchedSrcContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

import type { TopicSubscriptionModule } from './TopicSubscriptionModule.types';

const nativeModule = typeof requireOptionalNativeModule === 'function'
  ? requireOptionalNativeModule<TopicSubscriptionModule>('ExpoTopicSubscriptionModule')
  : null;

const fallback: TopicSubscriptionModule = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

export default nativeModule || fallback;
`;

let changed = false;

if (fs.existsSync(targetBuildFile)) {
  const content = fs.readFileSync(targetBuildFile, 'utf8');
  if (content.includes("requireNativeModule('ExpoTopicSubscriptionModule')")) {
    fs.writeFileSync(targetBuildFile, patchedBuildContent, 'utf8');
    console.log('[patch-expo-notifications] Successfully patched build/TopicSubscriptionModule.android.js');
    changed = true;
  } else {
    console.log('[patch-expo-notifications] build/TopicSubscriptionModule.android.js is already patched.');
  }
} else {
  console.log('[patch-expo-notifications] Target build file not found (expo-notifications not installed).');
}

if (fs.existsSync(targetSrcFile)) {
  const content = fs.readFileSync(targetSrcFile, 'utf8');
  if (content.includes("requireNativeModule<TopicSubscriptionModule>('ExpoTopicSubscriptionModule')")) {
    fs.writeFileSync(targetSrcFile, patchedSrcContent, 'utf8');
    console.log('[patch-expo-notifications] Successfully patched src/TopicSubscriptionModule.android.ts');
    changed = true;
  } else {
    console.log('[patch-expo-notifications] src/TopicSubscriptionModule.android.ts is already patched.');
  }
}

if (changed) {
  console.log('[patch-expo-notifications] All patches applied cleanly.');
}
