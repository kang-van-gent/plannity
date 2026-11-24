import { isApiError } from '~/services/api/contract'

export type NoticeType = 'success' | 'warning' | 'error' | 'cancel' | 'info'

export interface NoticeAction {
  label: string
  handler: () => void
}

export interface Notice {
  id: number
  type: NoticeType
  title: string
  message?: string
  timeout: number
  action?: NoticeAction
}

export interface ConfirmOptions {
  title: string
  message?: string
  tone?: 'primary' | 'danger' | 'warning'
  confirmLabel?: string
  cancelLabel?: string
  details?: { label: string; value: string; emphasis?: boolean }[]
  /** Show a "cancelled" notice when the user backs out (default true). */
  notifyOnCancel?: boolean
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

let seq = 0

/**
 * Every action response appears as an animated card sliding in from the
 * right; confirmations open a right-side panel. See components/ActionCenter.vue.
 */
export function useNotify() {
  const notices = useState<Notice[]>('notices', () => [])
  const confirmReq = useState<ConfirmRequest | null>('confirm-request', () => null)
  const { t } = useLocale()

  function push(type: NoticeType, title: string, message?: string, opts: { timeout?: number; action?: NoticeAction } = {}) {
    const n: Notice = { id: ++seq, type, title, message, timeout: opts.timeout ?? (type === 'error' ? 7000 : 4500), action: opts.action }
    notices.value = [...notices.value.slice(-3), n]
    return n.id
  }

  function dismiss(id: number) {
    notices.value = notices.value.filter((n) => n.id !== id)
  }

  function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      confirmReq.value?.resolve(false)
      confirmReq.value = {
        ...opts,
        id: ++seq,
        resolve: (ok: boolean) => {
          confirmReq.value = null
          if (!ok && opts.notifyOnCancel !== false) push('cancel', t('notify.cancelled'), t('notify.cancelledHint'), { timeout: 2600 })
          resolve(ok)
        },
      }
    })
  }

  /** Maps API errors to friendly, localized feedback with the right tone. */
  function fromError(e: unknown, opts: { title?: string; retry?: () => void } = {}) {
    const action = opts.retry ? { label: t('common.retry'), handler: opts.retry } : undefined
    if (isApiError(e)) {
      switch (e.code) {
        case 'INSUFFICIENT_CREDITS':
          return push('warning', t('errors.insufficientCredits'), t('errors.insufficientCreditsHint'), {
            action: { label: t('credits.buy'), handler: () => navigateTo('/app/credits') },
          })
        case 'VERSION_CONFLICT':
          return push('warning', t('errors.versionConflict'), t('errors.versionConflictHint'), { action })
        case 'RATE_LIMITED':
          return push('warning', t('errors.rateLimited'), e.message)
        case 'INVALID_INPUT':
          return push('warning', opts.title ?? t('errors.invalidInput'), t('errors.invalidInputHint'))
        case 'NOT_FOUND':
          return push('error', t('errors.notFound'), undefined, { action })
        case 'UNAUTHENTICATED':
          return push('error', opts.title ?? t('errors.unauthenticated'), e.message)
        default:
          return push('error', opts.title ?? t('errors.generic'), `${e.message} · ${t('errors.requestId')} ${e.requestId}`, { action })
      }
    }
    return push('error', opts.title ?? t('errors.generic'), e instanceof Error ? e.message : undefined, { action })
  }

  return {
    notices, confirmReq, push, dismiss, confirm, fromError,
    success: (title: string, message?: string, o?: { action?: NoticeAction; timeout?: number }) => push('success', title, message, o),
    warning: (title: string, message?: string, o?: { action?: NoticeAction; timeout?: number }) => push('warning', title, message, o),
    error: (title: string, message?: string, o?: { action?: NoticeAction; timeout?: number }) => push('error', title, message, o),
    cancel: (title: string, message?: string, o?: { action?: NoticeAction; timeout?: number }) => push('cancel', title, message, o),
    info: (title: string, message?: string, o?: { action?: NoticeAction; timeout?: number }) => push('info', title, message, o),
  }
}
