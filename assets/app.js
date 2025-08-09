
const state = {
  currentUser: null,
  timer: { running: false, start: null, client: null, intervalId: null },
  data: null
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function loadData() {
  fetch("./assets/dummy_data.json").then(r => r.json()).then(d => {
    state.data = d;
    persist();
    hydrateClients();
  });
}

function persist() {
  localStorage.setItem("tt_data", JSON.stringify(state.data));
}

function fmtH(ms) {
  const totSec = Math.floor(ms/1000);
  const h = Math.floor(totSec/3600);
  const m = Math.floor((totSec%3600)/60);
  const s = totSec%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function roundingMinutes() {
  return state.data?.settings?.rounding_minutes ?? 6;
}
function roundToMinutes(ms) {
  const mins = Math.round(ms/60000);
  const inc = roundingMinutes();
  const rounded = Math.round(mins/inc)*inc;
  return rounded * 60000;
}
function nyDateFromLocalString(s) {
  return new Date(s.replace(" ", "T") + ":00");
}

function show(view) {
  $("#login-view").classList.add("hidden");
  $("#timer-view").classList.add("hidden");
  $("#timesheet-view").classList.add("hidden");
  $("#approvals-view").classList.add("hidden");
  $("#invoices-view").classList.add("hidden");
  $(`#${view}-view`).classList.remove("hidden");
  if (view !== "login") $("#nav").classList.remove("hidden");
}

function login() {
  const email = $("#email").value.trim();
  const pass = $("#password").value.trim();
  const user = state.data.users.find(u => u.email === email && u.password === pass);
  if (!user) { alert("Invalid credentials"); return; }
  state.currentUser = user;
  $("#active-user").textContent = `${user.name} (${user.role})`;
  hydrateClients();
  show("timer");
}

function logout() {
  state.currentUser = null;
  $("#nav").classList.add("hidden");
  show("login");
}

function hydrateClients() {
  const sel = $("#client-select");
  const invSel = $("#invoice-client");
  [sel, invSel].forEach(s => s.innerHTML = "");
  state.data.clients.forEach(c => {
    const o = document.createElement("option");
    o.value = o.textContent = c.name;
    sel.appendChild(o.cloneNode(true));
    invSel.appendChild(o.cloneNode(true));
  });
}

function startStopTimer() {
  if (!state.currentUser) return;
  const btn = $("#start-stop-btn");
  if (!state.timer.running) {
    const client = $("#client-select").value;
    state.timer.running = true;
    state.timer.client = client;
    state.timer.start = new Date();
    btn.textContent = "Stop";
    state.timer.intervalId = setInterval(() => {
      const elapsed = new Date() - state.timer.start;
      $("#timer-display").textContent = fmtH(elapsed);
    }, 500);
  } else {
    $("#stop-modal").classList.remove("hidden");
  }
}

function saveStop() {
  const note = $("#work-note").value.trim();
  if (!note) { alert("Please enter a brief description."); return; }
  $("#stop-modal").classList.add("hidden");
  const stopTime = new Date();
  clearInterval(state.timer.intervalId);
  const durationMs = stopTime - state.timer.start;
  const roundedMs = roundToMinutes(durationMs);
  const startedAt = state.timer.start;
  const stoppedAt = new Date(startedAt.getTime() + roundedMs);

  state.data.time_entries = state.data.time_entries || [];
  state.data.time_entries.push({
    user_email: state.currentUser.email,
    client_name: state.timer.client,
    started_at_local: startedAt.toISOString().slice(0,16).replace("T"," "),
    stopped_at_local: stoppedAt.toISOString().slice(0,16).replace("T"," "),
    note, status: "draft"
  });
  persist();

  state.timer = { running:false, start:null, client:null, intervalId:null };
  $("#start-stop-btn").textContent = "Start";
  $("#timer-display").textContent = "00:00:00";
  $("#work-note").value = "";
  renderTimesheet();
}

function cancelStop() { $("#stop-modal").classList.add("hidden"); }

function renderTimesheet() {
  const tbody = $("#timesheet-table tbody");
  tbody.innerHTML = "";
  const entries = (state.data.time_entries || []).filter(e => e.user_email === state.currentUser.email);
  entries.sort((a,b) => a.started_at_local.localeCompare(b.started_at_local));
  for (const e of entries) {
    const tr = document.createElement("tr");
    const st = nyDateFromLocalString(e.started_at_local);
    const en = nyDateFromLocalString(e.stopped_at_local);
    const hrs = (en - st)/3600000;
    tr.innerHTML = `
      <td>${e.started_at_local.slice(0,10)}</td>
      <td>${e.client_name}</td>
      <td>${e.started_at_local.slice(11)}</td>
      <td>${e.stopped_at_local.slice(11)}</td>
      <td>${hrs.toFixed(2)}</td>
      <td>${e.status}</td>
      <td>${e.note}</td>
      <td>${e.status==="draft" ? '<button class="sm edit">Edit</button> <button class="sm del">Delete</button> <button class="sm submit">Submit</button>' : ''}</td>
    `;
    tr.querySelector(".edit")?.addEventListener("click", () => {
      const newNote = prompt("Edit note:", e.note) || e.note;
      e.note = newNote; persist(); renderTimesheet();
    });
    tr.querySelector(".del")?.addEventListener("click", () => {
      if (confirm("Delete this entry?")) {
        const i = state.data.time_entries.indexOf(e);
        state.data.time_entries.splice(i,1); persist(); renderTimesheet();
      }
    });
    tr.querySelector(".submit")?.addEventListener("click", () => {
      e.status = "submitted"; persist(); renderTimesheet();
    });
    tbody.appendChild(tr);
  }
}

function renderApprovals() {
  const tbody = $("#approvals-table tbody");
  tbody.innerHTML = "";
  const isManager = state.currentUser.role === "Manager" || state.currentUser.role === "Admin";
  const entries = (state.data.time_entries || []).filter(e => e.status === "submitted");
  entries.sort((a,b) => a.started_at_local.localeCompare(b.started_at_local));
  for (const e of entries) {
    const tr = document.createElement("tr");
    const st = nyDateFromLocalString(e.started_at_local);
    const en = nyDateFromLocalString(e.stopped_at_local);
    const hrs = (en - st)/3600000;
    const user = state.data.users.find(u=>u.email===e.user_email);
    tr.innerHTML = `
      <td>${user?.name ?? e.user_email}</td>
      <td>${e.started_at_local.slice(0,10)}</td>
      <td>${e.client_name}</td>
      <td>${hrs.toFixed(2)}</td>
      <td>${e.status}</td>
      <td>${isManager?'<button class="sm approve">Approve</button>':''}</td>
    `;
    tr.querySelector(".approve")?.addEventListener("click", () => {
      e.status = "approved"; e.approved_at = new Date().toISOString(); e.approved_by = state.currentUser.email;
      persist(); renderApprovals();
    });
    tbody.appendChild(tr);
  }
}

function startOfWeekSunday(dt) {
  const d = new Date(dt);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diffToSun = (7 - day) % 7;
  const sun = new Date(d);
  sun.setDate(d.getDate() + diffToSun);
  sun.setHours(0,0,0,0);
  return sun;
}

function lookupRate(consultantEmail, clientName) {
  const row = state.data.rates.find(r => r.consultant_email===consultantEmail && r.client_name===clientName);
  if (!row) return 0;
  return row.rate_per_hour;
}

function generateInvoice(clientName, yyyymm) {
  const [yr, mo] = yyyymm.split("-").map(x=>parseInt(x,10));
  const monthStart = new Date(yr, mo-1, 1);
  const monthEnd = new Date(yr, mo, 0);
  const entries = (state.data.time_entries || []).filter(e => {
    const st = nyDateFromLocalString(e.started_at_local);
    return e.client_name===clientName && e.status==="approved" && st>=monthStart && st<=monthEnd;
  });

  const dayMap = {};
  for (const e of entries) {
    const user = state.data.users.find(u=>u.email===e.user_email);
    const st = nyDateFromLocalString(e.started_at_local);
    const en = nyDateFromLocalString(e.stopped_at_local);
    const key = `${user.name}|${e.user_email}|${e.client_name}|${st.toISOString().slice(0,10)}`;
    const hrs = (en - st)/3600000;
    if (!dayMap[key]) dayMap[key] = {consultant_name:user.name, consultant_email:e.user_email, date: st.toISOString().slice(0,10), hours:0, notes:[]};
    dayMap[key].hours += hrs;
    dayMap[key].notes.push(e.note);
  }
  const dayRows = Object.values(dayMap).sort((a,b)=>{
    if (a.consultant_name < b.consultant_name) return -1;
    if (a.consultant_name > b.consultant_name) return 1;
    return a.date.localeCompare(b.date);
  });

  const weekly = {};
  for (const r of dayRows) {
    const d = new Date(r.date+"T00:00:00");
    const weekEnd = startOfWeekSunday(d);
    const key = weekEnd.toISOString().slice(0,10);
    if (!weekly[key]) weekly[key] = {week_ending_date:key, hours:0, amount:0};
    weekly[key].hours += r.hours;
    const rate = lookupRate(r.consultant_email, clientName);
    weekly[key].amount += r.hours * rate;
  }
  const weeklyRows = Object.values(weekly).sort((a,b)=>a.week_ending_date.localeCompare(b.week_ending_date));
  const totals = weeklyRows.reduce((acc,w)=>({hours:acc.hours+w.hours, amount:acc.amount+w.amount}), {hours:0, amount:0});

  const client = state.data.clients.find(c=>c.name===clientName);
  const header = `
    <h2>${client.name}</h2>
    <div class="subtle">${client.address || ""}</div>
    <div class="subtle">Terms: ${client.terms}</div>
    <div class="subtle">Invoice Month: ${yyyymm}</div>
    <hr/>
  `;
  const weeklyTable = [`<table><thead><tr><th>Week Ending</th><th>Total Billable Hours</th><th>Amount</th></tr></thead><tbody>`,
    ...weeklyRows.map(w=>`<tr><td>${w.week_ending_date}</td><td>${w.hours.toFixed(2)}</td><td>$${w.amount.toFixed(2)}</td></tr>`),
    `<tr><th>Total</th><th>${totals.hours.toFixed(2)}</th><th>$${totals.amount.toFixed(2)}</th></tr>`,
    `</tbody></table>`
  ].join("");
  const dailyTable = [`<h3>Daily Detail (ordered by consultant)</h3>`,
    `<table><thead><tr><th>Consultant</th><th>Date</th><th>Hours for Day</th><th>Billable Hours</th><th>Summary</th></tr></thead><tbody>`,
    ...dayRows.map(r=>{
      const notes = Array.from(new Set(r.notes)).join(" ");
      return `<tr><td>${r.consultant_name}</td><td>${r.date}</td><td>${r.hours.toFixed(2)}</td><td>${r.hours.toFixed(2)}</td><td>${notes}</td></tr>`;
    }),
    `</tbody></table>`
  ].join("");

  $("#invoice-output").innerHTML = header + weeklyTable + dailyTable;
}

function initEvents() {
  $("#login-btn").addEventListener("click", login);
  $("#logout").addEventListener("click", logout);
  $$("#nav button[data-view]").forEach(btn => btn.addEventListener("click", (e)=>{
    const v = e.target.getAttribute("data-view");
    show(v);
    if (v==="timesheet") renderTimesheet();
    if (v==="approvals") renderApprovals();
  }));
  $("#start-stop-btn").addEventListener("click", startStopTimer);
  $("#cancel-stop").addEventListener("click", cancelStop);
  $("#confirm-stop").addEventListener("click", saveStop);
  $("#gen-invoice").addEventListener("click", () => {
    const client = $("#invoice-client").value;
    const month = $("#invoice-month").value || new Date().toISOString().slice(0,7);
    generateInvoice(client, month);
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  loadData();
  initEvents();
  show("login");
});
