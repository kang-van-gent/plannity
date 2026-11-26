<script setup lang="ts">
import { gsap } from 'gsap'

const { locale } = useLocale()
const curtain = useCurtain()
const config = useRuntimeConfig()
const route = useRoute()
// The landing intro plays only when the site is first loaded (or refreshed) on '/',
// never when navigating back to it — decided once, on the first render.
useState('landing-intro-done', () => route.path !== '/')

useHead({
  htmlAttrs: { lang: locale },
  link: [{ rel: 'canonical', href: computed(() => `${config.public.siteUrl}${route.path}`) }],
})
useSeoMeta({
  ogImage: '/brand/og-logo.jpg',
  ogSiteName: 'Plannity',
  twitterCard: 'summary_large_image',
})

// Inner transition for navigation inside the user panel: content fades and
// lifts out, then rises in. Opacity + transform only (GPU-composited); the
// scroll reset happens while the old page is invisible so it never jumps.
const root = () => document.documentElement
function done2(el: Element, done: () => void) {
  gsap.set(el, { clearProps: 'opacity,visibility,transform,willChange' })
  done()
}
const pageTransition = {
  name: 'page',
  mode: 'out-in' as const,
  css: false,
  onBeforeLeave() {
    if (!curtain.value.active) root().dataset.transitioning = '1'
  },
  onLeave(el: Element, done: () => void) {
    if (curtain.value.active || prefersReducedMotion()) return done()
    gsap.to(el, {
      autoAlpha: 0, y: -10, duration: 0.18, ease: 'power2.in', willChange: 'transform, opacity', overwrite: true,
      onComplete: () => { window.scrollTo({ top: 0, behavior: 'instant' }); done() },
    })
  },
  onEnter(el: Element, done: () => void) {
    if (curtain.value.active || prefersReducedMotion()) {
      if (!curtain.value.active) window.scrollTo({ top: 0, behavior: 'instant' })
      return done2(el, done)
    }
    gsap.fromTo(el, { autoAlpha: 0, y: 18 }, {
      autoAlpha: 1, y: 0, duration: 0.42, ease: 'power3.out', willChange: 'transform, opacity', overwrite: true,
      onComplete: () => done2(el, done),
    })
  },
  onAfterEnter() {
    if (!curtain.value.active) delete root().dataset.transitioning
  },
  onEnterCancelled: (el: Element) => gsap.set(el, { clearProps: 'all' }),
  onLeaveCancelled: (el: Element) => gsap.set(el, { clearProps: 'all' }),
}
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator color="linear-gradient(90deg,#6C4CF5,#FF6FAE,#FFB23F)" :height="3" />
    <NuxtLayout>
      <NuxtPage :transition="pageTransition" />
    </NuxtLayout>
    <ActionCenter />
    <PageCurtain />
  </div>
</template>
