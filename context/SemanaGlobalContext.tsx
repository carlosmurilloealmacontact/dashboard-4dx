"use client"

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react"

/**
 * Filtro de semana GLOBAL para todas las tarjetas de módulos.
 *
 * - Cada módulo que tenga semanas llama a `reportWeeks(moduleId, semanas)` con sus
 *   semanas YA normalizadas a número (string sin "W", sin ceros raros). Ej: "W24" → "24".
 * - El provider calcula la UNIÓN de todas las semanas reportadas → `semanasDisponibles`.
 * - `semanaGlobal` es la semana seleccionada (número string). Por defecto, la más reciente.
 * - Los módulos leen `semanaGlobal` y muestran esa semana (o "sin datos" si no la tienen).
 *
 * Si un módulo se monta SIN provider (useSemanaGlobal con defaults), `semanaGlobal` es null
 * → el módulo cae a su propia semana más reciente (compatibilidad hacia atrás).
 */

export function normalizarSemana(s: string | number | null | undefined): string {
  const digitos = String(s ?? "").replace(/\D/g, "")
  if (!digitos) return ""
  // Quita ceros a la izquierda para que "2" y "02" sean la misma semana
  return String(Number(digitos))
}

// Semana ISO actual (mismo cálculo que usan los módulos basados en fecha)
function semanaISOActual(): number {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
}

interface SemanaGlobalValue {
  semanaGlobal: string | null
  setSemanaGlobal: (s: string) => void
  semanasDisponibles: string[]            // números string, orden ascendente
  reportWeeks: (moduleId: string, semanas: (string | number)[]) => void
}

const SemanaGlobalContext = createContext<SemanaGlobalValue>({
  semanaGlobal: null,
  setSemanaGlobal: () => {},
  semanasDisponibles: [],
  reportWeeks: () => {},
})

export function SemanaGlobalProvider({ children }: { children: React.ReactNode }) {
  const [semanaGlobal, setSemanaGlobalState] = useState<string | null>(null)
  // Semanas reportadas por cada módulo (no provoca render por sí solo)
  const porModulo = useRef<Record<string, string[]>>({})
  const [version, setVersion] = useState(0)  // bump cuando cambia la unión

  const reportWeeks = useCallback((moduleId: string, semanas: (string | number)[]) => {
    const norm = [...new Set(semanas.map(normalizarSemana).filter(Boolean))].sort()
    const prev = porModulo.current[moduleId] ?? []
    // Solo re-render si realmente cambió el set de este módulo
    if (prev.length === norm.length && prev.every((v, i) => v === norm[i])) return
    porModulo.current[moduleId] = norm
    setVersion(v => v + 1)
  }, [])

  const semanasDisponibles = useMemo(() => {
    void version // recalcula cuando cambia la unión
    const todas = new Set<string>()
    Object.values(porModulo.current).forEach(arr => arr.forEach(s => todas.add(s)))

    // Las semanas ISO no llevan año: una semana 44-52 reportada cuando vamos
    // por la semana ~2-24 del año actual es del ciclo anterior (año pasado),
    // no una semana futura. Las "rotamos" para que ordenen antes que las del
    // año en curso, en vez de aparecer al final como si fueran futuras.
    const actual = semanaISOActual()
    const margen = 4
    const orden = (s: string) => {
      const n = Number(s)
      return n > actual + margen ? n - 100 : n
    }

    return [...todas].sort((a, b) => orden(a) - orden(b))
  }, [version])

  // Default: la semana más reciente, una vez que haya semanas disponibles
  useEffect(() => {
    if (semanaGlobal === null && semanasDisponibles.length > 0) {
      setSemanaGlobalState(semanasDisponibles[semanasDisponibles.length - 1])
    }
  }, [semanasDisponibles, semanaGlobal])

  const setSemanaGlobal = useCallback((s: string) => setSemanaGlobalState(normalizarSemana(s)), [])

  return (
    <SemanaGlobalContext.Provider value={{ semanaGlobal, setSemanaGlobal, semanasDisponibles, reportWeeks }}>
      {children}
    </SemanaGlobalContext.Provider>
  )
}

export function useSemanaGlobal() {
  return useContext(SemanaGlobalContext)
}
