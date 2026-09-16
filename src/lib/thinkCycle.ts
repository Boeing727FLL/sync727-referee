/**
 * Per-request think-cycle state. The `connecting` phase is claimed by the
 * first ThinkIndicator that mounts for a question — later mounts for the
 * same question skip it, so it is seen exactly once per answer.
 * resetThinkCycle() runs when a new question is sent.
 */
let connectingClaimed = false;

export function resetThinkCycle(): void {
  connectingClaimed = false;
}

/** First caller per request gets true (show connecting once), rest false. */
export function claimConnectingPhase(): boolean {
  if (connectingClaimed) return false;
  connectingClaimed = true;
  return true;
}
