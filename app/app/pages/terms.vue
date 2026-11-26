<script setup lang="ts">
import { ArrowUp, FileText, Languages, Mail, ScrollText, ShieldCheck } from '@lucide/vue'
import { TERMS_PROVIDER, TERMS_SECTIONS, TERMS_VERSION } from '~/content/legal/terms'

// Terms of Service (terms-and-policy-v0.2.md §2). Thai is the governing text.
// Until an approved effective date is configured (NUXT_PUBLIC_LEGAL_TERMS_EFFECTIVE_DATE),
// the page is labelled a draft and kept out of search engines.
const { t, locale } = useLocale()
const config = useRuntimeConfig()
const effective = computed(() => String(config.public.legalTermsEffectiveDate || ''))
const isDraft = computed(() => !effective.value)

useSeoMeta({
  title: () => t('legal.termsTitle'),
  description: () => t('legal.termsIntro'),
  robots: () => (isDraft.value ? 'noindex, nofollow' : undefined),
})

// Plan table and storage limits come from the live configuration, so the
// terms never promise something the product doesn't do.
const cfg = DEFAULT_PRICING
const baht = (satang: number) => (satang / 100).toLocaleString('th-TH')
const planRows = computed(() => [
  { label: 'รายเดือน', cells: ['ฟรี', baht(cfg.plans.team.monthlySatang), baht(cfg.plans.studio.monthlySatang)] },
  { label: 'สมาชิกนับรวมเจ้าของ', cells: [cfg.plans.solo.maxMembers, cfg.plans.team.maxMembers, cfg.plans.studio.maxMembers].map(String) },
  { label: 'แบรนด์ที่รวม', cells: ['2', '2', 'ไม่จำกัด'] },
  { label: 'แบรนด์เพิ่ม/เดือน', cells: [baht(cfg.additionalBrandMonthlySatang), baht(cfg.additionalBrandMonthlySatang), 'รวมในแพ็กเกจ'] },
  { label: 'เชิญสมาชิกในแบรนด์ที่เป็นเจ้าของ', cells: ['ไม่ได้', 'ได้', 'ได้'] },
])
const storageText = computed(() =>
  `ปฏิทิน การเขียนคอนเทนต์และบรีฟเอง การแนบ/ดาวน์โหลดภาพ และ Post Preview ใช้ได้ทุกแพ็กเกจตามขอบเขตบริการและข้อจำกัดพื้นที่จัดเก็บที่แจ้งไว้ในระบบ (ปัจจุบัน: ไฟล์ภาพไม่เกิน ${config.public.imageMaxMb} MB ต่อภาพ และไม่เกิน ${config.public.imageMaxCount} ภาพต่อโพสต์)`)

