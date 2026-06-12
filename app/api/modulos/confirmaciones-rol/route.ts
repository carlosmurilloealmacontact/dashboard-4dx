import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil, normalizarCargo } from "@/lib/jerarquia"

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

function parseSheetDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const s = dateStr.trim()
  // Formato ISO con guiones: "2026-06-01" o "2026-06-01 12:02"
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return isNaN(d.getTime()) ? null : d
  }
  // Formato LATAM con barras: "dd/mm/yyyy" o "dd/mm/yyyy HH:MM:SS"
  const parts = s.split("/")
  if (parts.length === 3) {
    const day   = Number(parts[0])
    const month = Number(parts[1])
    const year  = Number(parts[2].split(" ")[0].split("T")[0])
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900) {
      const d = new Date(year, month - 1, day)
      return isNaN(d.getTime()) ? null : d
    }
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function getISOWeek(dateStr: string): string {
  const d = parseSheetDate(dateStr)
  if (!d) return ""
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

  // Columna AT (índice 45) para nombre del coach
  // Buscar columna "nombre" que esté en posición >= 45 o es la segunda "Nombre"
  let iNombreCoach = -1
  let nombrePositions: number[] = []

  for (let i = 0; i < headers.length; i++) {
    if ((headers[i] ?? "").toLowerCase().trim() === "nombre") {
      nombrePositions.push(i)
    }
  }

  // Preferir la más cercana a columna AT (índice 45)
  if (nombrePositions.length > 0) {
    iNombreCoach = nombrePositions.reduce((closest, current) =>
      Math.abs(current - 45) < Math.abs(closest - 45) ? current : closest
    )
  }

  console.log("DEBUG confirmaciones-rol: iNombreCoach=", iNombreCoach, "posiciones encontradas=", nombrePositions)

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

  // Vista coordinador (ej. Katheryne Quiñones): confirmaciones realizadas por cada coach de su equipo
  if (perfil.rol === "coordinador") {
    const coaches = perfil.equipo.filter(p => normalizarCargo(p.cargo) === "coach")

    const confirmacionesEquipo = rows.slice(1)
      .map(r => ({
        nombreCoach: (r[iNombreCoach] ?? "").toLowerCase().trim(),
        fecha:  r[iFecha] ?? "",
        ritual: iRitual >= 0 ? r[iRitual] : "",
        liderAcomp: r[iLiderAcomp] ?? "",
      }))
      .map(c => ({ ...c, semana: getISOWeek(c.fecha) }))

    const semanaActual = getISOWeek(new Date().toISOString())

    const porCoach = coaches.map(coach => {
      const nombreCoach = (coach.nombre ?? "").toLowerCase().trim()
      const confs = confirmacionesEquipo.filter(c => c.nombreCoach === nombreCoach)
      const estaSemana = confs.filter(c => c.semana === semanaActual)
      return {
        coach: coach.nombre,
        total: confs.length,
        estaSemana: estaSemana.length,
        confirmaciones: confs.map(c => ({ fecha: c.fecha, semana: c.semana, liderAcomp: c.liderAcomp, ritual: c.ritual })),
      }
    })

    const semanas = [...new Set(confirmacionesEquipo.map(c => c.semana).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))

    const total = porCoach.reduce((s, c) => s + c.total, 0)
    const estaSemana = porCoach.reduce((s, c) => s + c.estaSemana, 0)

    const response = NextResponse.json({
      modo: "coordinador",
      total,
      esSupervisor: false,
      semanaActual,
      semanas,
      deEstaSemana: estaSemana,
      alertaSupervisor: null,
      alertaCoach: null,
      promedios: {},
      dimMasAfectada: null,
      porCoach,
      ultimas5: [],
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

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

  // Semana actual: lunes 00:00 → domingo 23:59 (más robusto que ISO week)
  const hoy = new Date()
  const diaSemana = hoy.getDay() // 0=dom, 1=lun, ...
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1))
  lunes.setHours(0, 0, 0, 0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  domingo.setHours(23, 59, 59, 999)

  const semanaActual = getISOWeek(new Date().toISOString())
  const deEstaSemana = confirmaciones.filter(c => {
    const d = parseSheetDate(c.fecha)
    return d !== null && d >= lunes && d <= domingo
  })

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

  // Semanas con confirmaciones (para el filtro)
  const semanas = [...new Set(confirmaciones.map(c => c.semana).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))

  const response = NextResponse.json({
    total: confirmaciones.length,
    esSupervisor,
    semanaActual,
    semanas,
    deEstaSemana: deEstaSemana.length,
    alertaSupervisor,
    alertaCoach,
    promedios,
    dimMasAfectada: dimMasAfectada ? { key: dimMasAfectada[0], label: DIMS_LABELS[dimMasAfectada[0]], valor: dimMasAfectada[1] } : null,
    // Lista completa (ligera) para filtrar por semana en el frontend
    confirmaciones: confirmaciones.map(c => ({
      fecha: c.fecha, semana: c.semana, liderAcomp: c.liderAcomp, ritual: c.ritual,
    })),
    ultimas5: confirmaciones.slice(-10),
  })

  response.headers.set('Cache-Control', 'no-store')
  return response
}
