<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, ImageOff, ImagePlus, Images, Maximize2, RefreshCw, Trash2, Upload, X } from '@lucide/vue'
import type { ContentImage } from '~/types'
import { isApiError } from '~/services/api/contract'

// "Post Images" (image feature spec): upload, preview, download, replace,
// remove and reorder. Mutations only when the user can edit this content;
// the backend enforces the same rule and re-validates every file.
const props = defineProps<{ contentId: string; modelValue: ContentImage[]; canEdit: boolean; title: string }>()
const emit = defineEmits<{ 'update:modelValue': [ContentImage[]] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const config = useRuntimeConfig()
const { downloadOne, downloadAll, zipping } = useImageDownloads()

const maxMb = Number(config.public.imageMaxMb) || 10
const maxCount = Number(config.public.imageMaxCount) || 10
const images = computed(() => props.modelValue)
const full = computed(() => images.value.length >= maxCount)

const fileInput = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
const replacing = ref<ContentImage | null>(null)
const uploading = ref<number | null>(null) // progress %, null when idle
const busyId = ref<string | null>(null)
const dragOver = ref(false)
// Images whose file couldn't be loaded (storage gone / network): show a placeholder, not a broken icon.
const broken = ref(new Set<string>())
const markBroken = (id: string) => { broken.value = new Set(broken.value).add(id) }

/** Quick client-side checks so mistakes show instantly; the server checks again. */
async function precheck(files: File[]): Promise<File[] | null> {
  if (images.value.length + files.length > maxCount) {
    notify.warning(t('errors.codes.TOO_MANY_IMAGES'), t('images.limitReached', { n: maxCount }))
    return null
  }
  for (const f of files) {
    if (!(await sniffFile(f))) { notify.warning(t('errors.codes.FILE_TYPE'), `${f.name} — ${t('images.rules', { mb: maxMb, n: maxCount })}`); return null }
    if (f.size > maxMb * 1024 * 1024) { notify.warning(t('errors.codes.FILE_TOO_LARGE'), `${f.name} · ${formatBytes(f.size)}`); return null }
  }
  return files
}

async function upload(list: FileList | File[] | null | undefined) {
  const files = list ? Array.from(list) : []
  if (!files.length || uploading.value !== null) return
  const ok = await precheck(files)
  if (!ok) return
  uploading.value = 0
  try {
    emit('update:modelValue', await api.contentImages.upload(props.contentId, ok, (pct) => { uploading.value = pct }))
    notify.success(t('images.uploaded'), files.length === 1 ? files[0]!.name : t('images.count', { n: files.length }))
  } catch (e) {
    notify.fromError(e, { retry: () => upload(ok) })
  } finally {
    uploading.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

function startReplace(img: ContentImage) {
  replacing.value = img
  replaceInput.value?.click()
}
async function doReplace(list: FileList | null) {
  const img = replacing.value
  const file = list?.[0]
  if (replaceInput.value) replaceInput.value.value = ''
  if (!img || !file) return
  if (!(await sniffFile(file))) { notify.warning(t('errors.codes.FILE_TYPE'), file.name); return }
  if (file.size > maxMb * 1024 * 1024) { notify.warning(t('errors.codes.FILE_TOO_LARGE'), `${file.name} · ${formatBytes(file.size)}`); return }
  await mutate(img.id, () => api.contentImages.replace(props.contentId, img.id, file), t('images.replaced'))
}

async function remove(img: ContentImage) {
  const ok = await notify.confirm({ title: t('images.removeConfirm'), message: t('images.removeConfirmBody', { name: img.filename }), confirmLabel: t('images.remove'), tone: 'danger' })
  if (ok) await mutate(img.id, () => api.contentImages.remove(props.contentId, img.id), t('images.removed'))
}

async function move(img: ContentImage, dir: -1 | 1) {
  const ids = images.value.map((i) => i.id)
  const from = ids.indexOf(img.id)
  const to = from + dir
  if (to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  // Optimistic: reorder now, roll back if the server refuses.
  const before = images.value
  emit('update:modelValue', ids.map((id) => before.find((i) => i.id === id)!))
  try {
    emit('update:modelValue', await api.contentImages.reorder(props.contentId, ids))
  } catch (e) {
    emit('update:modelValue', before)
    notify.fromError(e)
  }
}

async function mutate(id: string, fn: () => Promise<ContentImage[]>, done: string) {
  busyId.value = id
  try {
    emit('update:modelValue', await fn())
    notify.success(done)
  } catch (e) {
    notify.fromError(e)
    // e.g. removed in another session: the server's list is the truth.
    if (isApiError(e) && e.code === 'NOT_FOUND') api.contents.get(props.contentId).then((c) => emit('update:modelValue', c.images ?? [])).catch(() => {})
  } finally {
    busyId.value = null
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (props.canEdit && !full.value) upload(e.dataTransfer?.files)
}

// ---- preview (lightbox) ----------------------------------------------------
const previewIndex = ref<number | null>(null)
const current = computed(() => (previewIndex.value === null ? null : images.value[previewIndex.value] ?? null))
function onKey(e: KeyboardEvent) {
  const i = previewIndex.value
  if (i === null) return
  if (e.key === 'Escape') previewIndex.value = null
  else if (e.key === 'ArrowRight') previewIndex.value = (i + 1) % images.value.length
  else if (e.key === 'ArrowLeft') previewIndex.value = (i - 1 + images.value.length) % images.value.length
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const shortDate = (iso: string) => (iso ? formatDate(iso.slice(0, 10), locale.value, { day: 'numeric', month: 'short' }) : '')
</script>

<template>
  <section class="card card-pad" :aria-busy="uploading !== null">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Images class="size-5 text-brand-500" />{{ t('images.title') }}<span v-if="images.length" class="chip bg-surface-2 text-muted">{{ images.length }}/{{ maxCount }}</span></h2>
      <button v-if="images.length > 1" type="button" class="btn-ghost btn-sm ml-auto" :disabled="zipping" @click="downloadAll(contentId, images, title)">
        <Download class="size-3.5" />{{ zipping ? t('images.zipping') : t('images.downloadAll') }}
      </button>
    </div>

    <!-- Upload area: button always available; drag-and-drop is a bonus -->
    <div v-if="canEdit" class="mt-3 rounded-2xl border-2 border-dashed p-4 text-center transition-colors"
      :class="dragOver ? 'border-brand-400 bg-brand-500/5' : 'border-line'"
      @dragover.prevent="dragOver = !full" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <input ref="fileInput" type="file" :accept="IMAGE_ACCEPT" multiple class="sr-only" :aria-label="t('images.upload')" @change="upload(($event.target as HTMLInputElement).files)">
      <template v-if="uploading === null">
        <button type="button" class="btn-secondary" :disabled="full" @click="fileInput?.click()"><Upload class="size-4" />{{ t('images.upload') }}</button>
        <p class="mt-2 text-xs text-muted">{{ full ? t('images.limitReached', { n: maxCount }) : `${t('images.drop')} · ${t('images.rules', { mb: maxMb, n: maxCount })}` }}</p>
      </template>
      <div v-else class="mx-auto max-w-sm" role="status">
        <p class="text-sm font-semibold">{{ t('images.uploading', { pct: uploading }) }}</p>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><span class="block h-full rounded-full bg-brand-500 transition-all" :style="{ width: `${uploading}%` }" /></div>
      </div>
    </div>
    <p v-else-if="images.length" class="mt-2 text-xs text-muted">{{ t('images.viewOnly') }}</p>
    <input ref="replaceInput" type="file" :accept="IMAGE_ACCEPT" class="sr-only" tabindex="-1" aria-hidden="true" @change="doReplace(($event.target as HTMLInputElement).files)">

    <p v-if="!images.length && !canEdit" class="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2 p-4 text-sm text-muted"><ImagePlus class="size-4" />{{ t('images.none') }}</p>

    <ul v-if="images.length" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <li v-for="(img, i) in images" :key="img.id" class="group relative overflow-hidden rounded-2xl border border-line bg-surface-2" :class="busyId === img.id && 'opacity-60'">
        <button type="button" class="relative block aspect-square w-full overflow-hidden bg-surface" :aria-label="t('images.preview', { name: img.filename })" @click="previewIndex = i">
          <img v-if="img.thumbnailUrl && !broken.has(img.id)" :src="img.thumbnailUrl" :alt="img.filename" loading="lazy" decoding="async" class="size-full object-cover transition duration-300 group-hover:scale-105" @error="markBroken(img.id)">
          <span v-else class="grid size-full place-items-center text-muted"><ImageOff class="size-8" /></span>
          <span v-if="i === 0" class="absolute left-2 top-2 chip bg-ink/80 py-0.5 text-white">{{ t('images.cover') }}</span>
          <span class="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-ink/60 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 class="size-3.5" /></span>
        </button>
        <div class="p-2.5">
          <p class="truncate text-xs font-semibold" :title="img.filename">{{ img.filename }}</p>
          <p class="text-[11px] text-muted">{{ formatBytes(img.size) }}<template v-if="img.width"> · {{ img.width }}×{{ img.height }}</template> · {{ shortDate(img.createdAt) }}</p>
          <div class="mt-2 flex items-center gap-1">
            <button type="button" class="btn-icon btn-ghost p-1.5" :aria-label="`${t('images.download')} ${img.filename}`" :title="t('images.download')" @click="downloadOne(contentId, img)"><Download class="size-4" /></button>
            <template v-if="canEdit">
              <button type="button" class="btn-icon btn-ghost p-1.5" :disabled="busyId === img.id" :aria-label="`${t('images.replace')} ${img.filename}`" :title="t('images.replace')" @click="startReplace(img)"><RefreshCw class="size-4" /></button>
              <button type="button" class="btn-icon btn-ghost p-1.5 text-danger" :disabled="busyId === img.id" :aria-label="`${t('images.remove')} ${img.filename}`" :title="t('images.remove')" @click="remove(img)"><Trash2 class="size-4" /></button>
              <span class="ml-auto flex">
                <button type="button" class="btn-icon btn-ghost p-1.5" :disabled="i === 0" :aria-label="t('images.moveLeft')" :title="t('images.moveLeft')" @click="move(img, -1)"><ChevronLeft class="size-4" /></button>
                <button type="button" class="btn-icon btn-ghost p-1.5" :disabled="i === images.length - 1" :aria-label="t('images.moveRight')" :title="t('images.moveRight')" @click="move(img, 1)"><ChevronRight class="size-4" /></button>
              </span>
            </template>
          </div>
        </div>
      </li>
    </ul>

    <!-- Lightbox -->
    <Teleport to="#teleports">
      <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
        <div v-if="current" class="fixed inset-0 z-[130] grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" :aria-label="current.filename" @click.self="previewIndex = null">
          <img :src="current.url" :alt="current.filename" class="max-h-[82dvh] max-w-full rounded-2xl object-contain shadow-panel">
          <div class="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2 px-4">
            <button v-if="images.length > 1" type="button" class="btn-icon bg-white/15 text-white hover:bg-white/25" :aria-label="t('images.moveLeft')" @click="previewIndex = (previewIndex! - 1 + images.length) % images.length"><ChevronLeft class="size-5" /></button>
            <span class="max-w-[50vw] truncate rounded-full bg-white/15 px-3 py-1.5 text-sm text-white">{{ previewIndex! + 1 }}/{{ images.length }} · {{ current.filename }}</span>
            <button v-if="images.length > 1" type="button" class="btn-icon bg-white/15 text-white hover:bg-white/25" :aria-label="t('images.moveRight')" @click="previewIndex = (previewIndex! + 1) % images.length"><ChevronRight class="size-5" /></button>
            <button type="button" class="btn-icon bg-white/15 text-white hover:bg-white/25" :aria-label="t('images.download')" @click="downloadOne(contentId, current)"><Download class="size-5" /></button>
          </div>
          <button type="button" class="btn-icon absolute right-4 top-[max(1rem,env(safe-area-inset-top))] bg-white/15 text-white hover:bg-white/25" :aria-label="t('images.close')" @click="previewIndex = null"><X class="size-5" /></button>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
