"use client"

export default function LogoutButton() {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-gray-600 hover:text-gray-900 underline"
    >
      Cerrar sesión
    </button>
  )
}
