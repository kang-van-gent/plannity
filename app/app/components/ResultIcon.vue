<script setup lang="ts">
import { gsap } from 'gsap'
import type { NoticeType } from '~/composables/useNotify'

const props = withDefaults(defineProps<{ type: NoticeType; size?: number; delay?: number; autoplay?: boolean }>(), { size: 44, delay: 0.15, autoplay: true })

const COLORS: Record<NoticeType, string> = { success: '#2FA86A', error: '#E5484D', warning: '#F08C00', cancel: '#8A84A3', info: '#6C4CF5' }
const CONFETTI = ['#6C4CF5', '#FF6FAE', '#FFB23F', '#62C5F4', '#A7E66B']
const color = computed(() => COLORS[props.type])
const root = ref<HTMLElement | null>(null)

function play() {
  const el = root.value
  if (!el || prefersReducedMotion()) return
  const svg = el.querySelector('svg')!
  const bg = el.querySelector('[data-bg]')
  const draws = Array.from(el.querySelectorAll<SVGGeometryElement>('[data-draw]'))
  const pops = Array.from(el.querySelectorAll('[data-pop]'))
  draws.forEach((p) => { const len = p.getTotalLength(); gsap.set(p, { strokeDasharray: len, strokeDashoffset: len }) })
  if (pops.length) gsap.set(pops, { scale: 0, transformOrigin: '50% 50%' })
  const tl = gsap.timeline({ delay: props.delay })
  tl.fromTo(bg, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.45, ease: 'back.out(2.4)' })
  tl.to(draws, { strokeDashoffset: 0, duration: 0.32, stagger: 0.12, ease: 'power2.out' }, '-=0.25')
  if (pops.length) tl.to(pops, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, '-=0.1')

  switch (props.type) {
    case 'success':
      tl.to(svg, { scale: 1.18, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.inOut', transformOrigin: '50% 50%' }, '-=0.15')
      tl.add(() => burst(el), '<')
      break
    case 'error':
      tl.to(svg, { keyframes: { x: [0, -6, 6, -5, 5, -2, 0] }, duration: 0.5, ease: 'none' }, '-=0.1')
      break
    case 'warning':
      tl.to(svg, { keyframes: { rotate: [0, -14, 11, -7, 4, 0] }, duration: 0.6, ease: 'none', transformOrigin: '50% 85%' }, '-=0.1')
      break
    case 'cancel':
      tl.fromTo(svg, { rotate: -140 }, { rotate: 0, duration: 0.7, ease: 'back.out(1.4)', transformOrigin: '50% 50%' }, 0)
      tl.to(svg, { opacity: 0.75, duration: 0.3 })
      break
    case 'info':
      tl.fromTo(el.querySelector('[data-ripple]'), { scale: 0.8, opacity: 0.5 }, { scale: 1.7, opacity: 0, duration: 0.9, ease: 'power2.out', transformOrigin: '50% 50%' }, '-=0.2')
      break
  }
}

function burst(host: HTMLElement) {
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span')
    const size = 4 + Math.random() * 5
    Object.assign(s.style, {
      position: 'absolute', left: '50%', top: '50%', width: `${size}px`, height: `${size * (i % 3 === 0 ? 2.2 : 1)}px`,
      borderRadius: i % 3 === 0 ? '2px' : '999px', background: CONFETTI[i % CONFETTI.length], pointerEvents: 'none',
    })
    host.appendChild(s)
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4
    const dist = props.size * (0.75 + Math.random() * 0.6)
    gsap.fromTo(s, { x: -size / 2, y: -size / 2, scale: 0, rotate: 0 }, {
      x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 1, rotate: Math.random() * 360,
      duration: 0.7, ease: 'power3.out', onComplete: () => { gsap.to(s, { opacity: 0, y: '+=10', duration: 0.35, onComplete: () => s.remove() }) },
    })
  }
}

onMounted(() => { if (props.autoplay) play() })
defineExpose({ play })
</script>

<template>
  <span ref="root" class="relative inline-grid shrink-0 place-items-center" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <span v-if="type === 'info'" data-ripple class="absolute inset-0 rounded-full border-2" :style="{ borderColor: color }" />
    <svg :width="size" :height="size" viewBox="0 0 48 48" fill="none" :stroke="color" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" class="overflow-visible">
      <circle data-bg cx="24" cy="24" r="22" :fill="color" fill-opacity="0.14" stroke="none" />
      <template v-if="type === 'warning'">
        <path data-draw d="M24 9.5 L39.5 36.5 H8.5 Z" />
        <path data-draw d="M24 19.5 V27" />
        <circle data-pop cx="24" cy="31.6" r="1.9" :fill="color" stroke="none" />
      </template>
      <template v-else>
        <circle data-draw cx="24" cy="24" r="16.5" transform="rotate(-90 24 24)" />
        <path v-if="type === 'success'" data-draw d="M16.5 24.5 L21.8 29.8 L31.8 19" />
        <template v-else-if="type === 'error'">
          <path data-draw d="M18.5 18.5 L29.5 29.5" />
          <path data-draw d="M29.5 18.5 L18.5 29.5" />
        </template>
        <path v-else-if="type === 'cancel'" data-draw d="M17.5 30.5 L30.5 17.5" />
        <template v-else>
          <path data-draw d="M24 22 V31" />
          <circle data-pop cx="24" cy="16.8" r="1.9" :fill="color" stroke="none" />
        </template>
      </template>
    </svg>
  </span>
</template>
