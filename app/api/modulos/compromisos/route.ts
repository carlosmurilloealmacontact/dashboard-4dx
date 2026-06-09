import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1eGoB7lIMvOfMB71g3S0IQZx5xtbNzwcOFSEqnXG4IuU"
const HOJA = "historico"

function categorizarEstado(estado: string): "sin_ingreso" | "abierto" | "cerrado_mejora" | "cerrado_sin_mejora" {
  const e = (estado ?? "").trim().toLowerCase()
  if (!e || e.includes("sin ingreso")) return "sin_ingreso"
  if (e.includes("con cumplimiento") || e.includes("con mejora")) return "cerrado_mejora"
  if (e.includes("sin cumplimiento") || e.includes("sin mejora") || e.startsWith("cerrado")) return "cerrado_sin_mejora"
  return "abierto"
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:H`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, semanas: [], agentes: [] })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iSemana  = idx("semana")
  const iEstado  = idx("estado compromiso")
  const iNombreA = idx("nombre asesor")
  const iLider   = idx("lider")
  const iCoord   = idx("coordinador")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)

  const registros = rows.slice(1).filter(r => {
    const lider = (r[iLider] ?? "").toLowerCase().trim()
    const coord = (r[iCoord] ?? "").toLowerCase().trim()
    return esCoord ? coord === nombrePersona : lider === nombrePersona
  })

  const semanas = [...new Set(registros.map(r => r[iSemana]).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const semanaActual = semanaParam && semanas.includes(semanaParam) ? semanaParam : (semanas.at(-1) ?? "")
  const deEstaSemana = registros.filter(r => r[iSemana] === semanaActual)

  // Un registro por agente con su estado actual
  const porAgenteMap: Record<string, { asesor: string; estado: string; categoria: ReturnType<typeof categorizarEstado> }> = {}
  deEstaSemana.forEach(r => {
    const nombre = r[iNombreA] ?? ""
    if (!nombre) return
    // Si ya tiene un estado mejor, no pisar (prioridad: cerrado_mejora > abierto > sin_ingreso)
    const existing = porAgenteMap[nombre]
    const cat = categorizarEstado(r[iEstado] ?? "")
    const prioridad = { cerrado_mejora: 4, abierto: 3, cerrado_sin_mejora: 2, sin_ingreso: 1 }
    if (!existing || prioridad[cat] > prioridad[existing.categoria]) {
      porAgenteMap[nombre] = { asesor: nombre, estado: r[iEstado] ?? "", categoria: cat }
    }
  })

  const agentes = Object.values(porAgenteMap).sort((a, b) => {
    // Ordenar: sin_ingreso primero, luego abiertos, luego cerrados
    const ord = { sin_ingreso: 0, abierto: 1, cerrado_sin_mejora: 2, cerrado_mejora: 3 }
    return ord[a.categoria] - ord[b.categoria]
  })

  const sinIngreso     = agentes.filter(a => a.categoria === "sin_ingreso").length
  const abiertos       = agentes.filter(a => a.categoria === "abierto").length
  const cerradoMejora  = agentes.filter(a => a.categoria === "cerrado_mejora").length
  const cerradoSin     = agentes.filter(a => a.categoria === "cerrado_sin_mejora").length

  // Vista coordinador: resumen por supervisor
  let porSupervisor: { supervisor: string; total: number; sinIngreso: number; abiertos: number; cerradoMejora: number }[] | undefined
  if (esCoord) {
    const lideresUnicos = [...new Set(deEstaSemana.map(r => r[iLider]).filter(Boolean))]
    porSupervisor = lideresUnicos.map(lider => {
      const deEste = deEstaSemana.filter(r => r[iLider] === lider)
      const porAg: Record<string, ReturnType<typeof categorizarEstado>> = {}
      deEste.forEach(r => {
        const nombre = r[iNombreA] ?? ""
        if (!nombre) return
        const cat = categorizarEstado(r[iEstado] ?? "")
        const prioridad = { cerrado_mejora: 4, abierto: 3, cerrado_sin_mejora: 2, sin_ingreso: 1 }
        if (!porAg[nombre] || prioridad[cat] > prioridad[porAg[nombre]]) porAg[nombre] = cat
      })
      const cats = Object.values(porAg)
      return {
        supervisor: lider,
        total: cats.length,
        sinIngreso: cats.filter(c => c === "sin_ingreso").length,
        abiertos: cats.filter(c => c === "abierto").length,
        cerradoMejora: cats.filter(c => c === "cerrado_mejora").length,
      }
    }).sort((a, b) => b.sinIngreso - a.sinIngreso)
  }

  return NextResponse.json({
    total: agentes.length,
    semanaActual,
    semanas,
    resumen: { sinIngreso, abiertos, cerradoMejora, cerradoSin },
    agentes,
    porSupervisor,
  })
}
