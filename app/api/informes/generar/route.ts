import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { normSemana, construirDatosInforme } from "@/lib/informes"
import { construirPromptInforme } from "@/lib/informes-prompt"
import { generarTextoVertex } from "@/lib/vertex"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)
  if (!esCoord) return NextResponse.json({ error: "Solo disponible para coordinadores y jefaturas" }, { status: 403 })

  const semanasParam = req.nextUrl.searchParams.get("semanas")
  if (!semanasParam) return NextResponse.json({ error: "Falta el parámetro 'semanas'" }, { status: 400 })
  const semanas = [...new Set(semanasParam.split(",").map(normSemana).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b))
  if (semanas.length === 0) return NextResponse.json({ error: "No se reconoció ninguna semana válida" }, { status: 400 })

  const tipoInformeParam = req.nextUrl.searchParams.get("tipo")
  const tipoInforme = tipoInformeParam === "cierre" ? "cierre" : "parcial"

  const supervisorParam = req.nextUrl.searchParams.get("supervisor")
  const nombreCoord = perfil.persona.nombre ?? ""
  const supervisoresEquipo = perfil.supervisores.map(s => s.nombre ?? "").filter(Boolean)

  let soloSupervisor: string | undefined
  if (supervisorParam) {
    const match = supervisoresEquipo.find(s => s.toLowerCase().trim() === supervisorParam.toLowerCase().trim())
    if (!match) return NextResponse.json({ error: "Supervisor no encontrado en tu equipo" }, { status: 404 })
    soloSupervisor = match
  }

  try {
    const datos = await construirDatosInforme(session.accessToken, nombreCoord, supervisoresEquipo, semanas, soloSupervisor)

    if (datos.porSupervisor.length === 0) {
      return NextResponse.json({ error: "No hay datos para el alcance y semana(s) seleccionados" }, { status: 404 })
    }

    const prompt = construirPromptInforme(tipoInforme, datos)
    const texto = await generarTextoVertex(prompt)

    return NextResponse.json({
      alcance: datos.alcance,
      semanas: datos.semanas,
      tipoInforme,
      texto,
      datos,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
