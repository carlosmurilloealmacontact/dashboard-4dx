import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1ElOVG-6SQZt_ZjnWKY7vUcWK78Zgm4dr4xZv3a5iA2k"
const HOJA = "Data2"

function presentoQuiz(v: string) {
  return (v ?? "").toLowerCase().includes("presentó") || (v ?? "").toLowerCase().includes("presento")
}
function aproboQuiz(puntuacion: string) {
  return parseInt(puntuacion ?? "0") >= 30
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:AY`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, semanas: [], modo: "supervisor" })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iSemana = idx("semana")
  const iNombre = idx("nombre_completo")
  const iJefe   = idx("jefe_inmediato")
  const iCoord  = idx("coordinador")
  const iPres   = idx("presentacion")
  const iPunt   = idx("puntuacion")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)

  if (esCoord) {
    // Vista coordinador: filtrar por coordinador, agrupar por jefe
    const registros = rows.slice(1).filter(r =>
      (r[iCoord] ?? "").toLowerCase().trim() === nombrePersona
    )
    const semanas = [...new Set(registros.map(r => r[iSemana]).filter(Boolean))].sort((a, b) => Number(a.replace("W","")) - Number(b.replace("W","")))
    const semanaActual = semanas.at(-1) ?? ""
    const deEstaSemana = registros.filter(r => r[iSemana] === semanaActual)

    const jefesUnicos = [...new Set(deEstaSemana.map(r => r[iJefe]).filter(Boolean))]
    const porSupervisor = jefesUnicos.map(jefe => {
      const equipo = deEstaSemana.filter(r => r[iJefe] === jefe)
      const presentaron = equipo.filter(r => presentoQuiz(r[iPres] ?? ""))
      const aprobaron = equipo.filter(r => presentoQuiz(r[iPres] ?? "") && aproboQuiz(r[iPunt] ?? ""))
      return {
        supervisor: jefe,
        total: equipo.length,
        presento: presentaron.length,
        noPresento: equipo.length - presentaron.length,
        aprueba: aprobaron.length,
      }
    }).sort((a, b) => b.noPresento - a.noPresento)

    const totalPresento  = deEstaSemana.filter(r => presentoQuiz(r[iPres] ?? "")).length
    const totalNoPresento = deEstaSemana.length - totalPresento

    return NextResponse.json({
      modo: "coordinador",
      total: deEstaSemana.length,
      semanaActual,
      semanas,
      resumen: { presento: totalPresento, noPresento: totalNoPresento },
      porSupervisor,
    })
  }

  // Vista supervisor
  const registros = rows.slice(1).filter(r =>
    (r[iJefe] ?? "").toLowerCase().trim() === nombrePersona
  )
  const semanas = [...new Set(registros.map(r => r[iSemana]).filter(Boolean))].sort((a, b) => Number(a.replace("W","")) - Number(b.replace("W","")))
  const semanaActual = semanas.at(-1) ?? ""
  const deEstaSemana = registros.filter(r => r[iSemana] === semanaActual)

  const presentaron  = deEstaSemana.filter(r => presentoQuiz(r[iPres] ?? ""))
  const aprobaron    = deEstaSemana.filter(r => presentoQuiz(r[iPres] ?? "") && aproboQuiz(r[iPunt] ?? ""))
  const noPresento   = deEstaSemana.length - presentaron.length

  return NextResponse.json({
    modo: "supervisor",
    total: deEstaSemana.length,
    semanaActual,
    semanas,
    resumen: {
      presento: presentaron.length,
      noPresento,
      aprueba: aprobaron.length,
      reprueba: presentaron.length - aprobaron.length,
    },
    agentes: deEstaSemana.map(r => ({
      nombre:    r[iNombre] ?? "",
      presento:  presentoQuiz(r[iPres] ?? ""),
      aprueba:   presentoQuiz(r[iPres] ?? "") && aproboQuiz(r[iPunt] ?? ""),
    })),
  })
}
