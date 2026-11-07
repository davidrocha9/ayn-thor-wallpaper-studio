import { createContext, useContext } from 'react'

import type { Studio } from '@/hooks/use-studio'

export const StudioContext = createContext<Studio | null>(null)

export function useStudioContext(): Studio {
  const studio = useContext(StudioContext)
  if (!studio) throw new Error('useStudioContext must be used inside <StudioContext.Provider>')
  return studio
}
