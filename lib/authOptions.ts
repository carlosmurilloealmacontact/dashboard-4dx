import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly",
          access_type: "offline",
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Primera autenticación: Google envía tokens frescos
      if (account) {
        return {
          ...token,
          accessToken:  account.access_token,
          refreshToken: account.refresh_token,
          expiresAt:    account.expires_at, // segundos Unix
        }
      }

      // Token todavía válido (margen de 60 s para evitar carreras)
      const expiresAt = (token.expiresAt as number) ?? 0
      if (Date.now() < expiresAt * 1000 - 60_000) {
        return token
      }

      // Token expirado → renovar con refreshToken
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:     process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type:    "refresh_token",
            refresh_token: token.refreshToken as string,
          }),
        })
        const refreshed = await res.json()
        if (!res.ok) throw refreshed

        return {
          ...token,
          accessToken:  refreshed.access_token,
          // Google solo devuelve refresh_token nuevo si revocó el anterior
          refreshToken: refreshed.refresh_token ?? token.refreshToken,
          expiresAt:    Math.floor(Date.now() / 1000) + (refreshed.expires_in as number),
        }
      } catch (err) {
        console.error("[NextAuth] Error al renovar el access token:", err)
        // Marcar sesión como inválida → el cliente puede redirigir a login
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },

    async session({ session, token }) {
      session.accessToken  = token.accessToken  as string
      session.refreshToken = token.refreshToken as string
      // Propagar error de refresh al cliente si ocurrió
      if ((token as { error?: string }).error) {
        (session as { error?: string }).error = (token as { error?: string }).error
      }
      return session
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  pages: {
    signIn: "/login",
  },
}
