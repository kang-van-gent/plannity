export type FontSizePref = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: FontSizePref[] = ['sm', 'md', 'lg', 'xl']

/**
 * The person's text size for the app panel. It sets the root font size
 * (html[data-font-size] in main.css); all text sizes are in rem, so the whole
 * app scales with it. A cookie (like the theme) so the server renders the
 * right size and the page never jumps on load.
 */
export function useFontSize() {
  const pref = useCookie<FontSizePref>('plannity-font-size', { default: () => 'md', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const current = computed<FontSizePref>(() => (SIZES.includes(pref.value) ? pref.value : 'md'))
  function set(next: FontSizePref) { pref.value = next }
  return { pref: current, set }
}
