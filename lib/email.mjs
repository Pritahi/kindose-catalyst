import { reminderPlan, uid } from "./domain.mjs";
export function emailMessage(circle, item) {
  return {
    subject: `KinDose: ${item.title}`,
    text: `Hello,\n\n${item.detail}\n\nPlease open your care circle to check in. If a dose was missed, follow the prescriber's instructions or ask a pharmacist. Never take an extra dose to compensate without medical advice.\n\nKinDose is a coordination prototype, not an emergency or clinical monitoring service.`,
  };
}
export async function processReminders(circle, now = new Date()) {
  if (circle.demo) return [];
  const allowed = (process.env.REMINDER_TO_ALLOWLIST || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  let plan = reminderPlan(circle, now);
  let results = [];
  for (let item of plan) {
    let previous = circle.mail.find(
      (m) => m.key === item.key && m.status === "sent",
    );
    if (previous) continue;
    let recipients = circle.members.filter(
      (m) =>
        m.active &&
        m.email &&
        allowed.includes(m.email.toLowerCase()) &&
        (m.role === "elder" || circle.consent.familyAlerts),
    );
    for (let member of recipients) {
      let key = `${item.key}:${member.id}`;
      if (circle.mail.some((m) => m.key === key && m.status === "sent"))
        continue;
      let message = emailMessage(circle, item);
      let status = "preview",
        error = "";
      if (process.env.RESEND_API_KEY && process.env.REMINDER_FROM) {
        try {
          let r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({
              from: process.env.REMINDER_FROM,
              to: member.email,
              subject: message.subject,
              text: message.text,
            }),
          });
          if (!r.ok) throw new Error(`Email provider returned ${r.status}`);
          status = "sent";
        } catch (e) {
          status = "failed";
          error = e.message;
        }
      }
      let record = {
        id: uid(),
        key,
        type: item.type,
        title: item.title,
        to: member.email,
        ...message,
        status,
        error,
        at: now.toISOString(),
      };
      circle.mail = circle.mail.filter(
        (m) => m.key !== key || m.status === "sent",
      );
      circle.mail.push(record);
      results.push(record);
    }
  }
  circle.mail = circle.mail.slice(-100);
  return results;
}
