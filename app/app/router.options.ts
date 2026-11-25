import type { RouterConfig } from '@nuxt/schema'

// Smooth-scroll to #section targets (landing nav, "See how it works", arriving
// from another page like /pricing → /#faq). Normal page changes are unaffected.
// Sections use scroll-mt-* so they land below the sticky header.
export default {
  scrollBehaviorType: 'smooth',
} satisfies RouterConfig
