import { ids, load, save } from "../lib/store.mjs";
import { processReminders } from "../lib/email.mjs";
export default async function handler(req, res) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    res.statusCode = 401;
    return res.json({ error: "Unauthorized" });
  }
  let checked = 0,
    queued = 0;
  for (let id of await ids()) {
    let c = await load(id);
    if (!c || c.demo) continue;
    let r = await processReminders(c);
    await save(c);
    checked++;
    queued += r.length;
  }
  return res.json({
    checked,
    queued,
    emailEnabled: !!process.env.RESEND_API_KEY,
  });
}
