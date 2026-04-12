"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { AgentEditForm } from "@/components/agent-edit-form";

export default function CreateAgentPage() {
  const router = useRouter();
  const { slug } = useWorkspace();
  const {
    runtimes,
    handleCreateAgent,
    getFirstOnlineRuntimeId,
  } = useAgentContext();

  const [saving, setSaving] = useState(false);

  return (
    <>
      <div className="flex items-center border-b border-border/50 px-5 py-2.5">
        <h1 className="text-sm font-medium">Create Agent</h1>
      </div>

      <AgentEditForm
        runtimes={runtimes}
        defaultRuntimeId={getFirstOnlineRuntimeId()}
        saving={saving}
        submitLabel="Create"
        savingLabel="Creating..."
        onCancel={() => router.back()}
        onSave={async (data) => {
          setSaving(true);
          try {
            const agent = await handleCreateAgent({
              name: data.name,
              description: data.description || undefined,
              instructions: data.instructions || undefined,
              runtime_id: data.runtime_id,
              email_handle: data.email_handle || undefined,
            });
            if (agent) {
              router.push(`/w/${slug}/agents/${agent.id}/chat`);
            }
            return !!agent;
          } finally {
            setSaving(false);
          }
        }}
      />
    </>
  );
}
