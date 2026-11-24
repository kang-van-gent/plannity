import type { Brand, Content, ContentFormModel, ContentInput } from '~/types'

export function emptyContentForm(brand: Brand | undefined, date = ''): ContentFormModel {
  return {
    brandId: brand?.id ?? '', title: '', concept: '', pillar: brand?.profile.pillars[0] ?? 'Education', objective: 'engagement',
    platform: brand?.profile.platforms[0] ?? 'facebook', format: 'static', hook: '', caption: '', cta: '', hashtags: '',
    visualBrief: '', videoScript: '', scheduledDate: date, scheduledTime: '',
  }
}

export function contentToForm(c: Content): ContentFormModel {
  return {
    brandId: c.brandId, title: c.title, concept: c.concept, pillar: c.pillar, objective: c.objective, platform: c.platform, format: c.format,
    hook: c.hook, caption: c.caption, cta: c.cta, hashtags: c.hashtags.join(' '), visualBrief: c.visualBrief, videoScript: c.videoScript ?? '',
    scheduledDate: c.scheduledDate ?? '', scheduledTime: c.scheduledTime ?? '',
  }
}

export function formToInput(f: ContentFormModel): ContentInput {
  return {
    brandId: f.brandId, title: f.title.trim(), concept: f.concept, pillar: f.pillar, objective: f.objective, platform: f.platform, format: f.format,
    hook: f.hook, caption: f.caption, cta: f.cta,
    hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)),
    visualBrief: f.visualBrief, videoScript: f.format === 'short_video' ? f.videoScript || null : null,
    scheduledDate: f.scheduledDate || null, scheduledTime: f.scheduledTime || null,
  }
}
