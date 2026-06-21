/*
 * True for "empty"/new-tab pages that shouldn't be tracked or offered as
 * artefacts (e.g. chrome://newtab/, about:blank).
 */
export function isBlankTab(url: string | undefined | null): boolean {
  if (!url) return true;
  const u = url.trim().toLowerCase();
  if (u === '') return true;
  if (
    u.startsWith('about:blank') ||
    u.startsWith('about:newtab') ||
    u.startsWith('about:home')
  ) {
    return true;
  }
  // chrome/edge/brave/vivaldi/etc. new-tab pages
  if (/^[a-z-]+:\/\/(newtab|new-tab-page|startpageshared)\/?$/.test(u)) {
    return true;
  }
  return false;
}
