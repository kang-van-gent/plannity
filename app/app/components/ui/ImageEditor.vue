<script setup lang="ts">
import { Maximize, Minimize, RotateCcw, RotateCw, ZoomIn, ZoomOut } from '@lucide/vue'

/**
 * Crop / zoom / position / rotate an image into a square before uploading it
 * (brand logos, profile photos). Runs in the browser on a canvas; the result is a
 * 512×512 PNG (transparency kept) handed back as a File.
 *
 * - Drag to move, scroll or pinch to zoom, the slider and buttons do the same.
 * - Keyboard on the canvas: arrows move, +/− zoom, R rotates.
 * - Fit = the whole image visible; Fill = covers the square (crops the edges).
 * - Background (logos): transparent, white or the brand colour.
 * - The preview is clipped to how it's shown (rounded square or circle), with
 *   small live previews at real sizes.
 */
const props = withDefaults(defineProps<{
  open: boolean
  /** A picked file, or the URL of the current image (must allow CORS). */
  source: File | string | null
  shape?: 'rounded' | 'circle'
  /** Offer transparent / white / brand-colour backgrounds (logos). */
  backgrounds?: boolean
  brandColor?: string
  title?: string
  /** Start with Fit (logos) or Fill (photos). */
  initialFit?: 'contain' | 'cover'
  fileName?: string
}>(), { shape: 'rounded', backgrounds: false, brandColor: '#6C4CF5', title: '', initialFit: 'contain', fileName: 'image' })
const emit = defineEmits<{ close: []; apply: [file: File] }>()

const { t } = useLocale()
const notify = useNotify()

const OUT = 512
const canvas = ref<HTMLCanvasElement | null>(null)
const small = ref<HTMLCanvasElement | null>(null)
const tiny = ref<HTMLCanvasElement | null>(null)
const img = shallowRef<HTMLImageElement | null>(null)
const loading = ref(false)
const failed = ref(false)
const saving = ref(false)

const state = reactive({ fit: props.initialFit as 'contain' | 'cover', zoom: 1, x: 0, y: 0, rotation: 0, bg: 'transparent' as 'transparent' | 'white' | 'color' })
const MIN_ZOOM = 0.3
const MAX_ZOOM = 5

let objectUrl: string | null = null
function release() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null } }

async function load() {
  release()
  img.value = null
  failed.value = false
  if (!props.source) return
  loading.value = true
  const el = new Image()
  if (typeof props.source === 'string') {
    // Saved images come from the API server: CORS lets the canvas export them again.
    if (/^https?:/.test(props.source)) el.crossOrigin = 'anonymous'
    el.src = props.source
  } else {
    objectUrl = URL.createObjectURL(props.source)
    el.src = objectUrl
  }
  try {
    await el.decode()
    img.value = el
    Object.assign(state, { fit: props.initialFit, zoom: 1, x: 0, y: 0, rotation: 0, bg: 'transparent' })
    nextTick(draw)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
watch(() => [props.open, props.source] as const, ([open]) => { if (open) load() }, { immediate: true })
onBeforeUnmount(release)

/** Scale that makes the (rotated) image fit or fill the square at zoom 1. */
function baseScale(el: HTMLImageElement) {
  const turned = state.rotation % 180 !== 0
  const w = turned ? el.naturalHeight : el.naturalWidth
  const h = turned ? el.naturalWidth : el.naturalHeight
  return state.fit === 'contain' ? Math.min(OUT / w, OUT / h) : Math.max(OUT / w, OUT / h)
}

function render(ctx: CanvasRenderingContext2D, el: HTMLImageElement) {
  ctx.clearRect(0, 0, OUT, OUT)
  if (state.bg !== 'transparent') {
    ctx.fillStyle = state.bg === 'white' ? '#ffffff' : props.brandColor
    ctx.fillRect(0, 0, OUT, OUT)
  }
  const s = baseScale(el) * state.zoom
  ctx.save()
  ctx.translate(OUT / 2 + state.x, OUT / 2 + state.y)
  ctx.rotate((state.rotation * Math.PI) / 180)
  ctx.scale(s, s)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(el, -el.naturalWidth / 2, -el.naturalHeight / 2)
  ctx.restore()
}

let frame = 0
function draw() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const el = img.value
    const ctx = canvas.value?.getContext('2d')
    if (!el || !ctx) return
    render(ctx, el)
    for (const c of [small.value, tiny.value]) {
      const sctx = c?.getContext('2d')
      if (!c || !sctx) continue
      sctx.clearRect(0, 0, c.width, c.height)
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(canvas.value!, 0, 0, c.width, c.height)
    }
  })
}
watch(state, draw, { deep: true })

