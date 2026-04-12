"use client"
import { useEffect, useRef, useCallback } from "react"
import type { WsMessage } from "@alook/shared"

const isDev = process.env.NODE_ENV === "development"
const WS_DO_PORT = Number(process.env.NEXT_PUBLIC_WS_DO_PORT) || 8789
const WS_RECONNECT_INIT = Number(process.env.NEXT_PUBLIC_WS_RECONNECT_DELAY_MS) || 1000
const WS_RECONNECT_MAX = Number(process.env.NEXT_PUBLIC_WS_RECONNECT_MAX_DELAY_MS) || 30_000

export function useUserWs(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(WS_RECONNECT_INIT)

  const connect = useCallback(async () => {
    let url: string
    let authToken: string | null = null

    if (isDev) {
      // Dev: connect directly to ws-do worker, authenticate via auth message
      try {
        const res = await fetch("/api/ws/token")
        if (!res.ok) return
        const { userId, token } = await res.json() as { userId: string; token: string }
        url = `ws://localhost:${WS_DO_PORT}/?userId=${userId}`
        authToken = token
      } catch {
        return
      }
    } else {
      // Production: go through Next.js API route (service binding handles WS upgrade)
      url = `${location.origin.replace("http", "ws")}/api/ws/user`
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      reconnectDelay.current = WS_RECONNECT_INIT
      if (authToken) {
        ws.send(JSON.stringify({ type: "auth", token: authToken }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === "auth.ok") return
        onMessage(msg as WsMessage)
      } catch {}
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      const delay = Math.min(reconnectDelay.current, WS_RECONNECT_MAX)
      reconnectDelay.current = Math.min(delay * 2, WS_RECONNECT_MAX)
      setTimeout(connect, delay + Math.random() * 500)
    }
  }, [onMessage])

  useEffect(() => {
    connect()
    return () => { wsRef.current?.close() }
  }, [connect])
}
