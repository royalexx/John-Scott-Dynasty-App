import { NextResponse } from "next/server"
import { getManagerSession } from "@/lib/auth-session"

export async function GET() {
  const session = await getManagerSession()
  return NextResponse.json({ authenticated: Boolean(session), user: session })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set("dynasty_manager", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}
