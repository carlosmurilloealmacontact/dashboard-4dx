import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { construirPanelControl } from "@/lib/panelControl"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 })
  }

  const semanaParam = req.nextUrl.searchParams.get("semana")

  try {
    const data = await construirPanelControl(session.accessToken, perfil.equipo, semanaParam)
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
