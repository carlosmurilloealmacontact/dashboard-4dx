import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const BASES = [
  { id: "1veAlRJlVrJ2MRtoYNi3aJ_NX97sBFTgcww0V0jv6_Q0", rango: "A:AS", nombre: "AMX" },
  { id: "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM", rango: "Socio!A:AS", nombre: "LATAM-Socio" },
]

const NOMBRES_DEFECTO = [
  "LOMBARDO LIÑAN BETZABETH ALEJANDRA",
  "CORREA VARGAS MARGARITA MARIA",
  "URIBE BUILES YESICA ALEXANDRA",
  "VIRGUEZ SANCHEZ KAROL YINETH",
]

function normNombre(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 })
  }

  const nombresParam = req.nextUrl.searchParams.get("nombres")
  const nombres = nombresParam
    ? nombresParam.split(",").map(n => n.trim()).filter(Boolean)
    : NOMBRES_DEFECTO
  const nombresNorm = nombres.map(normNombre)

  const resultados = await Promise.all(BASES.map(async base => {
    try {
      const rows = await getSheetData(session.accessToken!, base.id, base.rango)
      if (rows.length < 2) return { base: base.nombre, error: "Hoja vacía o sin acceso" }

      const headers = rows[0]
      const idx = (n: string) => headers.findIndex(h => h?.toLowerCase() === n.toLowerCase())
      const iCedula = idx("cedula")
      const iNombre = idx("nombre_completo")
      const iCargo = idx("cargo")
      const iServicio = idx("servicio")
      const iJefe = idx("jefe_inmediato")
      const iCoord = idx("coordinador")
      const iEstado = idx("estado")
      const iEmail = idx("e_mail")
      const iEmailCorp = idx("usuario_gestor_4")

      const coincidencias = rows.slice(1)
        .map((r, i) => ({ r, fila: i + 2 }))
        .filter(({ r }) => nombresNorm.includes(normNombre(r[iNombre] ?? "")))
        .map(({ r, fila }) => ({
          fila,
          cedula: r[iCedula] ?? "",
          nombre: r[iNombre] ?? "",
          cargo: r[iCargo] ?? "",
          servicio: r[iServicio] ?? "",
          jefeInmediato: r[iJefe] ?? "",
          coordinador: r[iCoord] ?? "",
          estado: r[iEstado] ?? "",
          email: r[iEmail] ?? "",
          emailCorporativo: r[iEmailCorp] ?? "",
        }))

      return { base: base.nombre, totalFilas: rows.length - 1, coincidencias }
    } catch (error: unknown) {
      return { base: base.nombre, error: error instanceof Error ? error.message : String(error) }
    }
  }))

  return NextResponse.json({ nombres, resultados })
}
