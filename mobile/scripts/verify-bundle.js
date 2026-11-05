async function testBundle() {
  console.log('Fetching Android bundle from Metro...');
  const res = await fetch('http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true');
  console.log('HTTP Status:', res.status);
  if (!res.ok) {
    const errText = await res.text();
    console.error('Error response:', errText.slice(0, 500));
    process.exit(1);
  }

  const bundle = await res.text();
  console.log('Bundle Length:', bundle.length, 'bytes');

  const hasOptional = bundle.includes('requireOptionalNativeModule');
  const hasFallback = bundle.includes('subscribeToTopicAsync: () => Promise.resolve(null)');
  const hasOldCrash = bundle.includes("requireNativeModule('ExpoTopicSubscriptionModule')");

  console.log('Has requireOptionalNativeModule:', hasOptional);
  console.log('Has fallback stub:', hasFallback);
  console.log('Has old crashing call requireNativeModule("ExpoTopicSubscriptionModule"):', hasOldCrash);

  if (hasOptional && hasFallback && !hasOldCrash) {
    console.log('SUCCESS: Android bundle contains patched TopicSubscriptionModule with graceful fallback!');
  } else {
    console.error('FAILURE: Bundle verification did not match expected patched output.');
    process.exit(1);
  }
}

testBundle().catch((e) => {
  console.error('Test bundle failed:', e);
  process.exit(1);
});
