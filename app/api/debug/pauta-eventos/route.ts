import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil, cargarPersonas, type Persona } from "@/lib/jerarquia"

const SHEET_ID_PAUTA = "1MVyZW1N45iQgDiii6cnCFBCwFl4zk6B5s4ScqkwNF-U"
const HOJA_PAUTA = "Alertas"

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 })
  }

  const nombre = req.nextUrl.searchParams.get("nombre") ?? ""
  const semana = req.nextUrl.searchParams.get("semana") ?? ""
  const nombreNorm = normNombre(nombre)
  const semanaNorm = normSemana(semana)

  const [rows, personas] = await Promise.all([
    getSheetData(session.accessToken, SHEET_ID_PAUTA, `'${HOJA_PAUTA}'!A:R`),
    cargarPersonas(session.accessToken),
  ])
  if (rows.length < 2) return NextResponse.json({ headers: [], filas: [] })

  const personasPorBP = new Map<string, Persona>()
  personas.forEach(p => {
    const bp = (p.usuarioLatam ?? "").toString().trim().toLowerCase()
    if (bp) personasPorBP.set(bp, p)
  })

  const headers = rows[0]
  const idxOf = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iSupervisor = idxOf("supervisor")
  const iBP = idxOf("bp")
  const iEvaluador = idxOf("evaluador")
  const iSemana = idxOf("semana")
  const iFecha = idxOf("fecha auditoria")
  const iNota = idxOf("notafinal")

  const filas = rows.slice(1)
    .map(r => {
      const bp = (r[iBP] ?? "").toString().trim().toLowerCase()
      const lider = personasPorBP.get(bp)?.jefeInmediato || r[iSupervisor] || ""
      return {
        raw: Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
        liderResuelto: lider,
        bp,
        evaluador: r[iEvaluador] ?? "",
        semanaNorm: normSemana(r[iSemana] ?? ""),
        fecha: r[iFecha] ?? "",
        nota: r[iNota] ?? "",
      }
    })
    .filter(f => {
      if (nombreNorm && normNombre(f.liderResuelto) !== nombreNorm) return false
      if (semanaNorm && f.semanaNorm !== semanaNorm) return false
      return true
    })

  return NextResponse.json({
    headers,
    indices: { supervisor: iSupervisor, bp: iBP, evaluador: iEvaluador, semana: iSemana, fecha: iFecha, nota: iNota },
    totalFilasHoja: rows.length - 1,
    totalFilasFiltradas: filas.length,
    filas,
  })
}
