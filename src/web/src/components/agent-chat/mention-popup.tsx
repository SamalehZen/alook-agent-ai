import React, { useRef, useEffect } from "react"
import type { Agent } from "@alook/shared"
import { cn } from "@/lib/utils"

interface MentionPopupProps {
  isOpen: boolean
  relatedAgents: Agent[]
  otherAgents: Agent[]
  selectedIndex: number
  onSelect: (agent: Agent) => void
  anchorPos: { top: number; left: number }
}

function AgentRow({
  agent,
  isSelected,
  onSelect,
}: {
  agent: Agent
  isSelected: boolean
  onSelect: (agent: Agent) => void
}) {
  return (
    <button
      type="button"
      data-mention-item
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect(agent)
      }}
    >
      <span className="truncate font-medium">{agent.name}</span>
      {agent.email_handle && (
        <span className="truncate text-xs text-muted-foreground">
          {agent.email_handle}@alook.ai
        </span>
      )}
    </button>
  )
}

export function MentionPopup({ isOpen, relatedAgents, otherAgents, selectedIndex, onSelect, anchorPos }: MentionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll("[data-mention-item]")
    const selected = items[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const totalCount = relatedAgents.length + otherAgents.length
  if (!isOpen || totalCount === 0) return null

  const showDivider = relatedAgents.length > 0 && otherAgents.length > 0

  return (
    <div
      className="absolute z-50 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-md transition-opacity duration-150"
      style={{
        top: anchorPos.top - 4,
        left: anchorPos.left,
        transform: "translateY(-100%)",
      }}
    >
      <div ref={listRef} className="max-h-50 overflow-y-auto py-1 thin-scrollbar">
        {relatedAgents.map((agent, i) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            isSelected={i === selectedIndex}
            onSelect={onSelect}
          />
        ))}
        {showDivider && (
          <div className="mx-3 my-1 border-t border-border" />
        )}
        {otherAgents.map((agent, i) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            isSelected={relatedAgents.length + i === selectedIndex}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
