import { getSheetData } from "@/lib/sheets"
import type { PerfilUsuario } from "@/lib/jerarquia"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Resumen_Lideres_Diario_Historico_8Sem"

function parseFecha(f: string): Date | null {
  if (!f) return null
  const p = f.split("/")
  if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]))
  return null
}

function diasRequeridosSemana(semana: string, registros: { fecha: string; semana: string }[]): string[] {
  // Obtener las fechas reales de esa semana del dataset
  const fechasSemana = registros
    .filter(r => r.semana === semana && r.fecha)
    .map(r => r.fecha)
  const unicas = [...new Set(fechasSemana)]
  // Solo Lun-Vie
  return unicas.filter(f => {
    const d = parseFecha(f)
    return d && d.getDay() >= 1 && d.getDay() <= 5
  }).sort()
}

function formatCDR(v: string | null): number | null {
  if (!v || v === "0") return null
  const n = parseFloat(v)
  if (isNaN(n)) return null
  return n <= 1 ? Math.round(n * 100) : Math.round(n)
}

export async function getPracticasLideres(accessToken: string, perfil: PerfilUsuario) {
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:L`)
  if (rows.length < 2) return null

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )
  const iLider    = idx("lider")
  const iJefe     = idx("jefe_inmediato")
  const iFecha    = idx("fecha")
  const iSemana   = idx("semana")
  const iCumple   = idx("cumple")
  const iCDR      = idx("cdr_sim")
  const iFoco     = idx("focos")

  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)
  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()

  if (esCoord) {
    // Vista coordinador: agrupar por supervisor (filtrar por Jefe_Inmediato)
    const registros = rows.slice(1)
      .filter(r => (r[iJefe] ?? "").toLowerCase().trim() === nombrePersona)
      .map(r => ({
        lider:  r[iLider]  ?? "",
        fecha:  r[iFecha]  ?? "",
        semana: r[iSemana] ?? "",
        cumple: r[iCumple] ?? "",
        cdr:    r[iCDR]    ?? "",
        foco:   r[iFoco]   ?? "",
      }))

    const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
    const semanaActual = semanas.at(-1) ?? ""
    const deEstaSemana = registros.filter(r => r.semana === semanaActual)

    // Agrupar por supervisor
    const lideres = [...new Set(registros.map(r => r.lider).filter(Boolean))]
    const porSupervisor = lideres.map(lider => {
      const regs = deEstaSemana.filter(r => r.lider === lider)
      const dias = regs.filter(r => r.fecha)
      const cumplidos = dias.filter(r => r.cumple === "1").length
      const pct = dias.length > 0 ? Math.round((cumplidos / dias.length) * 100) : 0
      const cdrReg = regs.find(r => r.cdr && r.cdr !== "0")
      const cdr = formatCDR(cdrReg?.cdr ?? null)
      return { supervisor: lider, totalDias: dias.length, cumplidos, pct, cdr }
    }).sort((a, b) => a.pct - b.pct)

    const totalDias = deEstaSemana.length
    const totalCumplidos = deEstaSemana.filter(r => r.cumple === "1").length
    const pctGlobal = totalDias > 0 ? Math.round((totalCumplidos / totalDias) * 100) : 0
    const cdrGlobal = (() => {
      const vals = porSupervisor.map(s => s.cdr).filter((v): v is number => v !== null)
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null
    })()

    return {
      modo: "coordinador" as const,
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, cdr: cdrGlobal },
      porSupervisor,
    }
  }

  // Vista supervisor
  const registros = rows.slice(1)
    .filter(r => (r[iLider] ?? "").toLowerCase().trim() === nombrePersona)
    .map(r => ({
      fecha:  r[iFecha]  ?? "",
      semana: r[iSemana] ?? "",
      cumple: r[iCumple] ?? "",
      cdr:    r[iCDR]    ?? "",
      foco:   r[iFoco]   ?? "",
    }))

  const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const semanaActual = semanas.at(-1) ?? ""
  const deEstaSemana = registros.filter(r => r.semana === semanaActual && !esFinDeSemana(r.fecha))

  // Días requeridos esta semana (Lun-Vie)
  const todosLosDias = diasRequeridosSemana(semanaActual, registros)
  const diasCumplidos = deEstaSemana.filter(r => r.cumple === "1")
  const diasFaltantes = todosLosDias.filter(fecha =>
    !deEstaSemana.some(r => r.fecha === fecha && r.cumple === "1")
  )
  const cdrSemana = deEstaSemana.find(r => r.cdr && r.cdr !== "0")?.cdr ?? null
  const pct = todosLosDias.length > 0 ? Math.round((diasCumplidos.length / todosLosDias.length) * 100) : 0

  // Focos más usados
  const conteoFocos: Record<string, number> = {}
  deEstaSemana.forEach(r => { if (r.foco) conteoFocos[r.foco] = (conteoFocos[r.foco] ?? 0) + 1 })
  const focoTop = Object.entries(conteoFocos).sort((a, b) => b[1] - a[1])[0] ?? null

  return {
    modo: "supervisor" as const,
    semanas,
    semanaActual,
    kpi: { pct, cdr: formatCDR(cdrSemana) },
    registros: registros.slice(-60),
    resumenSemana: {
      totalDias: todosLosDias.length,
      diasCumplidos: diasCumplidos.length,
      pct,
      diasFaltantes,
      cdr: formatCDR(cdrSemana),
      focoTop: focoTop ? { foco: focoTop[0], veces: focoTop[1] } : null,
    },
  }
}

function esFinDeSemana(f: string): boolean {
  const d = parseFecha(f)
  return !d || d.getDay() === 0 || d.getDay() === 6
}
