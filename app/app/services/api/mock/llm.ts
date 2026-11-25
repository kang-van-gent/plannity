// DEVELOPMENT MOCK of the LLM provider adapter (spec §15 / §18).
// Produces content that satisfies the output contract in spec §9 from
// templates. It never invents prices or claims: promotion copy uses
// placeholders unless the user supplied the promotion text.

import type { Brand, ContentDraft, ContentFormat, Objective, Platform } from '~/types'
import { normalizeTitle } from '~/utils/format'

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: number) {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Lang = 'th' | 'en'
interface PillarCopy { titles: string[]; hooks: string[]; concepts: string[]; body: string[]; why: string }

const TH: Record<string, PillarCopy> = {
  Education: {
    titles: ['3 เคล็ดลับเลือก{product}ให้เหมาะกับคุณ', '{product} แบบไหนดี? สรุปให้ใน 1 นาที', 'มือใหม่ต้องรู้! ใช้{product}ยังไงให้คุ้ม', '5 ความเข้าใจผิดเกี่ยวกับ{product}', 'Checklist ก่อนเลือก{product}'],
    hooks: ['รู้ไหมว่าคนส่วนใหญ่เลือก{product}ผิดตั้งแต่ข้อแรก?', 'ถ้ามีเวลา 60 วินาที อยากให้รู้เรื่องนี้ก่อน 👇', 'เซฟโพสต์นี้ไว้ก่อน แล้วค่อยตัดสินใจ'],
    concepts: ['อธิบายความรู้พื้นฐานเกี่ยวกับ{product}แบบเข้าใจง่าย แบ่งเป็นข้อ ๆ', 'เปรียบเทียบตัวเลือกยอดนิยมโดยเน้นข้อดี-ข้อจำกัดอย่างตรงไปตรงมา'],
    body: ['✅ ข้อแรก: เริ่มจากความต้องการของคุณจริง ๆ\n✅ ข้อสอง: ดูรายละเอียดที่ {brand} ใส่ใจ\n✅ ข้อสาม: ลองแล้วสังเกตผลลัพธ์ของตัวเอง'],
    why: 'ช่วยให้{audience}ตัดสินใจได้มั่นใจขึ้น และสร้างความน่าเชื่อถือให้แบรนด์',
  },
  Entertainment: {
    titles: ['POV: วันแรกที่ได้ลอง{product}', 'ถ้า{product}พูดได้ จะบอกอะไรเรา?', 'Mood ของคนติด{product} ตามวันในสัปดาห์', 'เลือกเลย! คุณเป็นสายไหนในเรื่อง{product}'],
    hooks: ['ใครเป็นแบบนี้บ้าง ยกมือ 🙋', 'ดูจบแล้วจะเข้าใจว่าทำไมเราหลงรัก{product}', 'คอมเมนต์บอกหน่อย คุณคือแบบไหน?'],
    concepts: ['คอนเทนต์ขำ ๆ เล่าสถานการณ์ที่{audience}เจอจริง', 'เล่าเรื่องแบบ POV ให้คนดูอินและแท็กเพื่อน'],
    body: ['บางวันก็แบบนี้แหละ 😂 แต่ทุกวันมี{product}อยู่ข้าง ๆ ก็โอเคแล้ว\nแท็กเพื่อนที่เป็นแบบนี้เป๊ะ ๆ มาเลย'],
    why: 'เพิ่ม engagement และการแชร์ เพราะ{audience}เห็นตัวเองในคอนเทนต์',
  },
  Promotion: {
    titles: ['{promo}: {product}ราคาพิเศษ', 'ช่วงเวลาพิเศษกับ {brand} — {promo}', 'ห้ามพลาด! {promo} สำหรับ{product}'],
    hooks: ['ข่าวดีสำหรับคนที่รอ{product} 🎉', 'เก็บโพสต์นี้ไว้ก่อนโปรจะจบ', 'ถ้าลังเลอยู่ นี่คือจังหวะที่ดี'],
    concepts: ['ประกาศโปรโมชันอย่างชัดเจน ระบุเงื่อนไขและระยะเวลาให้ครบ', 'ใช้ความเร่งด่วนแบบไม่กดดัน พร้อมเหตุผลที่ควรลอง'],
    body: ['🎁 {promo}\n📅 ระยะเวลา: [ระบุวันเริ่ม–วันสิ้นสุด]\n💸 ราคา/ส่วนลด: [ระบุตามจริง]\n📌 เงื่อนไข: [ระบุเงื่อนไข]'],
    why: 'ผลักดัน conversion โดยแสดงเงื่อนไขครบถ้วน ไม่สร้างความคาดหวังเกินจริง',
  },
  'Behind the scenes': {
    titles: ['เบื้องหลังกว่าจะเป็น{product} 1 ชิ้น', 'หนึ่งวันของทีม {brand}', 'สิ่งที่ลูกค้าไม่เคยเห็นในร้านเรา', 'ทำไม {brand} ถึงเลือกทำแบบนี้'],
    hooks: ['ไม่เคยเล่าที่ไหนมาก่อน…', 'ทุกชิ้นผ่านมือทีมเราแบบนี้ 👀', 'มาดูกันว่าหลังร้านเกิดอะไรขึ้น'],
    concepts: ['พาชมขั้นตอนการทำงานจริงเพื่อสร้างความไว้ใจ', 'เล่าเรื่องคนในทีมและความตั้งใจของแบรนด์'],
    body: ['ทุกขั้นตอนเราใส่ใจเพราะอยากให้คุณได้{product}ที่ดีที่สุด\nตั้งแต่ [ขั้นตอนที่ 1] → [ขั้นตอนที่ 2] → ส่งถึงมือคุณ'],
    why: 'สร้างความผูกพันและความเชื่อมั่น ทำให้{audience}เห็นคุณค่าของแบรนด์',
  },
  Community: {
    titles: ['แชร์โมเมนต์{product}ของคุณ', 'โหวต: อยากให้ {brand} ทำอะไรต่อ?', 'ขอบคุณทุกคนที่อยู่กับ {brand}', 'Q&A: ถามมา ตอบไป เรื่อง{product}'],
    hooks: ['เราอยากฟังเสียงคุณ 💬', 'คอมเมนต์ตอบ 1 คำ!', 'ขอเวลา 10 วินาที ช่วยเราตัดสินใจหน่อย'],
    concepts: ['ชวนผู้ติดตามมีส่วนร่วมด้วยคำถามง่าย ๆ', 'เปิดพื้นที่ให้ลูกค้าแชร์ประสบการณ์จริง (ขออนุญาตก่อนนำไปใช้)'],
    body: ['ตอบใต้โพสต์นี้ได้เลย 👇\nA) [ตัวเลือกที่ 1]\nB) [ตัวเลือกที่ 2]\nทีมงานอ่านทุกคอมเมนต์นะ'],
    why: 'กระตุ้นการมีส่วนร่วมและได้ insight จริงจาก{audience}',
  },
  Inspiration: {
    titles: ['เริ่มต้นวันใหม่ไปกับ {brand}', 'เรื่องเล็ก ๆ ที่ทำให้วันนี้ดีขึ้น', 'แรงบันดาลใจประจำสัปดาห์'],
    hooks: ['วันนี้ขอส่งพลังบวกให้ ✨', 'อ่านจบแล้วยิ้มได้แน่นอน', 'สำหรับคนที่เหนื่อยมาทั้งสัปดาห์'],
    concepts: ['คำคมหรือเรื่องสั้นที่เชื่อมโยงกับคุณค่าของแบรนด์', 'ภาพสวยพร้อมข้อความให้กำลังใจ'],
    body: ['ทุกความสำเร็จเริ่มจากก้าวเล็ก ๆ\nขอให้วันนี้เป็นวันที่ดีของคุณ 💜'],
    why: 'สร้าง brand love และการจดจำในระยะยาว',
  },
}

const EN: Record<string, PillarCopy> = {
  Education: {
    titles: ['3 tips to choose the right {product}', '{product}: what actually matters, in 60 seconds', 'Beginner guide: getting the most from {product}', '5 myths about {product}'],
    hooks: ['Most people get this wrong on day one.', 'Save this before your next decision 👇', 'Got 60 seconds? Read this first.'],
    concepts: ['Explain the basics of {product} in clear, numbered steps', 'Honest comparison of popular options with pros and limits'],
    body: ['✅ Start from what you really need\n✅ Look at the details {brand} cares about\n✅ Try it and track your own results'],
    why: 'Helps {audience} decide with confidence and builds credibility for the brand',
  },
  Entertainment: {
    titles: ['POV: your first week with {product}', 'If {product} could talk…', 'Which {product} person are you?'],
    hooks: ['Tag someone who does this 😂', 'Be honest — which one are you?', 'Watch till the end.'],
    concepts: ['A light, relatable skit about everyday moments of {audience}', 'POV storytelling that invites tagging friends'],
    body: ['Some days are like this 😅 — but with {product} it is all good.\nTag a friend who gets it.'],
    why: 'Drives engagement and shares because {audience} see themselves in it',
  },
  Promotion: {
    titles: ['{promo}: {product} special', '{promo} at {brand}', "Don't miss {promo}"],
    hooks: ['Good news if you have been waiting 🎉', 'Save this before the offer ends', 'Been on the fence? Now is a good time.'],
    concepts: ['Announce the offer clearly with full terms and dates', 'Gentle urgency plus a reason to try'],
    body: ['🎁 {promo}\n📅 Dates: [start – end]\n💸 Price/discount: [fill in actual]\n📌 Terms: [fill in]'],
    why: 'Pushes conversion while keeping terms transparent and expectations realistic',
  },
  'Behind the scenes': {
    titles: ['How one {product} is made', 'A day with the {brand} team', 'What you never see behind the counter'],
    hooks: ['Never shared this before…', 'Every one goes through our hands 👀', 'Here is what happens backstage.'],
    concepts: ['Show the real process to earn trust', 'Introduce the people behind the brand'],
    body: ['We care about every step so you get the best {product}.\n[Step 1] → [Step 2] → to you.'],
    why: 'Builds trust and connection with {audience}',
  },
  Community: {
    titles: ['Share your {product} moment', 'Vote: what should {brand} do next?', 'Your questions about {product}, answered'],
    hooks: ['We want to hear from you 💬', 'Answer in one word!', '10 seconds to help us decide?'],
    concepts: ['Invite followers to join with an easy question', 'Space for customers to share real experiences (with permission)'],
    body: ['Reply below 👇\nA) [option 1]\nB) [option 2]\nWe read every comment.'],
    why: 'Sparks participation and gives real insight from {audience}',
  },
  Inspiration: {
    titles: ['Start your week with {brand}', 'Small things that make today better', 'Weekly dose of motivation'],
    hooks: ['Sending good energy your way ✨', 'Read this and smile.', 'For everyone who had a long week.'],
    concepts: ['A short quote or story tied to brand values', 'A calm visual with an encouraging line'],
    body: ['Every big change starts with a small step.\nHave a great day 💜'],
    why: 'Builds brand love and long-term recall',
  },
}

const GENERIC_TH = TH.Education!
const GENERIC_EN = EN.Education!

const FORMAT_BRIEF = {
  th: {
    static: 'ภาพนิ่ง 4:5 — {product} เป็นจุดเด่นกลางภาพ พื้นหลังสีโทนแบรนด์ ข้อความบนภาพ: “{title}” ตัวใหญ่อ่านง่ายบนมือถือ',
    carousel: 'Carousel 5 สไลด์\n1) ปก: “{title}”\n2–4) ประเด็นละ 1 สไลด์ พร้อมไอคอนประกอบ\n5) สรุป + CTA “{cta}”',
    short_video: 'วิดีโอแนวตั้ง 9:16 ความยาว 20–30 วินาที\nShot 1 (0–3s): close-up {product} + ข้อความ hook\nShot 2 (3–15s): เล่าเนื้อหาหลัก ตัดภาพเร็ว\nShot 3 (15–25s): ผลลัพธ์/ปฏิกิริยา\nShot 4 (25–30s): โลโก้ + CTA',
    text: 'โพสต์ข้อความล้วน ใช้ emoji 2–3 ตัว (ถ้าต้องการภาพ: พื้นสีแบรนด์ + ข้อความสั้น)',
  },
  en: {
    static: 'Static 4:5 — {product} as hero, brand-colour background, on-image text: “{title}”, large and mobile-readable',
    carousel: 'Carousel, 5 slides\n1) Cover: “{title}”\n2–4) One point per slide with an icon\n5) Recap + CTA “{cta}”',
    short_video: 'Vertical 9:16, 20–30s\nShot 1 (0–3s): close-up of {product} + hook text\nShot 2 (3–15s): main story, quick cuts\nShot 3 (15–25s): result/reaction\nShot 4 (25–30s): logo + CTA',
    text: 'Text-only post with 2–3 emoji (optional visual: brand colour + short line)',
  },
} satisfies Record<Lang, Record<ContentFormat, string>>

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!
}

