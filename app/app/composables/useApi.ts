import type { DataSource } from '~/services/api/contract'

export function useApi(): DataSource {
  return useNuxtApp().$api as DataSource
}

export function useIsMock(): boolean {
  return useRuntimeConfig().public.dataSource !== 'strapi'
}
