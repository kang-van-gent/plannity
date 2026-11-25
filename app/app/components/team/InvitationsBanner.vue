<script setup lang="ts">
import { Check, MailOpen, X } from '@lucide/vue'
import type { MyInvitation } from '~/types'

// Pending invitations addressed to the signed-in user's email ("notify user"
// for existing accounts). Accepting adds the brand to their workspace.
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const list = ref<MyInvitation[]>([])
const busy = ref<string | null>(null)

onMounted(async () => {
  try { list.value = await api.invitations.mine() } catch { /* banner is optional */ }
})

async function respond(inv: MyInvitation, accept: boolean) {
  busy.value = inv.id
  try {
    if (accept) {
      const { brandId } = await api.invitations.acceptMine(inv.id)
      await brands.load(true)
      notify.success(t('invite.accepted', { brand: inv.brandName }), undefined, { action: { label: t('common.open'), handler: () => navigateTo(`/app/brands/${brandId}`) } })
    } else {
      await api.invitations.declineMine(inv.id)
      notify.info(t('invite.declined'))
    }
    list.value = list.value.filter((i) => i.id !== inv.id)
    emit('changed')
  } catch (e) {
    notify.fromError(e)
    list.value = await api.invitations.mine().catch(() => list.value)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <TransitionGroup v-if="list.length" tag="div" class="mb-5 space-y-2" enter-from-class="opacity-0 -translate-y-2" leave-to-class="opacity-0 scale-95" enter-active-class="transition duration-300" leave-active-class="transition duration-200">
    <article v-for="inv in list" :key="inv.id" class="flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-brand-300/60 bg-brand-500/5 p-3 sm:flex-nowrap sm:p-4">
      <span class="relative shrink-0">
        <UiBrandDot :name="inv.brandName" :color="inv.brandColor" :size="44" />
        <span class="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-brand-500 text-white ring-2 ring-surface"><MailOpen class="size-3" /></span>
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">{{ t('invite.bannerTitle', { brand: inv.brandName }) }}</p>
        <p class="truncate text-sm text-muted">{{ t('invite.bannerBody', { inviter: inv.inviterName, role: t(`roles.${inv.role}`) }) }} · {{ t('invite.expires', { date: formatDate(inv.expiresAt.slice(0, 10), locale, { day: 'numeric', month: 'short' }) }) }}</p>
      </div>
      <div class="grid w-full grid-cols-[1fr_2fr] gap-2 sm:flex sm:w-auto">
        <button type="button" class="btn-secondary btn-sm" :disabled="busy === inv.id" @click="respond(inv, false)"><X class="size-3.5" />{{ t('invite.decline') }}</button>
        <button type="button" class="btn-primary btn-sm" :disabled="busy === inv.id" @click="respond(inv, true)"><Check class="size-3.5" />{{ t('invite.accept') }}</button>
      </div>
    </article>
  </TransitionGroup>
</template>
