import { useAppStore } from '../store/app-store'
import { useQueryClient } from '@tanstack/react-query'

export function DomainModeToggle(): JSX.Element {
  const { domainMode, setDomainMode } = useAppStore()
  const queryClient = useQueryClient()

  function toggle(): void {
    const next = domainMode === 'root' ? 'subdomain' : 'root'
    setDomainMode(next)
    // Invalidate all report queries so they refetch with new domain mode
    queryClient.invalidateQueries({ queryKey: ['aio'] })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Domain:</span>
      <button
        onClick={toggle}
        className="flex items-center gap-0 rounded overflow-hidden border border-gray-300 text-xs"
        title="Toggle between root domain and full subdomain aggregation"
      >
        <span
          className={`px-3 py-1 transition-colors ${
            domainMode === 'root'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          Root
        </span>
        <span
          className={`px-3 py-1 transition-colors ${
            domainMode === 'subdomain'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          Subdomain
        </span>
      </button>
      <span className="text-xs text-gray-400 italic">session only</span>
    </div>
  )
}
