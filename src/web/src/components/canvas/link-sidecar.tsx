"use client";

import { useState, useEffect, useCallback } from "react";
import type { Agent, AgentLink } from "@alook/shared";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import { AvatarRenderer, parseAvatarUrl } from "@/components/avatar";

interface LinkSidecarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: AgentLink | null;
  agents: Agent[];
  onSave: (id: string, instruction: string) => void;
  onDelete: (id: string) => void;
}

export function LinkSidecar({
  open,
  onOpenChange,
  link,
  agents,
  onSave,
  onDelete,
}: LinkSidecarProps) {
  const [instruction, setInstruction] = useState("");

  const sourceAgent = agents.find(
    (a) => a.id === link?.source_agent_id,
  );
  const targetAgent = agents.find(
    (a) => a.id === link?.target_agent_id,
  );

  useEffect(() => {
    if (link) setInstruction(link.instruction);
  }, [link]);

  const isDirty = instruction !== (link?.instruction ?? "");

  const handleSave = useCallback(() => {
    if (link && isDirty) {
      onSave(link.id, instruction);
    }
  }, [link, isDirty, instruction, onSave]);

  const handleDelete = useCallback(() => {
    if (link) onDelete(link.id);
  }, [link, onDelete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  const renderAvatar = (agent: Agent | undefined) => {
    if (!agent) return null;
    const avatarConfig = parseAvatarUrl(agent.avatar_url);
    if (avatarConfig) {
      return <AvatarRenderer config={avatarConfig} size={32} className="shrink-0 rounded-xl" />;
    }
    return (
      <div className="flex items-center justify-center size-8 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium shrink-0">
        {agent.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="data-[side=right]:sm:inset-y-2 data-[side=right]:sm:right-2 data-[side=right]:sm:h-auto data-[side=right]:sm:rounded-xl data-[side=right]:sm:border data-[side=right]:sm:max-w-md"
        onKeyDownCapture={handleKeyDown}
      >
        <SheetTitle className="sr-only">
          Edit relationship between {sourceAgent?.name} and {targetAgent?.name}
        </SheetTitle>

        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {renderAvatar(sourceAgent)}
              <div className="-ml-2 ring-2 ring-background rounded-xl">
                {renderAvatar(targetAgent)}
              </div>
            </div>
          </div>
          <p className="text-sm font-medium">
            {sourceAgent?.name ?? "Agent"} and {targetAgent?.name ?? "Agent"}
          </p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Collaboration Instructions
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto thin-scrollbar px-5 py-4">
          <MarkdownEditor
            variant="seamless"
            placeholder="Describe how these agents should collaborate. This instruction is shared with both agents when they receive tasks."
            value={instruction}
            onChange={setInstruction}
            minHeight="12rem"
            agents={agents}
          />
        </div>

        <SheetFooter className="border-t bg-muted/50 px-5 py-3 flex-row items-center justify-between">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                />
              }
            >
              <Trash2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Remove connection</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty}
              className={!isDirty ? "opacity-50 pointer-events-none" : ""}
            >
              Save
              <span className="text-[10px] opacity-50 ml-1">⇧ ⏎</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
