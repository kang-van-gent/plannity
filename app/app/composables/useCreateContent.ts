import type { Content, ContentFormModel } from '~/types'

/**
 * Creates a post from the content form. A post going to several platforms is
 * created with its main platform, then given the others as destinations.
 * If adding the other platforms fails the post still exists — say so instead of hiding it.
 */
export function useCreateContent() {
  const api = useApi()
  const notify = useNotify()
  const { t } = useLocale()
  return async (form: ContentFormModel): Promise<Content> => {
    const c = await api.contents.create(formToInput(form))
    const platforms = form.platforms ?? [form.platform]
    if (platforms.length > 1) {
      try {
        const r = await api.destinations.replace(c.id, platforms.map((platform) => ({ platform })))
        c.destinations = r.data
      } catch {
        notify.warning(t('content.platformsNotSaved'), t('content.platformsNotSavedBody'))
      }
    }
    return c
  }
}
