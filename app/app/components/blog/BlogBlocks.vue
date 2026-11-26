<script lang="ts">
import { h, type PropType, type VNodeChild } from 'vue'
import type { BlogBlock, BlogInline, BlogList } from '#shared/types/blog'

// Renders Strapi "blocks" rich text as plain Vue nodes (no v-html), so
// whatever is typed in the admin can never inject markup or scripts.

const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i

function inline(nodes: BlogInline[] = []): VNodeChild[] {
  return nodes.map((n) => {
    if (n.type === 'link') {
      const safe = SAFE_URL.test(n.url.trim())
      const external = /^https?:/i.test(n.url)
      return safe
        ? h('a', { href: n.url, class: 'font-semibold text-brand-600 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-500 dark:text-brand-300', ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, inline(n.children))
        : h('span', inline(n.children))
    }
    let v: VNodeChild = n.text
    if (n.code) v = h('code', { class: 'rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em]' }, v)
    if (n.bold) v = h('strong', { class: 'font-bold text-fg' }, [v])
    if (n.italic) v = h('em', [v])
    if (n.underline) v = h('u', { class: 'underline-offset-4' }, [v])
    if (n.strikethrough) v = h('s', [v])
    return v
  })
}

function list(l: BlogList): VNodeChild {
  return h(l.format === 'ordered' ? 'ol' : 'ul', { class: ['my-5 space-y-2 pl-6 marker:text-brand-500', l.format === 'ordered' ? 'list-decimal marker:font-bold' : 'list-disc'] },
    l.children.map((c) => (c.type === 'list' ? h('li', { class: 'list-none' }, [list(c)]) : h('li', { class: 'pl-1' }, inline(c.children)))))
}

const HEADING = ['', 'mt-12 text-3xl', 'mt-12 text-3xl', 'mt-10 text-2xl', 'mt-8 text-xl', 'mt-8 text-lg', 'mt-8 text-base']

function block(b: BlogBlock, i: number): VNodeChild {
  switch (b.type) {
    case 'paragraph': {
      const kids = inline(b.children)
      return b.children.every((c) => c.type === 'text' && !c.text) ? null : h('p', { key: i, class: 'my-5' }, kids)
    }
    case 'heading': {
      // The page title is the only h1; content headings start at h2.
      const tag = `h${Math.min(6, Math.max(2, b.level))}`
      return h(tag, { key: i, class: ['mb-4 scroll-mt-28 font-display font-bold leading-tight text-fg', HEADING[b.level]] }, inline(b.children))
    }
    case 'quote':
      return h('blockquote', { key: i, class: 'my-8 rounded-r-2xl border-l-4 border-brand-500 bg-brand-500/5 py-4 pl-5 pr-4 font-display text-xl font-semibold leading-snug text-fg' }, inline(b.children))
    case 'code':
      return h('pre', { key: i, class: 'my-6 overflow-x-auto rounded-2xl bg-ink p-4 text-sm leading-6 text-white' }, [h('code', { class: 'font-mono' }, b.children.map((c) => (c.type === 'text' ? c.text : '')).join(''))])
    case 'image':
      return b.image?.url
        ? h('figure', { key: i, class: 'my-8' }, [
            h('img', { src: b.image.url, alt: b.image.alternativeText ?? '', width: b.image.width ?? undefined, height: b.image.height ?? undefined, loading: 'lazy', decoding: 'async', class: 'h-auto w-full rounded-3xl border border-line' }),
            b.image.caption ? h('figcaption', { class: 'mt-2 text-center text-sm text-muted' }, b.image.caption) : null,
          ])
        : null
    case 'list':
      return list(b)
    default:
      return null // unknown block types from newer Strapi versions are skipped
  }
}

export default defineComponent({
  name: 'BlogBlocks',
  props: { blocks: { type: Array as PropType<BlogBlock[]>, required: true } },
  setup(props) {
    return () => h('div', { class: 'text-[1.075rem] leading-8 text-fg/85' }, props.blocks.map(block))
  },
})
</script>
