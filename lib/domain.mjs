import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
export const uid = () => randomBytes(12).toString("hex");
export const clean = (s, max = 160) =>
  String(s ?? "")
    .trim()
    .slice(0, max);
export function requireText(v, label, max = 160) {
  let x = clean(v, max);
  if (!x) throw new Error(`${label} is required`);
  return x;
}
export function hashPass(pass, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(pass, salt, 32).toString("hex")}`;
}
export function checkPass(pass, stored) {
  try {
    let [salt, hash] = stored.split(":");
    return timingSafeEqual(
      Buffer.from(hash, "hex"),
      scryptSync(pass, salt, 32),
    );
  } catch {
    return false;
  }
}
export function tokenFor(data, secret) {
  let body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function readToken(t, secret) {
  try {
    let [body, sig] = t.split(".");
    let expected = createHmac("sha256", secret)
      .update(body)
      .digest("base64url");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    let data = JSON.parse(Buffer.from(body, "base64url"));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export function dayInZone(date, zone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function timeInZone(date, zone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
export function timeline(circle, now = new Date(), day) {
  let date = day || dayInZone(now, circle.profile.timezone);
  let clock = timeInZone(now, circle.profile.timezone);
  let today = dayInZone(now, circle.profile.timezone);
  return circle.medications
    .filter((m) => m.active !== false && (!m.startDate || date >= m.startDate))
    .flatMap((m) =>
      m.times.map((time) => {
        let id = `${m.id}:${date}:${time}`;
        let log = circle.logs.find((l) => l.doseId === id);
        let passed = date < today || (date === today && time < clock);
        let min =
          +clock.slice(0, 2) * 60 +
          +clock.slice(3) -
          (+time.slice(0, 2) * 60 + +time.slice(3));
        return {
          id,
          medicationId: m.id,
          name: m.name,
          dose: m.dose,
          instructions: m.instructions,
          time,
          date,
          stock: m.stock,
          status:
            log?.status ||
            (passed && (date < today || min >= 30)
              ? "missed"
              : passed
                ? "due"
                : "upcoming"),
          log: log || null,
        };
      }),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}
export function adherence(circle, now = new Date(), days = 7) {
  let taken = 0,
    expected = 0;
  for (let i = 0; i < days; i++) {
    let d = new Date(now.getTime() - i * 864e5);
    if (
      dayInZone(d, circle.profile.timezone) <
      dayInZone(new Date(circle.createdAt), circle.profile.timezone)
    )
      continue;
    for (let t of timeline(
      circle,
      now,
      dayInZone(d, circle.profile.timezone),
    )) {
      if (
        t.date === dayInZone(now, circle.profile.timezone) &&
        t.status === "upcoming"
      )
        continue;
      expected++;
      if (t.status === "taken") taken++;
    }
  }
  return {
    taken,
    expected,
    percent: expected ? Math.round((taken / expected) * 100) : 0,
  };
}
export function reminderPlan(circle, now = new Date()) {
  let doses = timeline(circle, now),
    out = [];
  let clock = timeInZone(now, circle.profile.timezone),
    mins = (x) => +x.slice(0, 2) * 60 + +x.slice(3);
  for (let d of doses) {
    if (d.status === "taken" || d.status === "skipped") continue;
    let delta = mins(d.time) - mins(clock);
    if (d.status === "missed")
      out.push({
        key: `missed:${d.id}`,
        type: "missed",
        title: `A dose needs a check-in`,
        detail: `${d.name} ${d.dose}, scheduled ${d.time}. Ask ${circle.profile.name} how they are doing. Do not double a dose.`,
        scheduled: d.time,
      });
    else if (delta >= 0 && delta <= 30)
      out.push({
        key: `upcoming:${d.id}`,
        type: "upcoming",
        title: `Medication due soon`,
        detail: `${d.name} ${d.dose} is scheduled at ${d.time}. ${d.instructions}`,
        scheduled: d.time,
      });
  }
  for (let a of circle.appointments.filter((a) => !a.done)) {
    let delta = (new Date(a.datetime) - now) / 36e5;
    if (delta >= 0 && delta <= 24)
      out.push({
        key: `appointment:${a.id}:${a.datetime}`,
        type: "appointment",
        title: "An appointment is coming up",
        detail: `${a.title} with ${a.doctor} at ${new Date(a.datetime).toLocaleString("en-IN", { timeZone: circle.profile.timezone })}. ${a.location}`,
        scheduled: a.datetime,
      });
  }
  return out;
}
export function newCircle({
  name = "Margaret",
  timezone = "Asia/Kolkata",
  demo = false,
} = {}) {
  let circle = {
    id: uid(),
    createdAt: new Date().toISOString(),
    version: 0,
    demo,
    profile: {
      name,
      timezone,
      age: demo ? "72" : "",
      allergies: "No allergies recorded",
      emergencyContact: "Add a trusted contact",
      preferences: demo
        ? "I prefer a gentle reminder before anyone is notified."
        : "",
    },
    members: [],
    medications: [],
    logs: [],
    appointments: [],
    notes: [],
    audit: [],
    mail: [],
    consent: { familyAlerts: false, ai: false },
  };
  if (demo) {
    let today = dayInZone(new Date(), timezone);
    circle.medications = [
      {
        id: uid(),
        name: "Morning tablet",
        dose: "1 tablet",
        times: ["08:00"],
        instructions:
          "With breakfast. Example only: follow your own prescription.",
        stock: 8,
        active: true,
      },
      {
        id: uid(),
        name: "Vitamin supplement",
        dose: "1 capsule",
        times: ["13:00"],
        instructions: "After lunch, as prescribed.",
        stock: 24,
        active: true,
      },
      {
        id: uid(),
        name: "Evening tablet",
        dose: "1 tablet",
        times: ["20:00"],
        instructions: "With water. Example only.",
        stock: 5,
        active: true,
      },
    ];
    circle.logs = [
      {
        id: uid(),
        doseId: `${circle.medications[0].id}:${today}:08:00`,
        medicationId: circle.medications[0].id,
        date: today,
        status: "taken",
        at: new Date().toISOString(),
        by: "Margaret",
        note: "With breakfast",
      },
    ];
    circle.members = [
      { id: uid(), name: "Margaret", role: "elder", active: true },
      { id: uid(), name: "Anna", role: "family", active: true },
      { id: uid(), name: "James", role: "caretaker", active: true },
    ];
    circle.appointments = [
      {
        id: uid(),
        title: "Routine check-up",
        doctor: "Dr. Mehta",
        datetime: new Date(Date.now() + 20 * 36e5).toISOString(),
        location: "Community health clinic",
        notes: "Bring your medication list",
        questions: ["Ask about the evening routine."],
        done: false,
      },
    ];
    circle.notes = [
      {
        id: uid(),
        text: "A short walk after breakfast felt good today. I would like to keep that in my routine.",
        by: "Margaret",
        at: new Date().toISOString(),
        kind: "preference",
      },
    ];
    circle.audit = [
      {
        at: new Date().toISOString(),
        by: "Margaret",
        action: "Created a sample care circle",
      },
    ];
  }
  return circle;
}
export function validateMedication(m) {
  let times = Array.isArray(m.times) ? [...new Set(m.times)] : [];
  if (
    !times.length ||
    times.length > 6 ||
    times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
  )
    throw new Error("Choose 1 to 6 valid dose times");
  if (
    m.startDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(m.startDate) ||
      !Number.isFinite(+new Date(m.startDate)) ||
      new Date(m.startDate).toISOString().slice(0, 10) !== m.startDate)
  )
    throw new Error("Choose a valid schedule start date");
  return {
    ...(m.startDate ? { startDate: m.startDate } : {}),
    name: requireText(m.name, "Medication name", 80),
    dose: requireText(m.dose, "Prescribed dose", 80),
    instructions: clean(m.instructions, 300),
    times: times.sort(),
    stock: Math.max(0, Math.min(9999, parseInt(m.stock) || 0)),
    active: m.active !== false,
  };
}