// Contents: highlight the section being read.
const active = ref(TERMS_SECTIONS[0]!.id)
const onHashClick = useSmoothHash()
let io: IntersectionObserver | null = null
onMounted(() => {
  io = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
    if (visible) active.value = visible.target.id
  }, { rootMargin: '-20% 0px -70% 0px' })
  for (const s of TERMS_SECTIONS) { const el = document.getElementById(s.id); if (el) io.observe(el) }
})
onBeforeUnmount(() => io?.disconnect())
const toTop = () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
    <!-- Title -->
    <header class="max-w-3xl">
      <div v-anim class="flex flex-wrap items-center gap-2">
        <span v-if="isDraft" class="chip bg-sun/20 text-amber-700 dark:text-sun">{{ t('legal.draftBeta') }}</span>
        <span v-else class="chip bg-success/15 text-success">{{ t('legal.effective', { date: formatDate(effective, locale, { day: 'numeric', month: 'long', year: 'numeric' }) }) }}</span>
        <span class="chip bg-surface-2 text-muted">{{ t('legal.version', { v: TERMS_VERSION }) }}</span>
      </div>
      <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl" lang="th">ข้อกำหนดการใช้บริการ</h1>
      <p v-anim="2" class="mt-1 font-display text-lg text-muted">Terms of Service</p>
      <p v-if="isDraft" v-anim="3" class="mt-4 rounded-2xl border border-dashed border-sun bg-sun/10 p-3 text-sm">{{ t('legal.draftNotice') }}</p>
      <p v-if="locale !== 'th'" v-anim="3" class="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
        <Languages class="mt-0.5 size-4 shrink-0" />{{ t('legal.thaiOnly') }}
      </p>
    </header>

    <!-- Who provides the service -->
    <dl v-anim class="card card-pad mt-6 grid max-w-3xl gap-4 text-sm sm:grid-cols-[1fr_auto]" lang="th">
      <div>
        <dt class="text-xs font-bold uppercase tracking-wider text-muted">{{ t('legal.provider') }}</dt>
        <dd class="mt-1 font-semibold">{{ TERMS_PROVIDER.name }}</dd>
        <dd class="text-muted">{{ TERMS_PROVIDER.address }}</dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-wider text-muted">{{ t('legal.contact') }}</dt>
        <dd class="mt-1"><a :href="`mailto:${TERMS_PROVIDER.email}`" class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline dark:text-brand-300"><Mail class="size-4" />{{ TERMS_PROVIDER.email }}</a></dd>
      </div>
    </dl>

    <div class="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <!-- Contents -->
      <nav class="lg:sticky lg:top-28 lg:self-start" :aria-label="t('legal.contents')">
        <p class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted"><ScrollText class="size-4" />{{ t('legal.contents') }}</p>
        <ol class="mt-3 grid gap-0.5 border-l-2 border-line text-sm max-lg:max-h-72 max-lg:overflow-y-auto" lang="th">
          <li v-for="s in TERMS_SECTIONS" :key="s.id">
            <a :href="`#${s.id}`" class="-ml-0.5 block border-l-2 py-1.5 pl-3 transition-colors"
              :class="active === s.id ? 'border-brand-500 font-semibold text-brand-600 dark:text-brand-300' : 'border-transparent text-muted hover:text-fg'"
              :aria-current="active === s.id ? 'location' : undefined" @click.capture="onHashClick($event, `/terms#${s.id}`)">{{ s.title }}</a>
          </li>
        </ol>
      </nav>

      <!-- Text -->
      <article class="min-w-0 max-w-3xl" lang="th">
        <section v-for="s in TERMS_SECTIONS" :id="s.id" :key="s.id" class="scroll-mt-28 border-b border-line pb-8 pt-2 last:border-0 [&+section]:pt-8">
          <h2 class="font-display text-2xl font-bold">{{ s.title }}</h2>
          <template v-for="(b, i) in s.blocks" :key="i">
            <p v-if="typeof b === 'string'" class="mt-3 leading-8 text-fg/85">{{ b }}</p>
            <p v-else-if="'storage' in b" class="mt-3 leading-8 text-fg/85">{{ storageText }}</p>
            <div v-else class="mt-4 overflow-x-auto rounded-2xl border border-line">
              <table class="w-full min-w-[480px] text-sm">
                <thead class="bg-surface-2">
                  <tr>
                    <th scope="col" class="p-3 text-left font-semibold">รายการ</th>
                    <th v-for="k in PLAN_KEYS" :key="k" scope="col" class="p-3 text-right font-display font-bold">{{ t(`plan.names.${k}`) }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  <tr v-for="r in planRows" :key="r.label">
                    <th scope="row" class="p-3 text-left font-medium">{{ r.label }}</th>
                    <td v-for="(c, j) in r.cells" :key="j" class="p-3 text-right tabular-nums">{{ c }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </section>

        <!-- Related documents -->
        <footer class="mt-10 flex flex-wrap items-center gap-3 rounded-[1.5rem] bg-surface-2 p-5">
          <ShieldCheck class="size-5 text-brand-500" />
          <p class="min-w-0 flex-1 text-sm">{{ t('legal.related') }}</p>
          <NuxtLink to="/privacy" class="btn-secondary btn-sm"><FileText class="size-4" />{{ t('footer.privacy') }}</NuxtLink>
          <button type="button" class="btn-ghost btn-sm" @click="toTop"><ArrowUp class="size-4" />{{ t('legal.backToTop') }}</button>
        </footer>
      </article>
    </div>
  </div>
</template>
