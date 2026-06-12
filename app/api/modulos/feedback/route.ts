import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1gd_ldwaaCCVVTV4iSh7oW9GHLyntWmmBQmfOo8Z1WtU"
const HOJA = "Data"

// Condensar 4 estados en 3
function condensarEstado(etapa: string): "nuevo" | "gestionado" | "rechazado" {
  const e = etapa.toLowerCase().trim()
  if (e.includes("declin") || e.includes("rechaz")) return "rechazado"
  if (e === "seleccionado" || e.includes("gestion")) return "gestionado"
  // "aplicado", "selección", "seleccion" y cualquier otro = nuevo sin gestionar
  return "nuevo"
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const servicioParam = req.nextUrl.searchParams.get("servicio")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:AA`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, resumen: {}, feedbacks: [] })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iEtapa     = idx("etapa atual")
  const iNombreQ   = idx("nombre completo")
  const iNombreA   = idx("nombre")
  const iJefe      = idx("jefe inmediato")
  const iMotivo    = idx("motivo do feedback")
  const iCausa     = idx("causa raiz do feedback")
  const iFeedback  = headers.findIndex(h =>
    (h ?? "").toLowerCase().includes("feedback você gostaria") &&
    !(h ?? "").toLowerCase().includes(".1")
  )
  const iSemana    = idx("semana")
  const iIdProyecto = idx("id do projeto")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)

  // Para coordinador, necesitamos los supervisores bajo su cargo
  const supervisoresCoord = esCoord
    ? perfil.supervisores
        .filter(s => !servicioParam || (s.servicio ?? "").toLowerCase().trim() === servicioParam.toLowerCase().trim())
        .map(s => (s.nombre ?? "").toLowerCase().trim())
    : []

  const feedbacks = rows.slice(1)
    .filter(r => {
      const jefe = (r[iJefe] ?? "").toLowerCase().trim()
      if (esCoord) return supervisoresCoord.includes(jefe)
      return jefe === nombrePersona
    })
    .map(r => ({
      id:         iIdProyecto >= 0 ? (r[iIdProyecto] ?? "") : "",
      etapaRaw:   r[iEtapa]    ?? "",
      estado:     condensarEstado(r[iEtapa] ?? ""),
      quien:      r[iNombreQ]  ?? "",
      asesor:     r[iNombreA]  ?? "",
      motivo:     r[iMotivo]   ?? "",
      causa:      r[iCausa]    ?? "",
      feedback:   iFeedback >= 0 ? r[iFeedback] : "",
      semana:     r[iSemana]   ?? "",
    }))

  const nuevos      = feedbacks.filter(f => f.estado === "nuevo")
  const gestionados = feedbacks.filter(f => f.estado === "gestionado")
  const rechazados  = feedbacks.filter(f => f.estado === "rechazado")

  // Causas de los nuevos (sin gestionar) — más relevantes
  const porCausa: Record<string, number> = {}
  nuevos.forEach(f => { if (f.causa) porCausa[f.causa] = (porCausa[f.causa] ?? 0) + 1 })
  const causaTop = Object.entries(porCausa).sort((a, b) => b[1] - a[1]).slice(0, 4)

  // Vista coordinador: resumen por supervisor
  let porSupervisor: {
    supervisor: string
    nuevos: number
    gestionados: number
    rechazados: number
    total: number
    items: typeof feedbacks
  }[] | undefined
  if (esCoord) {
    porSupervisor = supervisoresCoord.map(sup => {
      const itemsSup = rows.slice(1)
        .filter(r => (r[iJefe] ?? "").toLowerCase().trim() === sup)
        .map(r => ({
          id:         iIdProyecto >= 0 ? (r[iIdProyecto] ?? "") : "",
          etapaRaw:   r[iEtapa]    ?? "",
          estado:     condensarEstado(r[iEtapa] ?? ""),
          quien:      r[iNombreQ]  ?? "",
          asesor:     r[iNombreA]  ?? "",
          motivo:     r[iMotivo]   ?? "",
          causa:      r[iCausa]    ?? "",
          feedback:   iFeedback >= 0 ? r[iFeedback] : "",
          semana:     r[iSemana]   ?? "",
        }))
      const nuevosSup      = itemsSup.filter(f => f.estado === "nuevo")
      const gestionadosSup = itemsSup.filter(f => f.estado === "gestionado")
      const rechazadosSup  = itemsSup.filter(f => f.estado === "rechazado")
      return {
        supervisor: sup,
        total: itemsSup.length,
        nuevos: nuevosSup.length,
        gestionados: gestionadosSup.length,
        rechazados: rechazadosSup.length,
        items: [...nuevosSup.slice(-10), ...gestionadosSup.slice(-5)],
      }
    }).filter(s => s.total > 0)
      .sort((a, b) => b.nuevos - a.nuevos)
  }

  return NextResponse.json({
    total: feedbacks.length,
    esCoord,
    resumen: {
      nuevos:      nuevos.length,
      gestionados: gestionados.length,
      rechazados:  rechazados.length,
    },
    causaTop,
    porSupervisor,
    feedbacks: [
      ...nuevos.slice(-10),
      ...gestionados.slice(-5),
    ],
  })
}
