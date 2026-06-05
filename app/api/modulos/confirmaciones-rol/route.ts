import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Confirmaciones de Rol"

const DIMS_LABELS: Record<string, string> = {
  preparacion: "Preparación", involucramiento: "Involucramiento",
  herramientas: "Herramientas", alineacion: "Alineación",
  reconocimiento: "Reconocimiento", retroalimentacion: "Retroalimentación",
  seguimiento: "Seguimiento", tips: "Tips", resumen: "Resumen",
}

function textoANum(v: string): number | null {
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower === "1" || lower.includes("completa")) return 1
  if (lower.includes("parcial")) return 0.5
  if (lower.includes("observado") || lower === "0") return 0
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return String(week)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:BJ`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, esCoach: false, promedios: {}, ultimas5: [] })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() === n.toLowerCase().trim()
  )

  // Columna AT (46) para nombre del coach, buscar la segunda "Nombre" si hay múltiples
  let iNombreCoach = -1
  let nombreCount = 0
  for (let i = 0; i < headers.length; i++) {
    if ((headers[i] ?? "").toLowerCase().trim() === "nombre") {
      nombreCount++
      if (nombreCount === 2 || i >= 45) { // AT es columna 46 (índice 45)
        iNombreCoach = i
        break
      }
    }
  }
  if (iNombreCoach === -1) iNombreCoach = idx("nombre") // Fallback

  const iLiderAcomp  = idx("lider acompanado")
  const iRitual      = headers.findIndex(h => (h ?? "").toLowerCase().includes("ritual") && (h ?? "").toLowerCase().includes("acompan"))
  const iPontos      = idx("pontos fortes")
  const iOport       = idx("oportunidades de melhoria")
  const iFecha       = headers.findIndex(h => (h ?? "").toLowerCase().includes("criação") || (h ?? "").toLowerCase().includes("criacao"))
  const iPrep        = idx("preparacion")
  const iInvol       = idx("involucramiento")
  const iHerr        = headers.findIndex(h => (h ?? "").toLowerCase().includes("ferramenta"))
  const iAlin        = headers.findIndex(h => (h ?? "").toLowerCase().includes("resultados") && headers.indexOf(h) > 28)
  const iRecon       = headers.findIndex(h => (h ?? "").toLowerCase().includes("celebra"))
  const iRetro       = headers.findIndex(h => (h ?? "").toLowerCase().includes("reforça") || (h ?? "").toLowerCase().includes("reforca"))
  const iSeg         = headers.findIndex(h => (h ?? "").toLowerCase().includes("escalamento"))
  const iTips        = headers.findIndex(h => (h ?? "").toLowerCase().includes("dicas"))
  const iResumen     = headers.findIndex(h => (h ?? "").toLowerCase().includes("encerra"))

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esSupervisor = perfil.rol === "supervisor"

  console.log("DEBUG confirmaciones-rol:")
  console.log("  nombrePersona:", nombrePersona)
  console.log("  esSupervisor:", esSupervisor)
  console.log("  iNombreCoach index:", iNombreCoach)
  console.log("  primeros 5 nombres:", rows.slice(1, 6).map(r => (r[iNombreCoach] ?? "").toLowerCase().trim()))

  const confirmaciones = rows.slice(1).filter(r => {
    if (esSupervisor) return (r[iLiderAcomp] ?? "").toLowerCase().trim() === nombrePersona
    return (r[iNombreCoach] ?? "").toLowerCase().trim() === nombrePersona
  }).map(r => ({
    fecha:      r[iFecha]  ?? "",
    semana:     getISOWeek(r[iFecha] ?? ""),
    ritual:     iRitual >= 0 ? r[iRitual] : "",
    pontos:     r[iPontos] ?? "",
    oport:      r[iOport]  ?? "",
    liderAcomp: r[iLiderAcomp] ?? "",
    dims: {
      preparacion:       r[iPrep]  ?? "",
      involucramiento:   r[iInvol] ?? "",
      herramientas:      iHerr >= 0 ? r[iHerr] : "",
      alineacion:        iAlin >= 0 ? r[iAlin]  : "",
      reconocimiento:    iRecon >= 0 ? r[iRecon] : "",
      retroalimentacion: iRetro >= 0 ? r[iRetro] : "",
      seguimiento:       iSeg >= 0  ? r[iSeg]  : "",
      tips:              iTips >= 0 ? r[iTips] : "",
      resumen:           iResumen >= 0 ? r[iResumen] : "",
    }
  }))

  // Semana actual del servidor
  const semanaActual = getISOWeek(new Date().toISOString())
  const deEstaSemana = confirmaciones.filter(c => c.semana === semanaActual)

  // Promedios por dimensión (todas las confirmaciones)
  function promDim(key: keyof typeof confirmaciones[0]["dims"]) {
    const vals = confirmaciones.map(c => textoANum(c.dims[key])).filter((v): v is number => v !== null)
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b) / vals.length) * 100) : null
  }

  const promedios: Record<string, number | null> = {}
  Object.keys(DIMS_LABELS).forEach(k => { promedios[k] = promDim(k as keyof typeof confirmaciones[0]["dims"]) })

  // Ítem más afectado = dimensión con menor promedio
  const dimMasAfectada = Object.entries(promedios)
    .filter(([, v]) => v !== null)
    .sort((a, b) => (a[1] as number) - (b[1] as number))[0]

  // Para supervisor: alerta = ítem más afectado
  // Para coach: alerta = si no hizo confirmaciones esta semana
  const alertaSupervisor = dimMasAfectada
    ? `${DIMS_LABELS[dimMasAfectada[0]]}: ${dimMasAfectada[1]}%`
    : null
  const alertaCoach = deEstaSemana.length === 0 && confirmaciones.length > 0
    ? "Sin confirmaciones esta semana"
    : null

  return NextResponse.json({
    total: confirmaciones.length,
    esSupervisor,
    semanaActual,
    deEstaSemana: deEstaSemana.length,
    alertaSupervisor,
    alertaCoach,
    promedios,
    dimMasAfectada: dimMasAfectada ? { key: dimMasAfectada[0], label: DIMS_LABELS[dimMasAfectada[0]], valor: dimMasAfectada[1] } : null,
    ultimas5: confirmaciones.slice(-5),
  })
}
