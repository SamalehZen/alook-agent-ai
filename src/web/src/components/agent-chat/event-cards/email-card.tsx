import React from "react";

export function EmailCard({
  subject,
  address,
  direction,
  onClick,
}: {
  subject: string;
  address: string;
  direction: "inbound" | "outbound";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="card-grain w-104 max-w-full overflow-hidden rounded-(--radius) border border-(--border) bg-(--paper) text-left flex flex-col cursor-pointer transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 [box-shadow:var(--e1)] hover:[box-shadow:var(--e2)]"
    >
      <span className="h-2.5 relative block">
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <path
            d="M8,-1 L50,9 L92,-1"
            stroke="var(--te)"
            strokeWidth="2.5"
            opacity="0.4"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="p-3 flex flex-col">
        <span className="flex items-center gap-1 mb-1">
          <span className="text-[0.72rem] text-(--muted-foreground) flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
            {direction === "inbound" ? "from " : "to "}
            {address}
          </span>
          <span className="shrink-0 text-[0.5rem] font-bold uppercase tracking-wider text-(--te) px-1 py-0.5 rounded-[3px] border-[1.5px] border-(--te) opacity-45 -rotate-3">
            {direction === "inbound" ? "Inbound" : "Sent"}
          </span>
        </span>
        <span className="text-[0.95rem] font-semibold tracking-[-0.01em] leading-[1.35] line-clamp-2">
          {subject}
        </span>
      </span>
    </button>
  );
}
