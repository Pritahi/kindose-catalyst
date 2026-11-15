(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    content = $("#content"),
    toastEl = $("#toast");
  let state = null,
    busy = false,
    view = "today",
    lastFocus = null,
    large = localStorage.getItem("kindose-large") === "1";
  document.body.classList.toggle("reading", large);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const prettyRole = (r) =>
    ({ elder: "Elder", family: "Family", caretaker: "Care partner" })[r] ||
    r ||
    "Member";
  const dateFmt = (s, tz) => {
    if (!s) return "Not scheduled";
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz || undefined,
      }).format(new Date(s));
    } catch {
      return s;
    }
  };
  const todayStr = () =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: state?.profile?.timezone || undefined,
    }).format(new Date());
  const greet = () => {
    let h = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: state?.profile?.timezone || undefined,
      }).format(new Date()),
    );
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };
  const toast = (s) => {
    toastEl.textContent = s;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (toastEl.textContent = ""), 5000);
  };
  async function api(action, fields = {}, auth = false) {
    if (busy) return null;
    busy = true;
    document.querySelectorAll("button").forEach((b) => {
      if (!b.closest("dialog")) b.disabled = true;
    });
    try {
      let res = action
        ? await fetch("/api/care", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              ...fields,
              ...(auth ? {} : { version: state?.version }),
            }),
          })
        : await fetch("/api/care", { credentials: "include" });
      let data = await res.json().catch(() => ({
        error: "The server returned an unreadable response.",
      }));
      if (res.status === 409) {
        busy = false;
        try {
          const fresh = await fetch("/api/care", { credentials: "include" });
          if (fresh.ok) {
            let f = await fresh.json();
            state = f.circle || f;
            render();
          } else if (fresh.status === 401) {
            state = null;
            renderLanding();
          }
        } catch {}
        toast(
          "This circle changed elsewhere. Your change was not saved; review the latest information and try again.",
        );
        return null;
      }
      if (res.status === 401) {
        state = null;
        renderLanding();
        toast("Your session has ended. Please sign in again.");
        return null;
      }
      if (!res.ok) {
        toast(
          data.error || "Could not complete that request. Please try again.",
        );
        return null;
      }
      if (data.circle) data = data.circle;
      if (data && data.me && data.version !== undefined) {
        state = data;
        if (auth) view = "today";
        render();
      } else if (action === "logout" || action === "deleteCircle") {
        state = null;
        renderLanding();
      } else if (!action && res.status === 401) {
        state = null;
        renderLanding();
      } else if (data?.deleted) {
        state = null;
        renderLanding();
      }
      return data;
    } catch (e) {
      toast("Could not reach KinDose. Check your connection and try again.");
      return null;
    } finally {
      busy = false;
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }
  async function refresh(notify = true) {
    let d = await api(null);
    if (!d && notify) toast("Could not refresh your care space.");
  }
  function header() {
    return `<div class="topline"><span class="eyebrow">YOUR SHARED CARE SPACE ${state.demo ? '<span class="badge warn">Sample circle - fictional data</span>' : ""}</span><div class="top-actions"><span>${esc(todayStr())}</span><button class="icon-btn" id="refreshBtn" aria-label="Refresh care space">↻</button><button class="icon-btn read-label" id="largeBtn" aria-label="Toggle senior reading mode">Aa</button><button class="quiet" id="logoutBtn">Log out</button><span class="avatar" aria-label="${esc(state.me.name)}">${esc((state.me.name || "?").slice(0, 1))}</span></div></div>`;
  }
  function outer(inner) {
    return `<div class="content-wrap">${header()}${inner}</div>`;
  }
  function nav() {
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#mobileNav").innerHTML = [
      "today",
      "medications",
      "appointments",
      "circle",
      "notes",
      "reminders",
    ]
      .map(
        (v, i) =>
          `<button data-view="${v}" class="${view === v ? "active" : ""}"><span>${["◷", "＋", "▦", "♧", "▤", "◉"][i]}</span>${["Today", "Meds", "Visits", "Circle", "Notes", "Reminders"][i]}</button>`,
      )
      .join("");
    document.querySelectorAll("[data-view]").forEach(
      (b) =>
        (b.onclick = () => {
          view = b.dataset.view;
          render();
        }),
    );
    $("#refreshBtn")?.addEventListener("click", () => refresh());
    $("#largeBtn")?.addEventListener("click", toggleLarge);
    $("#logoutBtn")?.addEventListener("click", () => api("logout", {}, true));
  }
  function toggleLarge() {
    large = !large;
    localStorage.setItem("kindose-large", large ? "1" : "0");
    document.body.classList.toggle("reading", large);
  }
  $("#largeMobile").onclick = toggleLarge;
  const meds = () => state.medications || [],
    todays = () => state.today || [],
    isElder = () => state.me?.role === "elder";
  function medStock(m) {
    return Number(m.stock) <= 7
      ? `<span class="badge warn">${esc(m.stock)} remaining doses · Check refill with your pharmacist</span>`
      : `<span class="badge">${esc(m.stock)} remaining doses</span>`;
  }
  function nextAppt() {
    return [...(state.appointments || [])]
      .filter((a) => !a.done && new Date(a.datetime) >= new Date())
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))[0];
  }
  function renderToday() {
    let rows = todays(),
      taken = rows.filter((x) => x.status === "taken").length,
      missed = rows.filter((x) => x.status === "missed").length,
      a = nextAppt();
    let parts = { Morning: [], Afternoon: [], Evening: [] };
    rows.forEach((d) => {
      let h = +(d.time || "12").split(":")[0];
      parts[h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"].push(d);
    });
    let timeline =
      Object.entries(parts)
        .map(([part, items]) =>
          items.length
            ? `<div class="daypart">${part}</div>${items.map((d) => `<article class="dose"><time class="dose-time">${esc(d.time)}</time><div><div class="dose-title">${esc(d.name)} · ${esc(d.dose)}</div><div class="dose-detail">${esc(d.instructions || "As prescribed")}</div><div class="dose-actions">${["due", "upcoming", "missed"].includes(d.status) ? `<button class="btn small" data-dose="${esc(d.id)}" data-status="taken">Mark as taken</button><button class="btn small secondary" data-skip="${esc(d.id)}">Skip / add a note</button>` : `<button class="quiet" data-dose="${esc(d.id)}" data-status="undo">Undo ${esc(d.status)}</button>`}</div></div><span class="badge ${d.status === "taken" ? "good" : d.status === "missed" ? "warn" : ""}">${esc(d.status)}</span></article>`).join("")}`
            : "",
        )
        .join("") ||
      `<div class="empty">No doses are scheduled for today. Your circle can add a medication schedule whenever you're ready.</div>`;
    return outer(
      `<section class="hero"><span class="eyebrow">${esc(todayStr()).toUpperCase()}</span><h1>A gentler rhythm for today.</h1><p>${esc(greet())}, ${esc(state.profile?.name || state.me.name)}. One small check-in at a time. Your care circle is here with you.</p></section><div class="grid stats"><div class="card"><div><div class="stat-label">Today's doses</div><div class="stat-note">taken so far</div></div><div class="stat-value">${taken}<span class="stat-note"> / ${rows.length}</span></div></div><div class="card"><div><div class="stat-label">Needs a check-in</div><div class="stat-note">doses marked missed</div></div><div class="stat-value">${missed}</div></div><div class="card"><div><div class="stat-label">Adherence</div><div class="stat-note">current schedule, last 7 days</div></div><div class="stat-value">${state.adherence && Number(state.adherence.expected) > 0 ? `${esc(state.adherence.percent)}%` : "No data"}<span class="stat-note">${state.adherence?.expected ? "" : "No data yet"}</span></div><div class="stat-note">Next appointment: ${a ? esc(dateFmt(a.datetime, state.profile?.timezone)) : "Nothing scheduled"}</div></div></div><div class="grid cols2"><section class="card"><div class="section-head"><h2>Today's rhythm</h2><span class="muted">${esc(state.profile?.timezone || "UTC")}</span></div><div class="timeline">${timeline}</div><p class="notice">If you miss a dose, follow your prescriber's advice. Do not double a dose.</p></section><div class="side-stack"><section class="card"><h3>A little note to remember</h3><p>${esc(state.profile?.preferences || "Your preferences will appear here when your care circle adds them.")}</p></section><section class="card"><h3>Coming up</h3>${a ? `<strong>${esc(a.title)}</strong><p class="muted">${esc(dateFmt(a.datetime, state.profile?.timezone))}<br>${esc(a.location || "Location to be confirmed")}</p>` : `<p class="muted">No upcoming appointment yet.</p>`}</section><section class="card"><h3>Your care circle</h3>${
        (state.members || [])
          .filter((m) => m.active)
          .map(
            (m) =>
              `<div class="member-row"><span class="avatar">${esc((m.name || "?")[0])}</span><div class="member-info"><strong>${esc(m.name)}</strong><div class="pill">${esc(prettyRole(m.role))}</div></div></div>`,
          )
          .join("") || '<p class="muted">Your circle is ready to grow.</p>'
      }</section><section class="card"><h3>Low-stock check</h3>${
        meds().filter((m) => m.active !== false && Number(m.stock) <= 7).length
          ? meds()
              .filter((m) => m.active !== false && Number(m.stock) <= 7)
              .map(
                (m) =>
                  `<p><strong>${esc(m.name)}</strong><br>${medStock(m)}</p>`,
              )
              .join("")
          : '<p class="muted">No low-stock medications right now.</p>'
      }</section><section class="card"><h3>Care handoff</h3><p class="muted">A simple summary for your next check-in.</p><button class="btn secondary" id="summaryBtn">Generate handoff</button><div id="summaryResult"></div></section></div></div>`,
    );
  }
  function renderMeds() {
    return outer(
      `<div class="section-head"><div><h1 class="headline">Medications</h1><p class="subhead">A clear list of what's scheduled. Doses are recorded as prescribed.</p></div><button class="btn" id="addMed">＋ Add medication</button></div><div class="grid cols2"><section class="card">${
        meds()
          .filter((m) => m.active !== false)
          .map(
            (m) =>
              `<div class="list-row"><div class="tableline"><strong>${esc(m.name)}</strong><button class="quiet" data-edit-med="${esc(m.id)}">Edit</button></div><p class="muted">${esc(m.dose)} · ${esc((m.times || []).join(", "))}<br>${esc(m.instructions || "No additional instructions")}</p>${medStock(m)}<div class="actions" style="margin-top:10px"><button class="quiet" data-archive="${esc(m.id)}">Archive</button></div></div>`,
          )
          .join("") ||
        `<div class="empty">No medications yet. Add a medication exactly as prescribed to create its schedule.</div>`
      }</section><aside class="card"><h2>Keep it simple</h2><p>Medication details are entered by your care circle. KinDose does not calculate or recommend dosages.</p><p class="notice">Stock is tracked as remaining doses, not individual pills.</p></aside></div>`,
    );
  }
  function renderAppointments() {
    let ap = state.appointments || [];
    return outer(
      `<div class="section-head"><div><h1 class="headline">Appointments</h1><p class="subhead">Keep details and questions together for the next visit.</p></div><button id="addAppt" class="btn">＋ Add appointment</button></div><div class="grid cols2"><section class="card">${ap.map((a) => `<article class="list-row"><div class="tableline"><strong>${esc(a.title)}</strong><span class="badge">${a.done ? "Complete" : new Date(a.datetime) < new Date() ? "Past" : "Upcoming"}</span></div><p class="muted">${esc(a.doctor || "")} · ${esc(dateFmt(a.datetime, state.profile?.timezone))}<br>${esc(a.location || "")}</p>${a.notes ? `<p>${esc(a.notes)}</p>` : ""}<details><summary>Preparation and questions</summary><p>${esc(a.questions?.join("\n") || "No questions added yet.")}</p></details><div class="actions"><button class="quiet" data-toggle-done="${esc(a.id)}">${a.done ? "Mark incomplete" : "Mark complete"}</button><button class="quiet" data-edit-appt="${esc(a.id)}">Edit</button><button class="quiet" data-delete-appt="${esc(a.id)}">Delete</button></div></article>`).join("") || '<div class="empty">No appointments yet. Add one to keep the details and questions in one place.</div>'}</section><aside class="card"><h2>Appointment prep</h2><p>Questions are yours to choose. Bring what feels useful to your appointment.</p></aside></div>`,
    );
  }
  function renderCircle() {
    let p = state.profile || {},
      members = state.members || [],
      demo = state.demo;
    return outer(
      `<h1 class="headline">Care circle</h1><p class="subhead">The people and preferences that make this care space yours.</p>${
        demo
          ? `<section class="card"><h3>Explore as someone else</h3><p class="muted">Demo role switching is only available in the fictional sample circle.</p><div class="switches">${[
              ["elder", "Margaret"],
              ["family", "Anna"],
              ["caretaker", "James"],
            ]
              .map(
                ([r, n]) =>
                  `<button class="btn secondary small" data-switch="${r}">View as ${n}</button>`,
              )
              .join("")}</div></section>`
          : ""
      }<div class="grid cols2" style="margin-top:18px"><section class="card"><h2>${esc(p.name || "Circle profile")}</h2><p><strong>Age</strong> · ${esc(p.age || "Not provided")}</p><p><strong>Timezone</strong> · ${esc(p.timezone || "UTC")}</p><p><strong>Allergy information</strong><br>${esc(p.allergies || "None recorded")}</p><p><strong>Emergency contact</strong><br>${esc(p.emergencyContact || "Not provided")}</p><p><strong>Preferences</strong><br>${esc(p.preferences || "No preferences recorded")}</p>${isElder() ? '<button class="btn secondary" id="editProfile">Edit profile</button>' : ""}<p class="notice">Fictional prototype data only. No real health data.</p></section><section class="card"><h2>People in this circle</h2>${members.map((m) => `<div class="member-row"><span class="avatar">${esc((m.name || "?")[0])}</span><div class="member-info"><strong>${esc(m.name)}</strong><div class="pill">${esc(prettyRole(m.role))} · ${m.active ? "Active" : "Inactive"}${m.email ? " · " + esc(m.email) : ""}</div></div>${isElder() && !demo && m.id !== state.me.id ? `<button class="quiet" data-revoke="${esc(m.id)}">Revoke</button>` : ""}</div>`).join("")}${!demo ? `<hr class="separator"><strong>Circle ID</strong><div class="codebox">${esc(state.id)}</div><p class="muted">Share this ID and the person's passphrase privately. Each invite should use a different passphrase.</p>${isElder() ? '<button id="inviteBtn" class="btn secondary">Invite a person</button>' : ""}` : ""}</section><section class="card"><h2>Privacy choices</h2><p>Choose what works for your circle.</p>${isElder() ? `<label class="checkline"><input type="checkbox" id="alerts" ${state.consent?.familyAlerts ? "checked" : ""}> Family email alerts</label><label class="checkline"><input type="checkbox" id="aiConsent" ${state.consent?.ai ? "checked" : ""}> Allow AI-assisted handoff</label><p class="notice">When enabled and configured, care facts, preferences and recent notes are sent to Groq for a handoff summary. Not medical advice. AI is optional.</p>` : `<p class="muted">Only the elder can change these choices.</p>`}</section>${isElder() && !demo ? `<section class="card"><h2>Close this circle</h2><p>Deleting removes this circle and its associated information. This cannot be undone.</p><button id="deleteCircle" class="btn danger">Delete circle</button></section>` : ""}</div>`,
    );
  }
  function renderNotes() {
    return outer(
      `<h1 class="headline">Care notes</h1><p class="subhead">Preferences and useful notes, shared with your circle.</p><div class="grid cols2"><section class="card"><h2>Preferences</h2><p>${esc(state.profile?.preferences || "No preference has been added yet.")}</p>${isElder() ? '<button class="btn secondary" id="editProfile">Edit preferences</button>' : ""}<hr class="separator"><h2>Add a note</h2><form id="noteForm"><label class="field"><span>Note</span><textarea name="text" required maxlength="800"></textarea></label><label class="field"><span>Kind</span><select name="kind"><option value="note">Care note</option>${isElder() ? '<option value="preference">My preference</option>' : ""}</select></label><button class="btn">Save note</button></form></section><section class="card"><h2>Circle timeline</h2>${(state.notes || []).length ? (state.notes || []).map((n) => `<div class="note-item"><p>${esc(n.text)}</p><div class="note-meta">${esc(n.kind)} · ${esc(n.by)} · ${esc(dateFmt(n.at, state.profile?.timezone))}</div></div>`).join("") : '<div class="empty">Notes your circle adds will appear here.</div>'}<details><summary>Activity history</summary>${
        (state.audit || [])
          .slice()
          .reverse()
          .map(
            (a) =>
              `<p class="note-meta">${esc(dateFmt(a.at, state.profile?.timezone))} · ${esc(a.by)} · ${esc(a.action)}</p>`,
          )
          .join("") || "<p>No activity recorded.</p>"
      }</details></section></div>`,
    );
  }
  function renderReminders() {
    return outer(
      `<h1 class="headline">Reminders</h1><p class="subhead">A view of planned reminders and their delivery status.</p><div class="grid cols2"><section class="card"><h2>Email delivery</h2><p><strong>${state.emailEnabled ? "Sender configured" : "Preview mode - email sender not configured"}</strong></p><p>Real emails are sent only when a sender is configured. In preview mode, these are examples only; no email has been sent.</p><p class="notice">Reminders are optional, not emergency monitoring.</p><button class="btn secondary" id="checkReminders">Check reminders</button><hr class="separator"><h2>Reminder plans</h2>${(state.reminders || []).map((r) => `<div class="list-row"><strong>${esc(r.title)}</strong><p class="muted">${esc(r.detail || "")} · ${esc(r.subject || "")}</p><details><summary>Plain text email preview</summary><pre style="white-space:pre-wrap">${esc(r.text || "")}</pre></details></div>`).join("") || '<div class="empty">Reminder plans will appear here when available.</div>'}</section><section class="card"><h2>Delivery history</h2>${(state.mail || []).map((m) => `<div class="list-row"><strong>${esc(m.title)} · ${esc(m.status)}</strong><p class="muted">To: ${esc(m.to)} · ${esc(dateFmt(m.at, state.profile?.timezone))}</p><details><summary>Message details</summary><pre style="white-space:pre-wrap">${esc(m.text || m.error || "")}</pre></details></div>`).join("") || '<div class="empty">No delivery history yet.</div>'}${state.demo ? '<p class="muted">Your email is not editable in demo mode.</p>' : `<form id="emailForm"><label class="field"><span>Your reminder email</span><input name="email" type="email" autocomplete="email" value="${esc(state.members?.find((m) => m.id === state.me.id)?.email || "")}" required></label><button class="btn secondary">Save email</button></form>`}</section></div>`,
    );
  }
  function render() {
    if (!state) return renderLanding();
    document.body.classList.remove("logged-out");
    document.querySelector(".sidebar").style.display = "flex";
    $("#mobileNav").style.display = "";
    content.innerHTML = (
      {
        today: renderToday,
        medications: renderMeds,
        appointments: renderAppointments,
        circle: renderCircle,
        notes: renderNotes,
        reminders: renderReminders,
      }[view] || renderToday
    )();
    nav();
    bind();
  }
  function renderLanding() {
    document.body.classList.add("logged-out");
    document.querySelector(".sidebar").style.display = "none";
    $("#mobileNav").style.display = "none";
    content.innerHTML = `<div class="content-wrap"><div class="topline"><a class="brand" href="#"><span class="logo">✳</span><span><b>KinDose</b><small>A little care. A little closer.</small></span></a><button class="icon-btn" id="largeBtn" aria-label="Toggle senior reading mode">Aa</button></div><section class="hero" style="margin-top:8vh"><span class="eyebrow">A SHARED SPACE FOR CARE</span><h1>Good care starts with a small check-in.</h1><p>A calmer way to manage medications, appointments, and the people who care.</p><div class="actions"><button class="btn" id="demoBtn">Explore a sample circle</button><button class="btn secondary" id="createBtn">Create a private circle</button><button class="btn outline" id="joinBtn">Join your circle</button></div><p class="muted" style="font-size:13px">Fictional data. Each demo is a separate session.</p></section><p class="eyebrow">PROTOTYPE · NOT MEDICAL ADVICE · NO REAL HEALTH DATA</p></div>`;
    $("#largeBtn").onclick = toggleLarge;
    $("#demoBtn").onclick = () => api("demo", {}, true);
    $("#createBtn").onclick = () => authDialog("create");
    $("#joinBtn").onclick = () => authDialog("join");
  }
  function authDialog(type) {
    lastFocus = document.activeElement;
    let create = type === "create";
    $("#authBody").innerHTML =
      `<h2>${create ? "Create a private circle" : "Join your circle"}</h2><p>${create ? "Your circle is private. Use fictional information for this prototype." : "Enter the circle ID and passphrase shared with you privately."}</p>${create ? `<label class="field"><span>Elder's name</span><input name="name" required autocomplete="name"></label><label class="field"><span>Timezone</span><select name="timezone"><option>Asia/Kolkata</option><option>Europe/London</option><option>America/New_York</option><option>UTC</option></select></label>` : `<label class="field"><span>Circle ID</span><input name="circle" required></label>`}<label class="field"><span>Passphrase (at least 10 characters)</span><input type="password" name="passcode" minlength="10" required autocomplete="new-password"></label><p class="notice">Do not use a real password or real health information in this prototype.</p><button class="btn">${create ? "Create circle" : "Join circle"}</button>`;
    let dlg = $("#authDialog");
    dlg.showModal();
    dlg.querySelector(".dialog-x").onclick = () => dlg.close();
    $("#authForm").onsubmit = async (e) => {
      e.preventDefault();
      let fd = new FormData(e.currentTarget),
        fields = Object.fromEntries(fd.entries());
      let d = await api(create ? "create" : "join", fields, true);
      if (d?.me) dlg.close();
    };
    dlg.onclose = () => lastFocus?.focus();
  }
  function openEdit(title, body, onSubmit) {
    lastFocus = document.activeElement;
    $("#editBody").innerHTML =
      `<h2>${title}</h2>${body}<button class="btn">Save</button>`;
    let d = $("#editDialog");
    d.showModal();
    d.querySelector(".dialog-x").onclick = () => d.close();
    $("#editForm").onsubmit = async (e) => {
      e.preventDefault();
      let ok = await onSubmit(new FormData(e.currentTarget));
      if (ok !== false) d.close();
    };
    d.onclose = () => lastFocus?.focus();
  }
  function medForm(m = {}) {
    let times = m.times || ["08:00"];
    openEdit(
      m.id ? "Edit medication" : "Add medication",
      `<label class="field"><span>Medication name</span><input name="name" value="${esc(m.name)}" required></label><label class="field"><span>Dose (as prescribed)</span><input name="dose" value="${esc(m.dose)}" required></label><label class="field"><span>Schedule times</span><div id="times">${times
        .slice(0, 6)
        .map(
          (t) =>
            `<div class="time-row"><input type="time" name="times" value="${esc(t)}" required><button type="button" class="quiet remove-time">Remove</button></div>`,
        )
        .join(
          "",
        )}</div><button type="button" class="quiet" id="addTime">＋ Add time</button></label><label class="field"><span>Instructions</span><textarea name="instructions">${esc(m.instructions)}</textarea></label><label class="field"><span>Schedule begins</span><input name="startDate" type="date" value="${esc(m.startDate || new Intl.DateTimeFormat("en-CA", { timeZone: state.profile?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()))}" required></label><label class="field"><span>Remaining doses</span><input name="stock" type="number" min="0" step="1" value="${esc(m.stock ?? 0)}" required></label>`,
      async (fd) => {
        let medication = {
          ...Object.fromEntries(fd.entries()),
          id: m.id || undefined,
          times: fd.getAll("times").filter(Boolean),
          stock: Number(fd.get("stock")),
          startDate: fd.get("startDate"),
        };
        return !!(await api("medication", { medication }));
      },
    );
    document
      .querySelectorAll("#editForm .remove-time")
      .forEach((x) => (x.onclick = () => x.parentElement.remove()));
    $("#addTime").onclick = () => {
      let box = $("#times");
      if (box.querySelectorAll("input").length >= 6) {
        toast("A medication can have up to 6 schedule times.");
        return;
      }
      box.insertAdjacentHTML(
        "beforeend",
        '<div class="time-row"><input type="time" name="times" required><button type="button" class="quiet remove-time">Remove</button></div>',
      );
      box
        .querySelectorAll(".remove-time")
        .forEach((x) => (x.onclick = () => x.parentElement.remove()));
    };
  }
  function apptForm(a = {}) {
    let dt = a.datetime ? new Date(a.datetime) : null,
      local = dt
        ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "";
    openEdit(
      a.id ? "Edit appointment" : "Add appointment",
      `<label class="field"><span>Title</span><input name="title" value="${esc(a.title)}" required></label><label class="field"><span>Doctor or contact</span><input name="doctor" value="${esc(a.doctor)}" required></label><label class="field"><span>Date and time</span><input type="datetime-local" name="datetime" value="${esc(local)}" required></label><label class="field"><span>Location</span><input name="location" value="${esc(a.location)}"></label><label class="field"><span>Notes</span><textarea name="notes">${esc(a.notes)}</textarea></label><label class="field"><span>Questions, one per line</span><textarea name="questions">${esc((a.questions || []).join("\n"))}</textarea></label><p class="muted">Appointments display in ${esc(state.profile?.timezone || "UTC")}. Edit time uses your device timezone; the converted circle time will be shown before saving.</p><p id="convertedTime" class="notice"></p>`,
      async (fd) => {
        let x = Object.fromEntries(fd.entries());
        return !!(await api("appointment", {
          appointment: {
            ...x,
            id: a.id || undefined,
            datetime: new Date(x.datetime).toISOString(),
            questions: x.questions
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            done: a.done || false,
          },
        }));
      },
    );
    let dateInput = $("#editForm [name=datetime]");
    const showZone = () => {
      if (!dateInput.value) return;
      let d = new Date(dateInput.value);
      $("#convertedTime").textContent =
        "Circle time: " +
        new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: state.profile?.timezone || "UTC",
        }).format(d) +
        " (" +
        (state.profile?.timezone || "UTC") +
        ")";
    };
    dateInput.addEventListener("input", showZone);
    showZone();
  }
  function bind() {
    document
      .querySelectorAll("[data-dose]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            api("dose", { doseId: b.dataset.dose, status: b.dataset.status })),
      );
    document.querySelectorAll("[data-skip]").forEach(
      (b) =>
        (b.onclick = () =>
          openEdit(
            "Skip this dose",
            `<p>Add a note if you'd like.</p><label class="field"><span>Note</span><textarea name="note"></textarea></label>`,
            async (fd) =>
              !!(await api("dose", {
                doseId: b.dataset.skip,
                status: "skipped",
                note: fd.get("note"),
              })),
          )),
    );
    $("#addMed")?.addEventListener("click", () => medForm());
    document
      .querySelectorAll("[data-edit-med]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            medForm(meds().find((m) => m.id === b.dataset.editMed) || {})),
      );
    document.querySelectorAll("[data-archive]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm("Archive this medication?"))
            await api("archiveMedication", { id: b.dataset.archive });
        }),
    );
    $("#addAppt")?.addEventListener("click", () => apptForm());
    document
      .querySelectorAll("[data-edit-appt]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            apptForm(
              state.appointments.find((a) => a.id === b.dataset.editAppt) || {},
            )),
      );
    document.querySelectorAll("[data-toggle-done]").forEach(
      (b) =>
        (b.onclick = () => {
          let a = state.appointments.find((x) => x.id === b.dataset.toggleDone);
          if (a) api("appointment", { appointment: { ...a, done: !a.done } });
        }),
    );
    document.querySelectorAll("[data-delete-appt]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm("Delete this appointment?"))
            await api("deleteAppointment", { id: b.dataset.deleteAppt });
        }),
    );
    $("#noteForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      let f = new FormData(e.currentTarget);
      await api("note", { text: f.get("text"), kind: f.get("kind") });
    });
    $("#emailForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await api("email", { email: new FormData(e.currentTarget).get("email") });
    });
    $("#checkReminders")?.addEventListener("click", () => api("reminders"));
    document
      .querySelectorAll("[data-switch]")
      .forEach(
        (b) =>
          (b.onclick = () => api("switchDemo", { role: b.dataset.switch })),
      );
    const saveConsent = () =>
      api("consent", {
        familyAlerts: $("#alerts").checked,
        ai: $("#aiConsent").checked,
      });
    $("#alerts")?.addEventListener("change", saveConsent);
    $("#aiConsent")?.addEventListener("change", saveConsent);
    $("#inviteBtn")?.addEventListener("click", () =>
      openEdit(
        "Invite someone",
        `<label class="field"><span>Name</span><input name="name" required></label><label class="field"><span>Role</span><select name="role"><option value="family">Family</option><option value="caretaker">Care partner</option></select></label><label class="field"><span>Per-person passphrase (10+ characters)</span><input type="password" name="passcode" minlength="10" required></label>`,
        async (fd) => !!(await api("invite", Object.fromEntries(fd.entries()))),
      ),
    );
    document.querySelectorAll("[data-revoke]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm("Revoke this person's access?"))
            await api("revoke", { id: b.dataset.revoke });
        }),
    );
    $("#editProfile")?.addEventListener("click", () => {
      let p = state.profile || {};
      openEdit(
        "Edit circle profile",
        `<label class="field"><span>Name</span><input name="name" value="${esc(p.name)}" required></label><label class="field"><span>Age</span><input name="age" type="number" value="${esc(p.age)}"></label><label class="field"><span>Allergy information</span><textarea name="allergies">${esc(p.allergies)}</textarea></label><label class="field"><span>Emergency contact</span><input name="emergencyContact" value="${esc(p.emergencyContact)}"></label><label class="field"><span>Preferences</span><textarea name="preferences">${esc(p.preferences)}</textarea></label>`,
        async (fd) =>
          !!(await api("profile", {
            profile: Object.fromEntries(fd.entries()),
          })),
      );
    });
    $("#deleteCircle")?.addEventListener("click", () =>
      openEdit(
        "Delete this circle",
        `<label class="field"><span>Type DELETE to confirm</span><input name="confirm" required pattern="DELETE"></label>`,
        async (fd) => {
          if (fd.get("confirm") !== "DELETE") return false;
          let result = await api("deleteCircle");
          return !!(result?.deleted || !state);
        },
      ),
    );
    $("#summaryBtn")?.addEventListener("click", async () => {
      let r = await api("summary");
      if (!r) return;
      $("#summaryResult").innerHTML =
        `<hr><details open><summary>Care handoff · ${r.source === "AI-assisted" ? "AI-assisted" : "structured"}</summary><pre style="white-space:pre-wrap">${esc(r.text)}</pre></details>`;
    });
  }
  // Auth/bootstrap and top-level navigation
  document.querySelectorAll(".sidebar [data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        render();
      }),
  );
  async function init() {
    try {
      let r = await fetch("/api/care", { credentials: "include" });
      if (r.ok) {
        let d = await r.json();
        state = d.circle || d;
        if (state?.me) {
          render();
          return;
        }
      }
    } catch {}
    renderLanding();
  }
  init();
})();
