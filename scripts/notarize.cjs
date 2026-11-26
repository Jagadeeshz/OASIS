// Runs after electron-builder signs the .app (mac target only).
// Notarizes with Apple's notary service when credentials exist; otherwise
// leaves the build unsigned-but-valid and prints exactly why.
const path = require('node:path');

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
  const hasAppPassword = APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID;
  const hasApiKey = APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER;

  if (!hasAppPassword && !hasApiKey) {
    console.log('[notarize] skipped — no Apple credentials in the environment.');
    console.log('[notarize] set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or APPLE_API_KEY*), then rebuild.');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const { notarize: run } = require('@electron/notarize');

  console.log(`[notarize] submitting ${appPath}`);
  await run(
    hasApiKey
      ? { appPath, appleApiKey: APPLE_API_KEY, appleApiKeyId: APPLE_API_KEY_ID, appleApiIssuer: APPLE_API_ISSUER }
      : { appPath, appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID },
  );
  console.log('[notarize] done — staple with: xcrun stapler staple <path>.dmg');
};
