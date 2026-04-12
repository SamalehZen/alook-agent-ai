"use client"
import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"

const isProd = process.env.NEXTJS_ENV === "production"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: isProd ? [emailOTPClient()] : [],
})

export const { signIn, signUp, signOut, useSession } = authClient
