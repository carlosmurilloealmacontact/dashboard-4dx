import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import Database from "better-sqlite3"
import path from "path"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (session?.user?.email) {
      // Borrar el token de la BD
      const dbPath = path.join(process.cwd(), "tokens.db")
      const db = new Database(dbPath)
      const stmt = db.prepare("DELETE FROM oauth_tokens WHERE email = ?")
      stmt.run(session.user.email)
      db.close()
    }

    // Devolver success y dejar que el cliente maneje el logout
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en logout:", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
