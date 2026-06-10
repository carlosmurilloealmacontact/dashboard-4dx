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
