const { notarize } = require('@electron/notarize');
const { execFileSync } = require('child_process');
const { build } = require('../../package.json');

/**
 * afterSign hook.
 *
 * If real notarization credentials are present (Apple Developer ID, in CI) we
 * notarize the app. Otherwise — the normal case for this unsigned/free build —
 * we give the bundle a clean ad-hoc signature with `codesign --force --deep
 * --sign -`. electron-builder otherwise leaves only Electron's linker ad-hoc
 * signature, whose resource seal is broken, which makes macOS report the
 * downloaded app as "damaged". A valid ad-hoc signature lets the app launch
 * once the user removes the download quarantine (see README install notes).
 */
exports.default = async function afterSignMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const canNotarize =
    process.env.CI === 'true' &&
    'APPLE_ID' in process.env &&
    'APPLE_ID_PASS' in process.env;

  if (canNotarize) {
    await notarize({
      appBundleId: build.appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASS,
    });
    return;
  }

  console.warn(
    'No notarization credentials — applying a clean ad-hoc signature instead.'
  );
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'inherit',
    });
    console.warn(`Ad-hoc signed ${appPath}`);
  } catch (err) {
    console.error('Ad-hoc codesign failed', err);
    throw err;
  }
};