// ---- move & zoom ----
const DISPLAY = 288
let drag: { id: number; x: number; y: number } | null = null
const pinch = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; zoom: number } | null = null
const ratio = () => OUT / (canvas.value?.getBoundingClientRect().width || DISPLAY)

function onDown(e: PointerEvent) {
  (e.target as HTMLElement).setPointerCapture(e.pointerId)
  pinch.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinch.size === 2) {
    const [a, b] = [...pinch.values()]
    pinchStart = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: state.zoom }
    drag = null
  } else drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
}
function onMove(e: PointerEvent) {
  if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinchStart && pinch.size === 2) {
    const [a, b] = [...pinch.values()]
    setZoom(pinchStart.zoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinchStart.dist))
    return
  }
  if (!drag || drag.id !== e.pointerId) return
  const k = ratio()
  state.x += (e.clientX - drag.x) * k
  state.y += (e.clientY - drag.y) * k
  drag.x = e.clientX
  drag.y = e.clientY
}
function onUp(e: PointerEvent) {
  pinch.delete(e.pointerId)
  if (pinch.size < 2) pinchStart = null
  if (drag?.id === e.pointerId) drag = null
}
function setZoom(z: number) { state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100)) }
function onWheel(e: WheelEvent) { setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) }
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 40 : 10
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  if (e.key in moves) { e.preventDefault(); state.x += moves[e.key]![0]; state.y += moves[e.key]![1] }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(state.zoom * 1.1) }
  else if (e.key === '-') { e.preventDefault(); setZoom(state.zoom / 1.1) }
  else if (e.key.toLowerCase() === 'r') { e.preventDefault(); rotate(e.shiftKey ? -90 : 90) }
}
function rotate(deg: number) { state.rotation = (state.rotation + deg + 360) % 360 }
function setFit(fit: 'contain' | 'cover') { Object.assign(state, { fit, zoom: 1, x: 0, y: 0 }) }
function reset() { Object.assign(state, { fit: props.initialFit, zoom: 1, x: 0, y: 0, rotation: 0, bg: 'transparent' }) }

async function apply() {
  const el = img.value
  if (!el) return
  saving.value = true
  try {
    const out = document.createElement('canvas')
    out.width = OUT
    out.height = OUT
    render(out.getContext('2d')!, el)
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('export failed')
    emit('apply', new File([blob], `${props.fileName}.png`, { type: 'image/png' }))
  } catch {
    notify.error(t('editor.exportFailed'), t('editor.exportFailedBody'))
  } finally {
    saving.value = false
  }
}

const zoomPct = computed(() => `${Math.round(state.zoom * 100)}%`)
const clip = computed(() => (props.shape === 'circle' ? 'rounded-full' : 'rounded-[35%]'))
</script>

