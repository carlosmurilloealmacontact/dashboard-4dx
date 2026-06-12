import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { construirCorreoInforme } from "@/lib/informe-email"
import type { ResultadoInforme } from "@/lib/informe-render"

export const dynamic = "force-dynamic"
export const revalidate = 0

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil || perfil.rol !== "admin") {
    return NextResponse.json({ error: "Solo disponible para administradores" }, { status: 403 })
  }

  let body: { destino?: string; resultado?: ResultadoInforme }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const destino = (body.destino ?? "").trim()
  if (!EMAIL_REGEX.test(destino)) {
    return NextResponse.json({ error: "Correo destino inválido" }, { status: 400 })
  }

  const resultado = body.resultado
  if (!resultado?.texto || !resultado?.datos || !resultado?.alcance) {
    return NextResponse.json({ error: "Falta el informe a enviar" }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    return NextResponse.json({ error: "El envío de correos no está configurado (faltan RESEND_API_KEY / RESEND_FROM_EMAIL)" }, { status: 500 })
  }

  const { asunto, html } = construirCorreoInforme(resultado)

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: destino,
      subject: asunto,
      html,
    })
    if (error) {
      return NextResponse.json({ error: error.message ?? "Error enviando el correo" }, { status: 500 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
