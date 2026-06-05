import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { obtenerToken } from "@/lib/db"
import Database from "better-sqlite3"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (session?.user?.email) {
    // Borrar el token de la BD
    try {
      const dbPath = path.join(process.cwd(), "tokens.db")
      const db = new Database(dbPath)
      const stmt = db.prepare("DELETE FROM oauth_tokens WHERE email = ?")
      stmt.run(session.user.email)
      db.close()
    } catch (error) {
      console.error("Error al borrar token:", error)
    }
  }

  // Redirigir a logout de NextAuth
  return NextResponse.redirect(
    new URL("/api/auth/signout?callbackUrl=/login", req.url)
  )
}