<template>
  <SidePanel :open="open" size="sm" :title="title || t('editor.title')" :subtitle="t('editor.subtitle')" @close="emit('close')">
    <div v-if="loading" class="skeleton mx-auto aspect-square w-full max-w-[18rem] rounded-3xl" aria-busy="true" />
    <p v-else-if="failed" class="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{{ t('editor.loadFailed') }}</p>
    <template v-else-if="img">
      <!-- Canvas: checkerboard shows transparency; clipped to how it's displayed -->
      <div class="mx-auto w-full max-w-[18rem]">
        <div class="checker relative aspect-square w-full overflow-hidden shadow-soft ring-1 ring-line" :class="clip">
          <canvas ref="canvas" :width="OUT" :height="OUT" tabindex="0" :aria-label="t('editor.canvasLabel')"
            class="size-full cursor-grab touch-none outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 active:cursor-grabbing"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @wheel.prevent="onWheel" @keydown="onKey" />
        </div>
        <p class="mt-2 text-center text-xs text-muted">{{ t('editor.dragHint') }}</p>
      </div>

      <!-- Zoom -->
      <div class="flex items-center gap-2">
        <button type="button" class="btn-icon btn-ghost !p-2" :aria-label="t('editor.zoomOut')" @click="setZoom(state.zoom / 1.15)"><ZoomOut class="size-4" /></button>
        <input v-model.number="state.zoom" type="range" :min="MIN_ZOOM" :max="MAX_ZOOM" step="0.01" class="min-w-0 flex-1 accent-brand-500" :aria-label="t('editor.zoom')">
        <button type="button" class="btn-icon btn-ghost !p-2" :aria-label="t('editor.zoomIn')" @click="setZoom(state.zoom * 1.15)"><ZoomIn class="size-4" /></button>
        <span class="w-12 text-right text-xs tabular-nums text-muted">{{ zoomPct }}</span>
      </div>

      <!-- Fit / fill, rotate -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="segmented" role="group" :aria-label="t('editor.fit')">
          <button type="button" class="flex items-center gap-1.5 !py-1.5 text-xs" :aria-pressed="state.fit === 'contain'" @click="setFit('contain')"><Minimize class="size-3.5" />{{ t('editor.fitWhole') }}</button>
          <button type="button" class="flex items-center gap-1.5 !py-1.5 text-xs" :aria-pressed="state.fit === 'cover'" @click="setFit('cover')"><Maximize class="size-3.5" />{{ t('editor.fill') }}</button>
        </div>
        <span class="flex-1" />
        <button type="button" class="btn-icon btn-ghost !p-2" :aria-label="t('editor.rotateLeft')" @click="rotate(-90)"><RotateCcw class="size-4" /></button>
        <button type="button" class="btn-icon btn-ghost !p-2" :aria-label="t('editor.rotateRight')" @click="rotate(90)"><RotateCw class="size-4" /></button>
      </div>

      <!-- Background (logos) -->
      <div v-if="backgrounds">
        <span class="label">{{ t('editor.background') }}</span>
        <div class="flex gap-2" role="group" :aria-label="t('editor.background')">
          <button v-for="b in (['transparent', 'white', 'color'] as const)" :key="b" type="button"
            class="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-semibold transition"
            :class="state.bg === b ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="state.bg === b" @click="state.bg = b">
            <span class="size-4 rounded-md ring-1 ring-line" :class="b === 'transparent' && 'checker'" :style="b === 'white' ? { background: '#fff' } : b === 'color' ? { background: brandColor } : {}" />
            {{ t(`editor.bg.${b}`) }}
          </button>
        </div>
      </div>

      <!-- How it looks at real sizes -->
      <div class="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <span class="text-xs text-muted">{{ t('editor.preview') }}</span>
        <span class="grid size-14 place-items-center overflow-hidden bg-white ring-1 ring-black/5" :class="clip"><canvas ref="small" width="112" height="112" :class="shape === 'circle' ? 'size-full' : 'size-[86%]'" /></span>
        <span class="grid size-7 place-items-center overflow-hidden bg-white ring-1 ring-black/5" :class="clip"><canvas ref="tiny" width="56" height="56" :class="shape === 'circle' ? 'size-full' : 'size-[86%]'" /></span>
        <span class="flex-1" />
        <button type="button" class="btn-ghost btn-sm" @click="reset">{{ t('editor.reset') }}</button>
      </div>
    </template>

    <template #footer="{ close }">
      <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
      <button type="button" class="btn-primary" :disabled="!img || saving" @click="apply">{{ t('editor.apply') }}</button>
    </template>
  </SidePanel>
</template>

<style scoped>
.checker {
  background-color: #fff;
  background-image: linear-gradient(45deg, #e9e6f5 25%, transparent 25%), linear-gradient(-45deg, #e9e6f5 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e9e6f5 75%), linear-gradient(-45deg, transparent 75%, #e9e6f5 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
</style>
