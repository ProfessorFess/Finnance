import type { GoalChip } from "@/server/goals/projection";

/** How each projection chip reads. */
export const GOAL_CHIPS: Record<GoalChip, { text: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  done: { text: "Done", variant: "default" },
  ahead: { text: "Ahead", variant: "secondary" },
  on_track: { text: "On track", variant: "secondary" },
  behind: { text: "Behind", variant: "destructive" },
};