export interface GenerateArgs {
  brand: Omit<Brand, 'myRole' | 'maxSeats'>
  ordinal: number
  pillar: string
  objective: Objective
  platform: Platform
  format: ContentFormat
  date: string | null
  promotion?: string
  campaign?: string
  existingTitles: Set<string>
  seed: string
}

export function mockGenerate(a: GenerateArgs): ContentDraft {
  const lang: Lang = a.brand.profile.language === 'en' ? 'en' : 'th'
  const lib = lang === 'en' ? EN : TH
  const copy = lib[a.pillar] ?? (lang === 'en' ? GENERIC_EN : GENERIC_TH)
  const r = rng(hashString(a.seed))
  const products = a.brand.profile.products.split(/[,\n、]/).map((s) => s.trim()).filter(Boolean)
  const product = products.length ? pick(products, r) : (lang === 'en' ? 'our product' : 'สินค้าของเรา')
  const audience = a.brand.profile.audience.split(/[,\n]/)[0]?.trim() || (lang === 'en' ? 'your audience' : 'กลุ่มเป้าหมาย')
  const promo = a.promotion?.trim() || (lang === 'en' ? '[Offer name]' : '[ชื่อโปรโมชัน]')
  const ctaPool = a.brand.profile.ctaPreferences.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  const cta = ctaPool.length ? pick(ctaPool, r) : (lang === 'en' ? 'Send us a message' : 'ทักแชทสอบถามได้เลย')
  const vars = { product, brand: a.brand.name, audience, promo, cta, campaign: a.campaign ?? '' }

  // Limited retries against normalized duplicate titles (spec §9). We never claim 100% uniqueness.
  let title = ''
  for (let i = 0; i < 4; i++) {
    title = fill(pick(copy.titles, r), vars)
    if (!a.existingTitles.has(normalizeTitle(title))) break
  }
  if (a.existingTitles.has(normalizeTitle(title))) title = `${title} (${lang === 'en' ? 'part' : 'ภาค'} ${a.ordinal + 1})`
  a.existingTitles.add(normalizeTitle(title))

  const hook = fill(pick(copy.hooks, r), vars)
  const concept = fill(pick(copy.concepts, r), vars)
  const tagBase = a.brand.name.replace(/[^\p{L}\p{N}]/gu, '')
  const hashtags = [`#${tagBase}`, `#${a.pillar.replace(/\s+/g, '')}`, lang === 'en' ? '#ContentPlan' : '#คอนเทนต์ดีบอกต่อ'].slice(0, 3)
  const caption = `${hook}\n\n${fill(copy.body[0]!, vars)}\n\n👉 ${cta}\n${hashtags.join(' ')}`
  const visualBrief = fill(FORMAT_BRIEF[lang][a.format], { ...vars, title })
  const videoScript = a.format === 'short_video'
    ? (lang === 'en'
        ? `[0–3s] Hook: “${hook}”\n[3–15s] ${concept}\n[15–25s] Show ${product} in use\n[25–30s] CTA: ${cta}`
        : `[0–3s] Hook: “${hook}”\n[3–15s] ${concept}\n[15–25s] โชว์${product}ในการใช้งานจริง\n[25–30s] CTA: ${cta}`)
    : null
  const objectiveLabel = lang === 'en' ? a.objective : ({ awareness: 'การรับรู้', engagement: 'การมีส่วนร่วม', consideration: 'การพิจารณา', conversion: 'ยอดขาย' } as const)[a.objective]
  const rationale = `${fill(copy.why, vars)} (${lang === 'en' ? 'objective' : 'เป้าหมาย'}: ${objectiveLabel})`

  return {
    title, concept, pillar: a.pillar, objective: a.objective, platform: a.platform, format: a.format,
    hook, caption, cta, hashtags, visualBrief, videoScript, suggestedDate: a.date, rationale,
  }
}

/** Minimal schema validation standing in for JSON-schema validation of provider output. */
export function validateDraft(d: Partial<ContentDraft>): d is ContentDraft {
  return Boolean(d.title && d.hook && d.caption && d.cta && d.visualBrief && d.platform && d.format && Array.isArray(d.hashtags)
    && (d.format === 'short_video' ? !!d.videoScript : d.videoScript === null))
}
