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

interface AnimEl extends HTMLElement {
  __anim?: gsap.core.Tween
  __animPlay?: () => void
  __parallax?: gsap.core.Tween
}

export default defineNuxtPlugin((nuxtApp) => {
  const curtain = useCurtain()

  if (import.meta.client) {
    gsap.registerPlugin(ScrollTrigger)
    // Mobile address-bar show/hide must not re-layout scrubbed scenes mid-scroll.
    ScrollTrigger.config({ ignoreMobileResize: true })
    gsap.config({ force3D: true })
  }

  // One shared observer for every v-anim element. Unlike a per-element
  // ScrollTrigger it tracks real layout, so an element always plays when it
  // actually becomes visible, even if content above it changed height after
  // mount (skeleton → data, images, fonts).
  let io: IntersectionObserver | null = null
  function observer() {
    io ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io!.unobserve(e.target)
        ;(e.target as AnimEl).__animPlay?.()
      }
    }, { rootMargin: '0px 0px -6% 0px' })
    return io
  }

  /**
   * v-anim — entrance animation. Value: stagger index (number) or options.
   * SSR adds data-anim so CSS keeps the element hidden until GSAP reveals it.
   * Elements below the fold play when scrolled into view; nothing plays while
   * the page curtain is still covering the screen.
   */
  const anim: Directive<AnimEl, AnimBinding> = {
    getSSRProps: () => ({ 'data-anim': '' }),
    beforeMount(el) {
      if (!prefersReducedMotion()) el.style.opacity = '0'
    },
    mounted(el, binding) {
      if (prefersReducedMotion()) { el.style.opacity = '1'; return }
      const v = binding.value
      const o = typeof v === 'number' ? { delay: Math.min(v, 10) * 0.055 } : (v ?? {})
      const from = FROM[o.from ?? 'up']
      el.__animPlay = () => {
        el.__animPlay = undefined
        afterCurtain(curtain, () => {
          if (!el.isConnected) return
          el.__anim = gsap.fromTo(el, { opacity: 0, ...from }, {
            opacity: 1, x: 0, y: 0, scale: 1, rotate: 0,
            duration: o.duration ?? 0.7,
            delay: o.delay ?? 0,
            ease: o.from === 'pop' ? 'back.out(2)' : 'power3.out',
            clearProps: 'transform,willChange',
            onStart: () => { el.style.willChange = 'transform, opacity' },
          })
        })
      }
      if (o.scroll === false) el.__animPlay()
      else observer().observe(el)
    },
    beforeUnmount(el) {
      io?.unobserve(el)
      el.__animPlay = undefined
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
    // Scrubbed scenes cache their start/end positions. Re-measure whenever the
    // page height settles (data loaded, fonts swapped, accordion opened) so
    // they stay in sync with what is on screen. Debounced; skipped while a
    // transition is running so it never measures a half-moved page.
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastH = 0
    const refresh = (attempt = 0) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const busy = curtain.value.active || document.documentElement.dataset.transitioning
        if (busy && attempt < 20) return refresh(attempt + 1)
        if (!ScrollTrigger.getAll().length) return
        ScrollTrigger.refresh()
      }, 180)
    }
    nuxtApp.hook('app:mounted', () => {
      new ResizeObserver(() => {
        const h = document.body.scrollHeight
        if (Math.abs(h - lastH) < 2) return
        lastH = h
        refresh()
      }).observe(document.body)
      document.fonts?.ready.then(() => refresh())
    })
    nuxtApp.hook('page:transition:finish', () => refresh())
    nuxtApp.hook('page:finish', () => refresh())
  }
})

declare module 'vue' {
  interface ComponentCustomProperties {
    vAnim: Directive<HTMLElement, AnimBinding>
    vParallax: Directive<HTMLElement, number | { y?: number; x?: number; rotate?: number } | undefined>
  }
}
