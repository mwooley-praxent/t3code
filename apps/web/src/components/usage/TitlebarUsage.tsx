import { useAtomValue } from "@effect/atom-react";
import type { ServerProviderUsageWindow, TimestampFormat } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  collectLimitAccounts,
  formatResetsIn,
  formatResetsInRough,
  paceRemainingPercent,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { KeyRoundIcon } from "lucide-react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { usePrimarySettings } from "../../hooks/useSettings";
import { observeResize } from "../../lib/observeResize";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { environmentPresentations } from "../../state/presentation";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { primaryServerSettingsAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const CLAUDE_DRIVER = "claudeAgent";

// The less quota remains, the louder the number.
function remainingTone(left: number): string {
  if (left <= 5) return "text-red-500 [text-shadow:0_0_8px_currentColor]";
  if (left <= 15) return "text-red-500";
  if (left <= 25) return "text-orange-500";
  if (left <= 45) return "text-yellow-500";
  return "";
}

const RING_RADIUS = 7;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The arc is quota left; the tick is time left, so a fill ending short of the tick means burning ahead of the clock. */
function Stat({
  label,
  window,
  now,
}: {
  readonly label: string;
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const left = remainingPercent(window);
  const timeLeft = paceRemainingPercent(window, now);
  const resets = formatResetsInRough(window, now);
  return (
    <span
      role="img"
      aria-label={`${label}: ${left}% left${resets ? `, resets in ${resets}` : ""}`}
      className={cn("flex items-center gap-1", remainingTone(left))}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
        <circle
          cx="9"
          cy="9"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth="2.5"
        />
        <circle
          cx="9"
          cy="9"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(left / 100) * RING_LENGTH} ${RING_LENGTH}`}
          transform="rotate(-90 9 9)"
        />
        {timeLeft === null ? null : (
          <line
            x1="9"
            y1="0.5"
            x2="9"
            y2="4.5"
            stroke="var(--foreground)"
            strokeWidth="1.5"
            transform={`rotate(${(timeLeft / 100) * 360} 9 9)`}
          />
        )}
      </svg>
      {left}%{resets ? <span className="opacity-65">{resets}</span> : null}
    </span>
  );
}

function windowSummary(
  label: string,
  window: ServerProviderUsageWindow,
  now: number,
  timestampFormat: TimestampFormat,
): string {
  const resetsIn = formatResetsIn(window, now);
  const at = window.resetsAt ? formatUpcomingTimestamp(window.resetsAt, timestampFormat, now) : "";
  return `${label}: ${remainingPercent(window)}% left${resetsIn ? `, ${resetsIn}` : ""}${at ? ` (${at})` : ""}.`;
}

/** Valet mode: runs every Claude turn as Sonnet 5.5 high until switched off. */
function ValetToggle() {
  const environmentId = usePrimaryEnvironmentId();
  const valetMode = useAtomValue(primaryServerSettingsAtom).valetMode;
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings);
  if (environmentId === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="switch"
            aria-checked={valetMode}
            aria-label="Valet mode"
            onClick={() =>
              void updateSettings({ environmentId, input: { patch: { valetMode: !valetMode } } })
            }
            className={cn(
              "pointer-events-auto flex items-center rounded-md px-1.5 py-0.5 text-xs hover:text-foreground",
              valetMode ? "text-warning" : "text-muted-foreground",
            )}
          />
        }
      >
        <KeyRoundIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {valetMode
          ? "Valet is on: every Claude turn runs as Sonnet 5.5 at high effort, even in threads set to Opus. Click to turn off."
          : "Valet is off. Turn it on to run every Claude turn as Sonnet 5.5 at high effort and keep Opus from spending your quota."}
      </TooltipPopup>
    </Tooltip>
  );
}

/** Pinned Claude subscription stats: quota left and time to reset for the session and weekly windows. */
export function TitlebarUsage() {
  const navigate = useNavigate();
  const now = Date.parse(`${useNowMinute()}Z`);
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const windows = collectLimitAccounts(presentations).find(
    (account) => account.driver === CLAUDE_DRIVER,
  )?.limits.windows;
  const session = windows?.find((window) => window.kind === "session");
  const weekly = windows?.find((window) => window.kind === "weekly");
  const visible = Boolean(session || weekly);

  // Publishes the pinned width so the thread title stops short of it; the title sits outside this subtree.
  const publishInset = (element: HTMLDivElement | null) => {
    if (!element) return;
    const root = document.documentElement;
    const stopObserving = observeResize(element, () =>
      root.style.setProperty("--titlebar-usage-inset", `${element.offsetWidth + 8}px`),
    );
    return () => {
      stopObserving();
      root.style.removeProperty("--titlebar-usage-inset");
    };
  };

  if (!visible) return null;

  return (
    <div ref={publishInset} className="flex items-center">
      <ValetToggle />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => void navigate({ to: "/usage" })}
              aria-label="Claude usage"
              className="pointer-events-auto flex items-center gap-2 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums hover:text-foreground"
            />
          }
        >
          {session ? <Stat label="Session" window={session} now={now} /> : null}
          {weekly ? <Stat label="Week" window={weekly} now={now} /> : null}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          <div className="flex flex-col gap-0.5">
            {session ? (
              <span>{windowSummary("Session", session, now, timestampFormat)}</span>
            ) : null}
            {weekly ? <span>{windowSummary("Week", weekly, now, timestampFormat)}</span> : null}
            <span className="text-muted-foreground">
              The tick marks how much of the window is left. If the ring ends short of it, you are
              spending faster than time passes. Click for details.
            </span>
          </div>
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
