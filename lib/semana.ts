/**
 * Ordena semanas cronológicamente, no solo por número. Un `sort` numérico simple
 * (`Number(a) - Number(b)`) rompe al cruzar de año: la semana 53 de diciembre queda
 * "después" de la semana 32 del año siguiente porque 53 > 32, aunque cronológicamente
 * la 53 es mucho más vieja. Esto hacía que `semanas.at(-1)` (usado como fallback de
 * "semana actual" en toda la app) devolviera una semana de diciembre del año anterior
 * en vez de la semana real más reciente (bug confirmado 2026-08-11, caso Trejos
 * Hincapié Melissa: semana 53/2025 se mostraba como "actual" en vez de la 32/2026).
 *
 * Heurística: al no tener el año explícito en la hoja, se detecta el "salto" más
 * grande entre semanas consecutivas (ordenadas por número) — ese salto es el cruce
 * de año. Se agrupan las semanas en bloques separados por saltos grandes (>=10,
 * mucho mayor que un hueco normal de semanas faltantes) y se ordenan los bloques por
 * su promedio de forma descendente (el bloque con semanas más altas, ej. 47-53,
 * es cronológicamente más viejo que un bloque con semanas bajas, ej. 2-32).
 * Cubre el caso real de la app (retención de datos que cruza un único fin de año);
 * no intenta resolver múltiples cruces de año con semanas bajas repetidas.
 */
export function ordenarSemanas(semanas: string[]): string[] {
  const conNumero = semanas
    .map(s => ({ s, n: Number(String(s).replace(/\D/g, "")) }))
    .filter(({ n }) => !isNaN(n))
  const numerosUnicos = [...new Set(conNumero.map(({ n }) => n))].sort((a, b) => a - b)

  if (numerosUnicos.length < 2) {
    return conNumero.sort((a, b) => a.n - b.n).map(({ s }) => s)
  }

  const UMBRAL_SALTO_ANIO = 10
  const bloques: number[][] = [[numerosUnicos[0]]]
  for (let i = 1; i < numerosUnicos.length; i++) {
    const salto = numerosUnicos[i] - numerosUnicos[i - 1]
    if (salto >= UMBRAL_SALTO_ANIO) bloques.push([])
    bloques.at(-1)!.push(numerosUnicos[i])
  }

  const bloquesOrdenados = bloques
    .sort((a, b) => (b.reduce((s, n) => s + n, 0) / b.length) - (a.reduce((s, n) => s + n, 0) / a.length))

  const ordenNumeros = bloquesOrdenados.flat()
  const primeraAparicion = new Map<number, string>()
  conNumero.forEach(({ s, n }) => { if (!primeraAparicion.has(n)) primeraAparicion.set(n, s) })

  return ordenNumeros.map(n => primeraAparicion.get(n)!).filter(Boolean)
}

/**
 * Resuelve qué semana usar dado un parámetro (posiblemente "24", "W24", null)
 * contra la lista de semanas disponibles (en su formato original, ej. "W24" o "24").
 * Compara por número (ignora "W" y demás no-dígitos). Si no hay match, devuelve la
 * última cronológicamente (ver `ordenarSemanas`), no la última del array recibido.
 */
export function resolverSemana(param: string | null | undefined, semanas: string[]): string {
  if (param) {
    const objetivo = Number(String(param).replace(/\D/g, ""))
    const match = semanas.find(s => Number(String(s).replace(/\D/g, "")) === objetivo)
    if (match) return match
  }
  return ordenarSemanas(semanas).at(-1) ?? ""
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

/**
 * Número de semanas ISO que tiene un año (52 o 53). Un año ISO tiene 53 semanas
 * cuando el 1 de enero cae jueves, o cuando es bisiesto y el 1 de enero cae
 * miércoles (regla estándar ISO 8601: el año tiene 53 semanas si termina en jueves,
 * equivalente a estas condiciones sobre el 1 de enero).
 */
function semanasISOEnAnio(anio: number): number {
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  const diaEnero1 = new Date(anio, 0, 1).getDay() // 0=Dom..6=Sáb
  const diaISO = diaEnero1 === 0 ? 7 : diaEnero1   // 1=Lun..7=Dom
  return diaISO === 4 || (bisiesto && diaISO === 3) ? 53 : 52
}

/**
 * Semana ISO inmediatamente anterior a `semana`, manejando el cruce de año:
 * dentro del mismo año, "anterior" es simplemente restar 1 (las semanas ISO son
 * consecutivas sin huecos). Pero la semana 1 no puede resolverse restando 1 (daría
 * "0") — su anterior es la última semana ISO del año calendario previo (52 o 53
 * según el año, ver `semanasISOEnAnio`). Como las hojas no guardan el año junto al
 * número de semana, se asume que "semana 1" se refiere al año calendario actual al
 * momento de la consulta (igual supuesto que usa `semanaISOActual()` en el resto
 * del código) — válido para informes generados sobre semanas recientes, que es el
 * único caso de uso real (Informe IA no genera reportes de semanas de hace años).
 */
export function semanaAnterior(semana: string): string {
  const n = Number(String(semana).replace(/\D/g, ""))
  if (!n) return ""
  if (n > 1) return String(n - 1)
  return String(semanasISOEnAnio(new Date().getFullYear() - 1))
}

/**
 * Semana ISO inmediatamente siguiente a `semana` — simétrico a `semanaAnterior`.
 * Dentro del mismo año, sumar 1; pero si `semana` ya es la última semana ISO del
 * año en curso (52 o 53 según el año), la siguiente es la semana 1 del año
 * siguiente, no "53" o "54" (que no existen). Mismo supuesto de año que
 * `semanaAnterior`: se asume el año calendario actual.
 */
export function semanaSiguiente(semana: string): string {
  const n = Number(String(semana).replace(/\D/g, ""))
  if (!n) return ""
  if (n < semanasISOEnAnio(new Date().getFullYear())) return String(n + 1)
  return "1"
}
