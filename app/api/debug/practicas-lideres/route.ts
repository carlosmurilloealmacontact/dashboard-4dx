import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Resumen_Lideres_Diario_Historico_8Sem"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: `No encontrado: ${email}` }, { status: 404 })

  const rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:L`)
  const headers = rows[0] ?? []
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )
  const iLider  = idx("lider")
  const iJefe   = idx("jefe_inmediato")
  const iFecha  = idx("fecha")
  const iSemana = idx("semana")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)

  const dataRows = rows.slice(1)

  // Semanas globales de TODA la hoja
  const semanasGlobales = [...new Set(dataRows.map(r => (r[iSemana] ?? "").trim()).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))

  // Filas del perfil (como las filtra la lib)
  const filasPerfil = dataRows.filter(r =>
    esCoord
      ? (r[iJefe] ?? "").toLowerCase().trim() === nombrePersona
      : (r[iLider] ?? "").toLowerCase().trim() === nombrePersona
  )
  const semanasPerfil = [...new Set(filasPerfil.map(r => (r[iSemana] ?? "").trim()).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))

  // Nombres de líder únicos en la hoja que CONTIENEN parte del nombre buscado (para detectar grafías distintas)
  const tokens = nombrePersona.split(" ").filter(t => t.length > 3)
  const lideresParecidos = [...new Set(dataRows.map(r => (r[iLider] ?? "").trim()).filter(Boolean))]
    .filter(l => {
      const ln = l.toLowerCase()
      return tokens.some(t => ln.includes(t))
    })

  return NextResponse.json({
    perfil: { nombre: perfil.persona.nombre, rol: perfil.rol, esCoord },
    headers,
    columnas: { iLider, iJefe, iFecha, iSemana },
    semanaMaxGlobal: semanasGlobales.at(-1),
    semanasGlobales,
    semanaMaxPerfil: semanasPerfil.at(-1),
    semanasPerfil,
    filasPerfilCount: filasPerfil.length,
    ultimasFilasPerfil: filasPerfil.slice(-10).map(r => ({
      lider: r[iLider] ?? "", fecha: r[iFecha] ?? "", semana: r[iSemana] ?? "",
    })),
    lideresParecidos,
  })
}
