// Polls the "AI Academy Enrolments" SharePoint list for rows the Power
// Automate flow created (Status blank / "New") and provisions each learner.
//
// Started from index.ts when AI_ACADEMY_ENROL_POLL=true and Graph creds are
// present. In-process and best-effort; runEnrolmentPoll() claims each row
// (Status -> "Processing") before working it, so an overlapping tick or a
// second instance skips rows already in hand. A large volume would want a
// dedicated worker, but for a class-sized intake this is fine.

import { runEnrolmentPoll } from './provision.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startAiAcademyPoller(intervalMs = 120_000): void {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await runEnrolmentPoll();
      if (r && r.provisioned > 0) console.log(`[ai-academy:poll] provisioned ${r.provisioned}/${r.scanned}`);
    } catch (err) {
      console.error('[ai-academy:poll] tick failed', err);
    }
  };
  timer = setInterval(tick, intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  void tick();
  console.log(`[ai-academy:poll] started (every ${Math.round(intervalMs / 1000)}s)`);
}

export function stopAiAcademyPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
