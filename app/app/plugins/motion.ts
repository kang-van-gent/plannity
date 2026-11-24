import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Directive } from 'vue'

type AnimFrom = 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade' | 'pop'
export type AnimBinding = number | { delay?: number; from?: AnimFrom; scroll?: boolean; duration?: number } | undefined

const FROM: Record<AnimFrom, gsap.TweenVars> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: -40 },
  right: { x: 40 },
  scale: { scale: 0.92 },
  fade: {},
  pop: { scale: 0.6, rotate: -6 },
}

interface AnimEl extends HTMLElement { __anim?: gsap.core.Tween; __parallax?: gsap.core.Tween }

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) {
    gsap.registerPlugin(ScrollTrigger)
    ScrollTrigger.config({ ignoreMobileResize: true })
  }
  const curtain = useCurtain()

  function whenUncovered(run: () => void) {
    if (!curtain.value.covering) return run()
    const stop = watch(() => curtain.value.covering, (v) => {
      if (!v) { stop(); run() }
    })
  }

  /**
   * v-anim — entrance animation. Value: stagger index (number) or options.
   * SSR adds data-anim so CSS keeps the element hidden until GSAP reveals it.
   * Elements below the fold play when scrolled into view.
   */
  const anim: Directive<AnimEl, AnimBinding> = {
    getSSRProps: () => ({ 'data-anim': '' }),
    beforeMount(el) {
      if (!prefersReducedMotion()) el.style.opacity = '0'
    },
    mounted(el, binding) {
      if (prefersReducedMotion()) { el.style.opacity = '1'; return }
      const v = binding.value
      const o = typeof v === 'number' ? { delay: Math.min(v, 12) * 0.06 } : (v ?? {})
      const from = FROM[o.from ?? 'up']
      whenUncovered(() => {
        el.__anim = gsap.fromTo(el, { opacity: 0, ...from }, {
          opacity: 1, x: 0, y: 0, scale: 1, rotate: 0,
          duration: o.duration ?? 0.75,
          delay: o.delay ?? 0,
          ease: o.from === 'pop' ? 'back.out(2)' : 'power3.out',
          clearProps: 'transform',
          scrollTrigger: o.scroll === false ? undefined : { trigger: el, start: 'top 92%', once: true },
        })
      })
    },
    beforeUnmount(el) {
      el.__anim?.scrollTrigger?.kill()
      el.__anim?.kill()
    },
  }

  /** v-parallax="-80" — scroll-scrubbed vertical drift (scrub: true). */
  const parallax: Directive<AnimEl, number | { y?: number; x?: number; rotate?: number } | undefined> = {
    mounted(el, binding) {
      if (prefersReducedMotion()) return
      const v = binding.value
      const o = typeof v === 'number' ? { y: v } : (v ?? { y: -60 })
      el.__parallax = gsap.to(el, {
        y: o.y ?? 0, x: o.x ?? 0, rotate: o.rotate ?? 0, ease: 'none',
        scrollTrigger: { trigger: el.closest('[data-parallax-root]') ?? el, start: 'top bottom', end: 'bottom top', scrub: true },
      })
    },
    beforeUnmount(el) {
      el.__parallax?.scrollTrigger?.kill()
      el.__parallax?.kill()
    },
  }

  nuxtApp.vueApp.directive('anim', anim)
  nuxtApp.vueApp.directive('parallax', parallax)

  if (import.meta.client) {
    nuxtApp.hook('page:transition:finish', () => ScrollTrigger.refresh())
    nuxtApp.hook('page:finish', () => { requestAnimationFrame(() => ScrollTrigger.refresh()) })
  }
})

declare module 'vue' {
  interface ComponentCustomProperties {
    vAnim: Directive<HTMLElement, AnimBinding>
    vParallax: Directive<HTMLElement, number | { y?: number; x?: number; rotate?: number } | undefined>
  }
}
