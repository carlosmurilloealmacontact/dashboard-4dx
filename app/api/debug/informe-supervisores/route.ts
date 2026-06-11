import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil, cargarPersonas, normalizarCargo } from "@/lib/jerarquia"

function normNombre(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normSemana(s: string): string {
  const digitos = (s ?? "").replace(/\D/g, "")
  if (!digitos) return ""
  return String(Number(digitos))
}

const idxFactory = (headers: string[]) => (n: string) =>
  headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

interface Fuente {
  fuente: string
  spreadsheetId: string
  hoja: string
  rango: string
  columnaCoord: string
  columnaSupervisor: string
  columnaSemana: string
}

const FUENTES: Fuente[] = [
  { fuente: "adherencia4dx", spreadsheetId: "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso", hoja: "Cumplimiento_Diario_MCI", rango: "A:J", columnaCoord: "coordinador", columnaSupervisor: "jefe_inmediato", columnaSemana: "semana" },
  { fuente: "practicasLideres", spreadsheetId: "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso", hoja: "Resumen_Lideres_Diario_Historico_8Sem", rango: "A:L", columnaCoord: "jefe_inmediato", columnaSupervisor: "lider", columnaSemana: "semana" },
  { fuente: "pcaPta", spreadsheetId: "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw", hoja: "Detalle Eventos", rango: "A:P", columnaCoord: "jefe inmediato", columnaSupervisor: "nombre", columnaSemana: "semana" },
  { fuente: "compromisosCopilot", spreadsheetId: "17Jftow3b5V9AFhndlt1MNe6ZBKQD1xBCrQfNqM0vDl4", hoja: "'Pausas 4DX Raw'", rango: "A:J", columnaCoord: "coordinador", columnaSupervisor: "jefe_inmediato", columnaSemana: "" },
]

// Semana ISO (jueves de la semana) a partir de "yyyy-mm-dd", igual que en lib/informes.ts,
// para "Pausas 4DX Raw" que no trae columna semana directa.
function fechaAIsoSemanaPausas(fechaStr: string): string {
  const [y, m, d] = (fechaStr ?? "").split("-").map(Number)
  if (!y || !m || !d) return ""
  const date = new Date(y, m - 1, d)
  const thu = new Date(date)
  thu.setDate(date.getDate() + (4 - (date.getDay() || 7)))
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  return String(Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 })
  }

  const nombreCoord = req.nextUrl.searchParams.get("nombre") ?? ""
  const semana = req.nextUrl.searchParams.get("semana") ?? ""
  if (!nombreCoord || !semana) return NextResponse.json({ error: "Faltan parámetros 'nombre' y 'semana'" }, { status: 400 })
  const coordNorm = normNombre(nombreCoord)
  const semanaNorm = normSemana(semana)

  const personas = await cargarPersonas(session.accessToken)
  const supervisoresEquipo = personas
    .filter(p => normNombre(p.coordinador) === coordNorm && normalizarCargo(p.cargo) === "supervisor")
    .map(p => p.nombre)

  const resultados = await Promise.all(FUENTES.map(async f => {
    try {
      const rows = await getSheetData(session.accessToken!, f.spreadsheetId, `${f.hoja}!${f.rango}`)
      if (rows.length < 2) return { fuente: f.fuente, error: "Hoja vacía o sin acceso" }

      const headers = rows[0]
      const idx = idxFactory(headers)
      const iCoord = idx(f.columnaCoord)
      const iSup = idx(f.columnaSupervisor)
      const iSem = f.columnaSemana ? idx(f.columnaSemana) : -1
      const iFecha = f.fuente === "compromisosCopilot" ? idx("fecha") : -1

      let filasCoord = 0
      let filasCoordSemana = 0
      const supervisoresEnSemana = new Map<string, number>()
      const semanasDisponibles = new Set<string>()

      rows.slice(1).forEach(r => {
        if (normNombre(r[iCoord] ?? "") !== coordNorm) return
        filasCoord++
        const sem = iSem >= 0
          ? normSemana(r[iSem] ?? "")
          : normSemana(fechaAIsoSemanaPausas(r[iFecha] ?? ""))
        if (sem) semanasDisponibles.add(sem)
        if (sem !== semanaNorm) return
        filasCoordSemana++
        const sup = (r[iSup] ?? "").toString().trim()
        if (sup) supervisoresEnSemana.set(sup, (supervisoresEnSemana.get(sup) ?? 0) + 1)
      })

      const supervisoresMatch = [...supervisoresEnSemana.entries()].map(([valor, filas]) => ({
        valor,
        filas,
        coincideConEquipo: supervisoresEquipo.some(s => normNombre(s) === normNombre(valor)),
      }))

      return {
        fuente: f.fuente,
        filasCoord,
        filasCoordSemana,
        semanasDisponibles: [...semanasDisponibles].sort((a, b) => Number(a) - Number(b)),
        supervisoresEnSemana: supervisoresMatch,
      }
    } catch (error: unknown) {
      return { fuente: f.fuente, error: error instanceof Error ? error.message : String(error) }
    }
  }))

  return NextResponse.json({ nombreCoord, semana: semanaNorm, supervisoresEquipo, resultados })
}
