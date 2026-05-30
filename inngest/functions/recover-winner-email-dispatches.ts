import { inngest } from "@/inngest/client";
import { dispatchWinnerEmailEvent } from "@/lib/email-dispatch-outbox";

const RECOVERY_BATCH_SIZE = 25;
const STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const recoverWinnerEmailDispatchesFunction = inngest.createFunction(
  { id: "recover-winner-email-dispatches", retries: 0 },
  { cron: "*/15 * * * *" },
  async () => {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    let dispatched = 0;

    for (let i = 0; i < RECOVERY_BATCH_SIZE; i++) {
      const claimed = await dispatchWinnerEmailEvent({
        staleBefore,
        maxAttempts: MAX_ATTEMPTS,
      });

      if (!claimed) break;
      dispatched++;
    }

    return { dispatched };
  }
);
