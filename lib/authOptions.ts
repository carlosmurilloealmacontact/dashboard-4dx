import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { guardarToken, obtenerToken, estaExpirado } from "@/lib/db"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/spreadsheets.readonly",
          access_type: "offline",
          // "select_account" = solo la primera vez pide autorización
          // "consent" = cada vez que inicia sesión
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Primera autenticación: Google envía tokens frescos
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at

        // Guardar en BD para persistencia indefinida
        guardarToken(
          token.email || "",
          account.refresh_token || "",
          account.access_token,
          account.expires_in
        )
      } else if (token.email) {
        // Siguientes logins: obtener tokens guardados de la BD
        const saved = obtenerToken(token.email)
        if (saved) {
          token.refreshToken = saved.refreshToken

          // Si el access token está expirado, lo marcaremos como null
          // (la sesión lo refrescará cuando sea necesario)
          if (saved.accessToken && !estaExpirado(saved.expiresAt)) {
            token.accessToken = saved.accessToken
            token.expiresAt = saved.expiresAt
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string
      return session
    },
  },
  session: {
    // Sin maxAge = sesión indefinida
    // El único cierre es logout manual o revocación en Google
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
}
