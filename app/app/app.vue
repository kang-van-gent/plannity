<script setup lang="ts">
import { gsap } from 'gsap'

const { locale } = useLocale()
const curtain = useCurtain()
const config = useRuntimeConfig()
const route = useRoute()

useHead({
  htmlAttrs: { lang: locale },
  link: [{ rel: 'canonical', href: computed(() => `${config.public.siteUrl}${route.path}`) }],
})
useSeoMeta({
  ogImage: '/brand/og-logo.jpg',
  ogSiteName: 'Plannity',
  twitterCard: 'summary_large_image',
})

// Inner transition for navigation inside the user panel: content blurs out
// and slides up in. Skipped while the page curtain is covering the screen.
const pageTransition = {
  name: 'page',
  mode: 'out-in' as const,
  css: false,
  onLeave(el: Element, done: () => void) {
    if (curtain.value.active || prefersReducedMotion()) return done()
    gsap.to(el, { autoAlpha: 0, y: -12, filter: 'blur(6px)', duration: 0.22, ease: 'power2.in', onComplete: done })
  },
  onEnter(el: Element, done: () => void) {
    if (curtain.value.active || prefersReducedMotion()) return done()
    window.scrollTo({ top: 0 })
    gsap.fromTo(el, { autoAlpha: 0, y: 22, filter: 'blur(8px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out', clearProps: 'filter,transform,opacity,visibility', onComplete: done })
  },
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
