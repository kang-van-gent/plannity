import type { ContentImage } from '~/types'

/** Download one post image, or all of them as a single .zip. */
export function useImageDownloads() {
  const api = useApi()
  const notify = useNotify()
  const { t } = useLocale()
  const zipping = ref(false)

  async function downloadOne(contentId: string, img: ContentImage) {
    try {
      saveBlob(await api.contentImages.download(contentId, img.id), safeFilename(img.filename))
    } catch (e) {
      notify.fromError(e)
    }
  }

  async function downloadAll(contentId: string, images: ContentImage[], baseName: string) {
    if (images.length === 1) return downloadOne(contentId, images[0]!)
    zipping.value = true
    try {
      const files = await Promise.all(images.map(async (img, i) => ({
        name: `${String(i + 1).padStart(2, '0')}-${safeFilename(img.filename)}`, // keeps the post's order
        blob: await api.contentImages.download(contentId, img.id),
      })))
      saveBlob(await zipFiles(files), `${safeFilename(baseName).replace(/\.[^.]*$/, '') || 'post'}-images.zip`)
    } catch (e) {
      notify.fromError(e, { title: t('images.downloadAll') })
    } finally {
      zipping.value = false
    }
  }

  return { downloadOne, downloadAll, zipping }
}
