import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID_PCA = "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw"
const HOJA_PCA = "Detalle Eventos"

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

  const rows = await getSheetData(session.accessToken, SHEET_ID_PCA, `${HOJA_PCA}!A:P`)
  if (rows.length < 2) return NextResponse.json({ headers: [], filas: [] })

  const headers = rows[0]
  const idxOf = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iNombre = idxOf("nombre")
  const iJefe = idxOf("jefe inmediato")
  const iSemana = idxOf("semana")

  const filas = rows.slice(1)
    .filter(r => {
      if (nombreNorm && normNombre(r[iNombre] ?? "") !== nombreNorm && normNombre(r[iJefe] ?? "") !== nombreNorm) return false
      if (semanaNorm && normSemana(r[iSemana] ?? "") !== semanaNorm) return false
      return true
    })
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])))

  return NextResponse.json({
    headers,
    indices: { nombre: iNombre, jefeInmediato: iJefe, semana: iSemana },
    totalFilasHoja: rows.length - 1,
    totalFilasFiltradas: filas.length,
    filas,
  })
}
