import { createContext, useContext, type ReactNode } from 'react'
import { createExplainService, type ExplainService } from './explainClient'

let defaultService: ExplainService | null = null
const getDefault = () => (defaultService ??= createExplainService())

const Ctx = createContext<ExplainService | null>(null)

/** Lets tests (and the presentation gallery) swap the explanation service. Without a provider the real backend client is used. */
export function ExplainProvider({ service, children }: { service: ExplainService; children: ReactNode }) {
  return <Ctx.Provider value={service}>{children}</Ctx.Provider>
}

export function useExplainService(): ExplainService {
  return useContext(Ctx) ?? getDefault()
}
