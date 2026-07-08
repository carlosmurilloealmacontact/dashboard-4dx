/**
 * Resuelve qué semana usar dado un parámetro (posiblemente "24", "W24", null)
 * contra la lista de semanas disponibles (en su formato original, ej. "W24" o "24").
 * Compara por número (ignora "W" y demás no-dígitos). Si no hay match, devuelve la última.
 */
export function resolverSemana(param: string | null | undefined, semanas: string[]): string {
  if (param) {
    const objetivo = Number(String(param).replace(/\D/g, ""))
    const match = semanas.find(s => Number(String(s).replace(/\D/g, "")) === objetivo)
    if (match) return match
  }
  return semanas.at(-1) ?? ""
}

/**
 * Semana ISO actual (mismo cálculo que `semanaISOActual()` en
 * SemanaGlobalContext.tsx), para endpoints de servidor que necesitan una
 * semana por defecto sin depender de que un módulo ya haya reportado semanas.
 */
export function semanaISOActual(): number {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
}
