"use client";

import { useState } from "react";

import { MaterialsSectionWorkspace } from "@/components/folders/materials-library-workspace";
import { TheoryAssignmentWorkspace } from "@/components/theory/theory-assignment-workspace";
import { Button } from "@/components/ui/button";
type TheoryTab = "materials" | "assignments";

export function TheoryWorkspace() {
  const [tab, setTab] = useState<TheoryTab>("materials");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "materials" ? "default" : "outline"}
          onClick={() => setTab("materials")}
        >
          Материалы
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "assignments" ? "default" : "outline"}
          onClick={() => setTab("assignments")}
        >
          Назначение
        </Button>
      </div>
      {tab === "materials" ? (
        <MaterialsSectionWorkspace section="theory" />
      ) : (
        <TheoryAssignmentWorkspace />
      )}
    </div>
  );
}
