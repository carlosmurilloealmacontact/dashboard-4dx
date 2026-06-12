import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"
import { construirCorreoInforme } from "@/lib/informe-email"
import type { ResultadoInforme } from "@/lib/informe-render"

export const dynamic = "force-dynamic"
export const revalidate = 0

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function codificarAsunto(asunto: string): string {
  return `=?UTF-8?B?${Buffer.from(asunto, "utf-8").toString("base64")}?=`
}

function construirMensajeMime(from: string, to: string, asunto: string, html: string): string {
  const mensaje = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${codificarAsunto(asunto)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf-8").toString("base64"),
  ].join("\r\n")

  return Buffer.from(mensaje, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

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

  const { asunto, html } = construirCorreoInforme(resultado)
  const raw = construirMensajeMime(email, destino, asunto, html)

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })
    const gmail = google.gmail({ version: "v1", auth: oauth2Client })
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } })
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string }
    if (err?.code === 403) {
      return NextResponse.json({ error: `Falta permiso para enviar correos con tu cuenta de Google. Cierra sesión y vuelve a iniciar sesión para autorizarlo. (${err.message ?? "sin detalle"})` }, { status: 403 })
    }
    return NextResponse.json({ error: err?.message ?? String(e) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
