"use client";

import { useState } from "react";
import UserPanel from "./UserPanel";
import DoctorPanel from "./DoctorPanel";

type View = "patient" | "doctor";

const COPY: Record<View, string> = {
  patient:
    "The patient's own view of the same consent contract: their profile, every requester who has asked " +
    "for a record, whether that requester is flagged, and a one-click approve, deny, or revoke for each.",
  doctor:
    "The hospital's own view of the same consent contract: which patients it already has an active grant " +
    "for, a Gemini-generated summary of each one's condition on request, and a real request_access " +
    "transaction for anyone it doesn't have consent for yet.",
};

export default function DashboardView() {
  const [view, setView] = useState<View>("patient");

  return (
    <div>
      <div className="mb-4 inline-flex rounded-md border border-neutral-800 bg-neutral-950 p-1">
        {(["patient", "doctor"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition ${
              view === v ? "bg-amber-600 text-neutral-950" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {v} view
          </button>
        ))}
      </div>
      <p className="mb-4 max-w-3xl text-sm text-neutral-400">{COPY[view]}</p>
      {view === "patient" ? <UserPanel /> : <DoctorPanel />}
    </div>
  );
}
