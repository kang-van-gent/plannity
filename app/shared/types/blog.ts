// Blog posts are written in the Strapi admin (collection "Blog post") and read
// by the Nuxt server routes in server/api/blog — shared by server and app.

/** Strapi 5 "blocks" rich text. */
export type BlogInline =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }
  | { type: 'link'; url: string; children: BlogInline[] }

export interface BlogImage { url: string; alternativeText?: string | null; caption?: string | null; width?: number | null; height?: number | null }

export type BlogBlock =
  | { type: 'paragraph'; children: BlogInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: BlogInline[] }
  | { type: 'quote'; children: BlogInline[] }
  | { type: 'code'; language?: string; children: BlogInline[] }
  | { type: 'image'; image: BlogImage; children?: BlogInline[] }
  | BlogList

export interface BlogList { type: 'list'; format: 'ordered' | 'unordered'; children: (BlogListItem | BlogList)[] }
export interface BlogListItem { type: 'list-item'; children: BlogInline[] }

export interface BlogPostSummary {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string | null
  author: string
  publishedAt: string
  cover: BlogImage | null
  featured: boolean
  minutes: number
}

export interface BlogPost extends BlogPostSummary {
  content: BlogBlock[]
  seoTitle: string | null
  seoDescription: string | null
}

export interface BlogListResponse {
  data: BlogPostSummary[]
  meta: { page: number; pageCount: number; total: number; sample: boolean }
}

export interface BlogPostResponse {
  data: BlogPost
  related: BlogPostSummary[]
  sample: boolean
}
