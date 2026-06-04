"use client"

import { createContext, useContext, useState, useCallback } from "react"

interface Metric {
  valor: string       // texto principal: "87%", "25 abiertos"
  alerta?: number     // número de alertas (rojo si > 0)
  color?: "green" | "yellow" | "red" | "blue" | "white"
}

interface MetricContextValue {
  metric: Metric | null
  setMetric: (m: Metric) => void
}

const MetricContext = createContext<MetricContextValue>({
  metric: null,
  setMetric: () => {},
})

export function MetricProvider({ children }: { children: React.ReactNode }) {
  const [metric, setMetricState] = useState<Metric | null>(null)
  const setMetric = useCallback((m: Metric) => setMetricState(m), [])
  return (
    <MetricContext.Provider value={{ metric, setMetric }}>
      {children}
    </MetricContext.Provider>
  )
}

export function useModuloMetric() {
  return useContext(MetricContext)
}
