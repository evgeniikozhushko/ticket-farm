"use client";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IconClock,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";

const previewWinners = [
  "Maya Chen",
  "Jordan Brooks",
  "Sam Patel",
  "Avery Singh",
  "Noah Kim",
  "Emma Rodriguez",
  "Liam Wilson",
  "Sophia Lee",
  "Ethan Park",
  "Olivia Martin",
  "Lucas Nguyen",
  "Isabella Garcia",
  "Henry Adams",
  "Amelia Brown",
  "Benjamin Clark",
  "Charlotte Davis",
  "Daniel Evans",
  "Harper Flores",
  "Jack Green",
  "Mia Hall",
  "Leo Johnson",
  "Evelyn King",
  "Owen Lewis",
  "Camila Moore",
  "William Nelson",
  "Grace Ortiz",
  "Alexander Price",
  "Chloe Reed",
  "Matthew Scott",
  "Zoe Turner",
] as const;

export function LotteryDrawPreview() {
  const [winnerCount, setWinnerCount] = useState(10);

  return (
    <div className="h-auto rounded-xl border bg-card p-4 shadow-sm xl:h-full">
      <div className="flex h-auto flex-col gap-4 xl:h-full xl:overflow-y-auto xl:pr-1">
        <div className="shrink-0 space-y-4">
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Lottery Draw</h3>
              <p className="text-sm text-muted-foreground">
                Select winners from today&apos;s registrations
              </p>
            </div>

            <Badge
              variant="outline"
              className="border-green-500 text-green-700 dark:text-green-400"
            >
              <IconClock className="mr-1 size-3" />
              Open
            </Badge>
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconUsers className="size-4" />
                Registrants
              </div>
              <p className="mt-1 text-xl font-semibold">128</p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconTrophy className="size-4" />
                Winners
              </div>
              <p className="mt-1 text-xl font-semibold">10</p>
            </div>
          </div>

          {/* input */}
          <div className="space-y-2">
            <Label htmlFor="preview-winner-count">Number of Winners</Label>
            <Input
              id="preview-winner-count"
              type="number"
              min="1"
              max="128"
              value={winnerCount}
              onChange={(event) => setWinnerCount(Number(event.target.value))}
              className="h-10"
            />
          </div>
        </div>

        <div className="max-h-64 shrink-0 overflow-y-auto rounded-lg border p-3 xl:max-h-none xl:min-h-0 xl:flex-1">
          <div className="space-y-2">
            {previewWinners.map((name, index) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium">
                  {index + 1}. {name}
                </span>
                <Badge variant="secondary">
                  #{String(index + 24).padStart(3, "0")}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <Button type="button" className="shrink-0 w-full">
          <IconTrophy className="mr-2 size-4" />
          Run Lottery Draw
        </Button>
      </div>
    </div>
  );
}
