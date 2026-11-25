import tailwindcss from '@tailwindcss/vite'

// Applied before first paint so there is no flash of the wrong theme or of
// not-yet-animated content. Kept tiny and dependency free on purpose.
const bootScript = `(function(){try{
var d=document.documentElement;
var m=document.cookie.match(/(?:^|; )plannity-theme=([^;]+)/);
var p=m?decodeURIComponent(m[1]):'system';
var dark=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
if(dark){d.classList.add('dark');d.style.colorScheme='dark'}
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('js-anim');setTimeout(function(){d.classList.add('anim-fallback')},3500)}
}catch(e){}})()`

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    // Server-only. Used by the BFF proxy in server/api when dataSource = 'strapi'.
    strapiUrl: 'http://localhost:1337',
    // Browser-reachable Strapi URL for social sign-in redirects (defaults to strapiUrl).
    strapiPublicUrl: '',
    public: {
      /** 'mock' (default, in-browser demo data) or 'strapi' (BFF proxy to the Strapi API). */
      dataSource: 'mock',
      siteUrl: 'http://localhost:3000',
      creditPriceSatang: 1000,
      trialCredits: 3,
      contactEmail: 'hello@plannity.example',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      titleTemplate: '%s · Plannity',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#6C4CF5' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/brand/favicon-64.png' },
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
        },
      ],
      script: [{ innerHTML: bootScript, tagPosition: 'head' }],
    },
  },

  routeRules: {
    // The user panel is a client-rendered app and must never be indexed.
    '/app': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    '/app/**': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  },

  typescript: {
    strict: true,
  },
})
