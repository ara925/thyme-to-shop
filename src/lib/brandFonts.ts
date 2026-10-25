/** Keep Google's font stylesheet out of the render-blocking HTML path. */
export function activateBrandFonts(root: Document = document): void {
  const link = root.getElementById('brand-fonts');
  if (!(link instanceof HTMLLinkElement) || link.rel !== 'preload' || link.as !== 'style') return;
  link.rel = 'stylesheet';
  link.removeAttribute('as');
}
