// Polls for SCHEDULED campaigns whose `scheduleAt` has passed and fires them.
//
// In-process and best-effort — fine for a pilot on a single API instance. On
// multiple instances this would double-fire; move to a single WebJob / a DB
// advisory lock before scaling out. runCampaign() itself is idempotent per
// campaign (it bails once a campaign is RUNNING/DONE), which limits the blast
// radius of an overlap.

import { dueCampaigns, runCampaign } from './campaigns.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startCampaignScheduler(intervalMs = 60_000): void {
  if (timer) return;

  const tick = async () => {
    try {
      const due = await dueCampaigns();
      for (const c of due) {
        console.log(`[whatsapp:scheduler] firing campaign "${c.name}" (${c.id})`);
        await runCampaign(c.id);
      }
    } catch (err) {
      console.error('[whatsapp:scheduler] tick failed', err);
    }
  };

  timer = setInterval(tick, intervalMs);
  // Don't hold the event loop open for the sake of the poller.
  (timer as unknown as { unref?: () => void }).unref?.();
  void tick();
  console.log(`[whatsapp:scheduler] started (every ${Math.round(intervalMs / 1000)}s)`);
}

export function stopCampaignScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
