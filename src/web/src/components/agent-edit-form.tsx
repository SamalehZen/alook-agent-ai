"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RuntimeSelect } from "@/components/runtime-select";
import type { Agent } from "@alook/shared";
import type { Runtime } from "@/lib/api";

interface AgentEditFormProps {
  agent?: Agent;
  runtimes: Runtime[];
  defaultRuntimeId?: string;
  onSave: (data: {
    name: string;
    description: string;
    instructions: string;
    runtime_id: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  saving: boolean;
  submitLabel?: string;
  savingLabel?: string;
}

export function AgentEditForm({
  agent,
  runtimes,
  defaultRuntimeId = "",
  onSave,
  onCancel,
  saving,
  submitLabel = "Save",
  savingLabel = "Saving...",
}: AgentEditFormProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  const [runtimeId, setRuntimeId] = useState(
    agent?.runtime_id ?? defaultRuntimeId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      description,
      instructions,
      runtime_id: runtimeId,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Agent"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-description">Description</Label>
          <Input
            id="agent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-instructions">Instructions</Label>
          <Textarea
            id="agent-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="System prompt or instructions..."
            rows={6}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-runtime">Runtime</Label>
          <RuntimeSelect
            value={runtimeId}
            onValueChange={setRuntimeId}
            runtimes={runtimes}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={saving || !name}
          >
            {saving ? savingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
