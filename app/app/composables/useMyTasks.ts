/**
 * Whether to show the shared "My Tasks" menu (member-positions spec): for
 * members with a design position in any brand, or anyone who already has
 * assigned work — removing a tag never hides existing tasks.
 */
export function useMyTasks() {
  const api = useApi()
  const brands = useBrands()
  const count = useState<number | null>('my-task-count', () => null)
  let loading: Promise<void> | null = null

  async function load(force = false) {
    if (count.value !== null && !force) return
    loading ??= api.tasks.mine().then((list) => { count.value = list.length }).catch(() => {}).finally(() => { loading = null })
    return loading
  }
  const set = (n: number) => { count.value = n }
  const hasTaskPosition = computed(() => brands.active.value.some((b) => (b.myPositionKeys ?? []).some((k) => TASK_POSITIONS.includes(k))))
  const visible = computed(() => hasTaskPosition.value || (count.value ?? 0) > 0)
  return { count, load, set, visible }
}
