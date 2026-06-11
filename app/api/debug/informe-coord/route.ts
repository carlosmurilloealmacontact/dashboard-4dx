import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

function normNombre(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const idxFactory = (headers: string[]) => (n: string) =>
  headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

// Cuenta cuántas palabras (normalizadas) tienen en común dos nombres, para
// detectar coincidencias "casi iguales" con distinto orden/formato.
function solapamientoPalabras(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter(Boolean))
  const wb = new Set(b.split(" ").filter(Boolean))
  let n = 0
  wa.forEach(w => { if (wb.has(w)) n++ })
  return n
}

async function inspeccionarColumna(
  accessToken: string,
  spreadsheetId: string,
  hoja: string,
  rango: string,
  columna: string,
  coordNorm: string,
) {
  const rows = await getSheetData(accessToken, spreadsheetId, `${hoja}!${rango}`)
  if (rows.length < 2) return { error: "Hoja vacía o sin acceso", totalFilas: 0 }

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iCol = idx(columna)
  if (iCol < 0) return { error: `Columna "${columna}" no encontrada`, headers, totalFilas: rows.length - 1 }

  const valores = new Map<string, number>()
  rows.slice(1).forEach(r => {
    const v = (r[iCol] ?? "").toString().trim()
    if (!v) return
    valores.set(v, (valores.get(v) ?? 0) + 1)
  })

  const coincidenciaExacta = [...valores.keys()].some(v => normNombre(v) === coordNorm)

  const candidatos = [...valores.entries()]
    .map(([valor, filas]) => ({ valor, filas, palabrasComunes: solapamientoPalabras(normNombre(valor), coordNorm) }))
    .filter(c => c.palabrasComunes >= 2)
    .sort((a, b) => b.palabrasComunes - a.palabrasComunes)
    .slice(0, 5)

  return {
    totalFilas: rows.length - 1,
    valoresUnicos: valores.size,
    coincidenciaExacta,
    candidatosSimilares: candidatos,
  }
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
  if (!nombreCoord) return NextResponse.json({ error: "Falta el parámetro 'nombre'" }, { status: 400 })
  const coordNorm = normNombre(nombreCoord)

  const fuentes = [
    { fuente: "adherencia4dx", spreadsheetId: "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso", hoja: "Cumplimiento_Diario_MCI", rango: "A:J", columna: "coordinador" },
    { fuente: "practicasLideres", spreadsheetId: "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso", hoja: "Resumen_Lideres_Diario_Historico_8Sem", rango: "A:L", columna: "jefe_inmediato" },
    { fuente: "pcaPta", spreadsheetId: "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw", hoja: "Detalle Eventos", rango: "A:P", columna: "jefe inmediato" },
    { fuente: "compromisosCopilot", spreadsheetId: "17Jftow3b5V9AFhndlt1MNe6ZBKQD1xBCrQfNqM0vDl4", hoja: "'Pausas 4DX Raw'", rango: "A:J", columna: "coordinador" },
  ]

  const resultados = await Promise.all(fuentes.map(async f => {
    try {
      const r = await inspeccionarColumna(session.accessToken!, f.spreadsheetId, f.hoja, f.rango, f.columna, coordNorm)
      return { fuente: f.fuente, columnaBuscada: f.columna, ...r }
    } catch (error: unknown) {
      return { fuente: f.fuente, columnaBuscada: f.columna, error: error instanceof Error ? error.message : String(error) }
    }
  }))

  return NextResponse.json({ nombreCoord, coordNorm, resultados })
}
