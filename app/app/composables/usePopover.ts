import type { Ref } from 'vue'

/**
 * A panel anchored to a trigger, teleported to <body> so side panels and cards
 * never clip it. Flips above the trigger when there's no room below, stays on
 * screen horizontally, follows scroll/resize, and closes on an outside press.
 * Used by the date and time pickers (UiSelect has the same behaviour built in).
 */
export function usePopover(trigger: Ref<HTMLElement | null>, panel: Ref<HTMLElement | null>, opts: { width: number; height: number }) {
  const open = ref(false)
  const pos = reactive({ top: 0, bottom: 0, left: 0, up: false })

  function place() {
    const el = trigger.value
    if (!el) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const below = vh - r.bottom - 12
    pos.up = below < opts.height && r.top - 12 > below
    pos.left = Math.min(Math.max(8, r.left), window.innerWidth - opts.width - 8)
    pos.top = r.bottom + 6
    pos.bottom = vh - r.top + 6
  }
  const style = computed(() => ({ left: `${pos.left}px`, width: `${opts.width}px`, ...(pos.up ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }) }))

  function onDocDown(e: Event) {
    const t = e.target as Node
    if (trigger.value?.contains(t) || panel.value?.contains(t)) return
    open.value = false
  }
  function onViewport(e: Event) {
    if (e.type === 'scroll' && panel.value?.contains(e.target as Node)) return
    place()
  }
  function listen(on: boolean) {
    const m = on ? 'addEventListener' : 'removeEventListener'
    document[m]('pointerdown', onDocDown, true)
    window[m]('resize', onViewport)
    window[m]('scroll', onViewport, true)
  }
  watch(open, (v) => { if (v) place(); listen(v) })
  onBeforeUnmount(() => listen(false))

  return { open, pos, style, place }
}
