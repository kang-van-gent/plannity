export default defineNuxtPlugin(() => {
  const { apply, pref } = useTheme()
  apply()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (pref.value === 'system') apply()
  })
})
