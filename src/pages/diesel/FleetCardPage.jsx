import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { Badge, Button, Card } from "../../components/ui.jsx";
import { IconPencil, IconPlus, IconTrash } from "../../components/icons.jsx";
import {
  Empty,
  ErrorBox,
  Loading,
  inputCls,
} from "../../components/diesel/shared.jsx";
import {
  ReloadModal,
  UsageModal,
} from "../../components/diesel/CardModals.jsx";
import {
  CARD_CHECKLIST,
  CARD_STATUS,
  cardBalances,
  cardLedger,
  checklistDone,
  deleteCard,
  deleteCardRecord,
  getCard,
  listCardData,
  listPeople,
  listVehicles,
  personLabel,
  saveCard,
  vehicleLabel,
} from "../../lib/diesel.js";
import { day, money, monthLabel, num, thisMonth, today } from "../../lib/format.js";

// One fleet card: vehicle, the application check list (company items, driver
// items), card details, the drivers sharing the card and, once the card is in
// use, the card's RM balance month by month (reloads in, fuel taken out; must
// tally with the fuel station), then this month's fill-ups and reloads.
// Ticking "Tested fleet card" makes the card Active; from then on the check
// list folds into a small button on the Vehicle box. Fleet-card receipts that
// the card's drivers put on fuel claims count as fuel taken on this card
// (unless the receipt's vehicle has its own card). Reloads recorded on fuel claims appear here
// too, marked "from fuel claim"; they are changed on the claim.
// /diesel/cards/new applies; /diesel/cards/:id views; /diesel/cards/:id/edit edits.
const EMPTY = {
  vehicle_id: "",
  driver_ids: [],
  provider: "",
  subsidy_litres: "",
  card_no: "",
  status: "application",
  licence_expiry: "",
  notes: "",
  checklist: {},
  kpdn_apply: false,
  login_id: "",
  login_password: "",
};
const box = `${inputCls} h-10 px-3 text-sm`;
const dateCls = `${inputCls} h-8 px-2 text-xs`;

export default function FleetCardPage({ mode }) {
  const { company, access } = useOutletContext();
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = mode === "new" || mode === "edit";
  const ro = !editing;
  const [form, setForm] = useState(EMPTY);
  const [card, setCard] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [people, setPeople] = useState([]);
  const [data, setData] = useState({ usage: [], reloads: [] });
  const [ledger, setLedger] = useState(null); // null until the database has machinery_card_ledger
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, v, p, d, lg] = await Promise.all([
        id ? getCard(id) : null,
        listVehicles(company.id),
        listPeople(company.id).catch(() => []),
        id ? listCardData(company.id) : { usage: [], reloads: [] },
        id ? cardLedger(company.id).catch(() => null) : null,
      ]);
      setLedger(lg);
      if (id && (!c || c.company_id !== company.id))
        throw new Error("Fleet card not found in this company.");
      setVehicles(v);
      setPeople(p);
      setData(d);
      setCard(c);
      if (!c) setForm(EMPTY);
      if (c) {
        setForm({
          vehicle_id: c.vehicle_id || "",
          driver_ids: c.driver_ids?.length
            ? c.driver_ids
            : c.driver_id
              ? [c.driver_id]
              : [],
          provider: c.provider || "",
          subsidy_litres: c.subsidy_litres ?? "",
          card_no: c.card_no || "",
          status: c.status || "application",
          licence_expiry: c.licence_expiry || "",
          notes: c.notes || "",
          checklist: c.checklist || {},
          kpdn_apply: Boolean(c.kpdn_apply),
          login_id: c.login_id || "",
          login_password: c.login_password || "",
        });
      }
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, company.id]);

  useEffect(() => {
    load();
  }, [load]);

  const vById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );
  const person = useMemo(
    () => new Map(people.map((p) => [p.user_id, p])),
    [people],
  );
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Choosing the vehicle brings its drivers along (if none chosen yet).
  const setVehicle = (e) => {
    const v = vById.get(e.target.value);
    const fromVehicle = v?.driver_ids?.length
      ? v.driver_ids
      : v?.driver_id
        ? [v.driver_id]
        : [];
    setForm((f) => ({
      ...f,
      vehicle_id: e.target.value,
      driver_ids: f.driver_ids.length ? f.driver_ids : fromVehicle,
    }));
  };
  const addDriver = (e) => {
    const uid = e.target.value;
    if (uid)
      setForm((f) =>
        f.driver_ids.includes(uid)
          ? f
          : { ...f, driver_ids: [...f.driver_ids, uid] },
      );
  };
  const dropDriver = (uid) =>
    setForm((f) => ({
      ...f,
      driver_ids: f.driver_ids.filter((d) => d !== uid),
    }));
  const item = (key) => form.checklist[key] || {};
  const setItem = (key, patch) =>
    setForm((f) => ({
      ...f,
      checklist: {
        ...f.checklist,
        [key]: { ...(f.checklist[key] || {}), ...patch },
      },
    }));
  const tick = (key) => (e) => {
    setItem(key, {
      done: e.target.checked,
      date: e.target.checked ? item(key).date || today() : "",
    });
    // A tested card is in use: Applying -> Active.
    if (key === "card_tested" && e.target.checked)
      setForm((f) => (f.status === "application" ? { ...f, status: "active" } : f));
  };

  const done = CARD_CHECKLIST.filter((i) => item(i.key).done).length;
  const allDone =
    done === CARD_CHECKLIST.length && Boolean(form.licence_expiry);

  async function save(e) {
    e.preventDefault();
    if (!form.vehicle_id) return setError("Choose the vehicle first.");
    setBusy(true);
    setError("");
    try {
      const savedId = await saveCard(company.id, {
        id: id || undefined,
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_ids[0] || null,
        driver_ids: form.driver_ids,
        provider: form.provider.trim() || null,
        subsidy_litres:
          form.subsidy_litres === "" ? null : Number(form.subsidy_litres),
        card_no: form.card_no.trim() || null,
        status:
          form.status === "application" && form.checklist.card_tested?.done
            ? "active"
            : form.status,
        licence_expiry: form.licence_expiry || null,
        kpdn_apply: Boolean(form.kpdn_apply),
        login_id: form.login_id.trim() || null,
        login_password: form.login_password.trim() || null,
        notes: form.notes.trim() || null,
        checklist: form.checklist,
      });
      navigate(`/diesel/cards/${savedId}`, { replace: true });
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this fleet card application? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCard(id);
      navigate("/diesel/cards", { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function setInUse(next) {
    const msg =
      next === "inactive"
        ? "Make this fleet card inactive? It will no longer be offered on fuel claims or fill-ups. You can make it active again later."
        : "Make this fleet card active again?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await saveCard(company.id, { id, status: next });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeRecord(kind, rid) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    try {
      await deleteCardRecord(kind, rid);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <Loading />;

  const st = CARD_STATUS[form.status] || CARD_STATUS.application;
  const month = thisMonth();
  const usage = data.usage.filter(
    (u) => u.card_id === id && u.fill_date.startsWith(month),
  );
  const reloads = data.reloads.filter(
    (r) => r.card_id === id && r.reload_date.startsWith(month),
  );
  const usedL = usage.reduce((s, u) => s + Number(u.litres || 0), 0);
  const quota = form.subsidy_litres === "" ? null : Number(form.subsidy_litres);
  // RM balance: every reload less every fill-up on this card, month by month.
  const mine = (ledger || []).filter((r) => r.card_id === id);
  const balanceNow = cardBalances(mine)[id] || 0;
  const ledgerYears = [...new Set(mine.map((r) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a);
  if (ledgerYears.length && !ledgerYears.includes(ledgerYear)) ledgerYears.push(ledgerYear);
  const months = [...new Set(mine.filter((r) => r.month.startsWith(String(ledgerYear))).map((r) => r.month))].sort();
  const openingBalance = cardBalances(mine, `${ledgerYear - 1}-12`)[id] || 0;
  let running = openingBalance;
  const ledgerRows = months.map((m) => {
    const inRM = mine.filter((r) => r.month === m && r.kind === "reload").reduce((s, r) => s + Number(r.amount), 0);
    const out = mine.filter((r) => r.month === m && r.kind === "usage");
    const outRM = out.reduce((s, r) => s + Number(r.amount), 0);
    const outL = out.reduce((s, r) => s + Number(r.litres || 0), 0);
    running += inRM - outRM;
    return { month: m, inRM, outRM, outL, balance: running };
  });
  const licence = form.licence_expiry
    ? Math.round(
        (new Date(form.licence_expiry) - new Date(new Date().toDateString())) /
          86400000,
      )
    : null;
  // Once the card is in use the check list folds into a button.
  const checklistFolded = Boolean(card) && card.status !== "application";
  const title =
    mode === "new"
      ? "New fleet card application"
      : form.card_no || "Fleet card application";
  // The list shows light vehicles (by Type in Machinery Profile); typing in
  // the search box looks through every machine of the company instead (name,
  // plate, type, brand, model). The vehicle already on this card always stays.
  const q = vehicleQuery.trim().toLowerCase();
  const matches = (v) =>
    q
      ? [v.name, v.reg_no, v.machine_type, v.brand, v.model]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      : /light/i.test(v.machine_type || "");
  const sorted = vehicles
    .filter((v) => matches(v) || v.id === form.vehicle_id)
    .sort((a, b) => Number(Boolean(b.kpdn_subsidy)) - Number(Boolean(a.kpdn_subsidy)) || a.name.localeCompare(b.name));
  const found = sorted.filter((v) => v.id !== form.vehicle_id || matches(v)).length;

  return (
    <form onSubmit={save} className="space-y-4">
      <PageHeader
        backTo={mode === "edit" ? `/diesel/cards/${id}` : "/diesel/cards"}
        backLabel={mode === "edit" ? "Back to card" : "Back to fleet card list"}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {title}
            {ro && <Badge color={st.color}>{st.label}</Badge>}
          </span>
        }
        right={
          editing ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  navigate(id ? `/diesel/cards/${id}` : "/diesel/cards")
                }
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {form.status !== "application" && access.can("cards", "add") && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setModal("usage")}
                  >
                    <IconPlus width={18} height={18} /> Fill-up
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setModal("reload")}
                  >
                    <IconPlus width={18} height={18} /> Reload
                  </Button>
                </>
              )}
              {access.can("cards", "edit") && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(`/diesel/cards/${id}/edit`)}
                >
                  <IconPencil width={18} height={18} /> Edit
                </Button>
              )}
              {access.can("cards", "edit") && form.status !== "application" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    setInUse(
                      ["inactive", "cancelled"].includes(form.status)
                        ? "active"
                        : "inactive",
                    )
                  }
                >
                  {["inactive", "cancelled"].includes(form.status)
                    ? "Make active"
                    : "Make inactive"}
                </Button>
              )}
              {access.can("cards", "delete") && (
                <Button
                  type="button"
                  variant="secondary"
                  className="text-red-600"
                  disabled={busy}
                  onClick={remove}
                >
                  <IconTrash width={18} height={18} /> Delete
                </Button>
              )}
            </div>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="space-y-4">
        {/* 1. Vehicle */}
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">
              Vehicle
            </h3>
            {checklistFolded && (
              <button
                type="button"
                onClick={() => setShowChecklist((v) => !v)}
                aria-expanded={showChecklist}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Application check list
                <span className={allDone ? "text-emerald-600" : "text-amber-600"}>
                  {done}/{CARD_CHECKLIST.length}
                </span>
                <span aria-hidden="true">{showChecklist ? "▴" : "▾"}</span>
              </button>
            )}
          </div>
          <div className="grid gap-x-10 lg:grid-cols-2">
            <div>
              <Row
                label="Vehicle"
                ro={ro}
                show={
                  form.vehicle_id
                    ? vehicleLabel(vById.get(form.vehicle_id))
                    : ""
                }
              >
                <input
                  type="search"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder="Search any machine (name, plate, type)…"
                  className={`${box} mb-2`}
                  aria-label="Search vehicle or machine"
                />
                <select
                  value={form.vehicle_id}
                  onChange={setVehicle}
                  className={box}
                  required
                >
                  <option value="">
                    {q
                      ? found
                        ? `Choose from ${found} match${found === 1 ? "" : "es"}…`
                        : "No machine matches the search"
                      : "Choose light vehicle…"}
                  </option>
                  {sorted.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(v.kpdn_subsidy ? "★ " : "") + vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Fuel station" ro={ro} show={form.provider}>
                <input
                  value={form.provider}
                  onChange={set("provider")}
                  list="fuel-stations"
                  placeholder="Petronas / Shell / Petron"
                  className={box}
                />
                <datalist id="fuel-stations">
                  {["Petronas", "Shell", "Petron", "Caltex", "BHP"].map(
                    (st2) => (
                      <option key={st2} value={st2} />
                    ),
                  )}
                </datalist>
              </Row>
            </div>
            <div>
              <Row label="Status" ro={ro} show={st.label}>
                <select
                  value={form.status}
                  onChange={set("status")}
                  className={box}
                >
                  {Object.entries(CARD_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Notes" ro={ro} show={form.notes}>
                <input
                  value={form.notes}
                  onChange={set("notes")}
                  className={box}
                />
              </Row>
              <div className="grid items-start gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3 border-b border-slate-100 py-2.5">
                <span className="pt-2 text-sm font-semibold text-slate-700">
                  Applying for KPDN subsidy?
                </span>
                <div className="pt-2.5">
                  <input
                    type="checkbox"
                    checked={Boolean(form.kpdn_apply)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kpdn_apply: e.target.checked }))
                    }
                    disabled={ro}
                    className="h-5 w-5 rounded border-slate-300 text-brand disabled:opacity-100"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 2. Application check list, only when applying for the subsidy;
            folded into a button on the Vehicle box once the card is in use */}
        {form.kpdn_apply && (!checklistFolded || showChecklist) && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">
                Application check list
              </h3>
              <Badge color={allDone ? "green" : "amber"}>
                {done} / {CARD_CHECKLIST.length} done
              </Badge>
            </div>
            <div className="grid gap-x-6 lg:grid-cols-2">
              {["Company", "Driver"].map((group) => (
                <div key={group} className="mb-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group}
                  </p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {CARD_CHECKLIST.filter((i) => i.group === group).map(
                      (i) => {
                        const it = item(i.key);
                        return (
                          <label
                            key={i.key}
                            className={`flex items-center gap-3 px-3 py-2 text-sm ${ro ? "" : "cursor-pointer hover:bg-slate-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(it.done)}
                              onChange={tick(i.key)}
                              disabled={ro}
                              className="h-5 w-5 rounded border-slate-300 text-brand disabled:opacity-100"
                            />
                            <span
                              className={`flex-1 ${it.done ? "text-slate-500 line-through" : "text-slate-800"}`}
                            >
                              {i.label}
                            </span>
                            {ro ? (
                              <span className="text-xs text-slate-500">
                                {it.done && it.date ? day(it.date) : ""}
                              </span>
                            ) : (
                              <span className="w-36 shrink-0">
                                <input
                                  type="date"
                                  value={it.date || ""}
                                  onChange={(e) =>
                                    setItem(i.key, { date: e.target.value })
                                  }
                                  className={dateCls}
                                  title="Date done"
                                />
                              </span>
                            )}
                          </label>
                        );
                      },
                    )}
                    {group === "Driver" && (
                      <div className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="h-5 w-5" />
                        <span className="flex-1 text-slate-800">
                          Licence expiry date
                        </span>
                        {ro ? (
                          <span className="text-xs text-slate-700">
                            {form.licence_expiry
                              ? day(form.licence_expiry)
                              : "—"}
                            {licence != null && licence < 0 && (
                              <Badge color="red" className="ml-2">
                                Expired
                              </Badge>
                            )}
                            {licence != null &&
                              licence >= 0 &&
                              licence <= 60 && (
                                <Badge color="amber" className="ml-2">
                                  Expiring soon
                                </Badge>
                              )}
                          </span>
                        ) : (
                          <span className="w-36 shrink-0">
                            <input
                              type="date"
                              value={form.licence_expiry}
                              onChange={set("licence_expiry")}
                              className={dateCls}
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 3. Fleet card details */}
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">
            Fleet card details
          </h3>
          <div className="grid gap-x-10 lg:grid-cols-2">
            <div>
              <Row label="Fleet card number" ro={ro} show={form.card_no}>
                <input
                  value={form.card_no}
                  onChange={set("card_no")}
                  maxLength={40}
                  placeholder="Once the card is awarded"
                  className={box}
                />
              </Row>
              <Row
                label="Subsidy volume (L / month)"
                ro={ro}
                show={quota != null ? `${num(quota, 2)} L` : ""}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subsidy_litres}
                  onChange={set("subsidy_litres")}
                  className={box}
                />
              </Row>
            </div>
            <div>
              <Row label="Login user ID" ro={ro} show={form.login_id}>
                <input
                  value={form.login_id}
                  onChange={set("login_id")}
                  maxLength={80}
                  autoComplete="off"
                  className={box}
                />
              </Row>
              <Row label="Password record" ro={ro} show={form.login_password}>
                <input
                  value={form.login_password}
                  onChange={set("login_password")}
                  maxLength={80}
                  autoComplete="off"
                  className={box}
                />
              </Row>
            </div>
          </div>
          {id && form.status !== "application" && (
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
              <div>
                <p className="text-[11px] text-slate-500">Subsidy volume</p>
                <p className="text-sm font-semibold">
                  {quota != null ? `${num(quota, 2)} L` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Used this month</p>
                <p className="text-sm font-semibold">{num(usedL, 2)} L</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Balance volume</p>
                <p
                  className={`text-sm font-semibold ${quota != null && quota - usedL < 0 ? "text-red-600" : "text-brand-dark"}`}
                >
                  {quota != null ? `${num(quota - usedL, 2)} L` : "—"}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* 4. Drivers sharing the card */}
        <Card className="p-5">
          <h3 className="mb-1 font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">
            Fleet card drivers
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Drivers who share this card. The fleet-card (subsidy) receipts they
            put on their fuel claims count as fuel taken on this card, so the
            reload balance stays right. A receipt for a vehicle that has its
            own fleet card counts on that card instead.
          </p>
          {form.driver_ids.length === 0 && ro ? (
            <p className="text-sm text-slate-400">No driver set.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {form.driver_ids.map((uid, i) => (
                <li key={uid} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-slate-800">
                    {person.get(uid) ? personLabel(person.get(uid)) : "Unknown user"}
                  </span>
                  {i === 0 && (
                    <span className="text-xs text-slate-500">Main driver</span>
                  )}
                  {!ro && (
                    <button
                      type="button"
                      onClick={() => dropDriver(uid)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${personLabel(person.get(uid))}`}
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  )}
                </li>
              ))}
              {!ro && (
                <li className="px-3 py-2">
                  <select
                    value=""
                    onChange={addDriver}
                    className={box}
                    aria-label="Add driver"
                  >
                    <option value="">+ Add driver…</option>
                    {people
                      .filter((p) => !form.driver_ids.includes(p.user_id))
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {personLabel(p)}
                        </option>
                      ))}
                  </select>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Reloads and balance, month by month (reloads by hand or from fuel claims, less fuel taken on the card) */}
      {id && form.status !== "application" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
            <h3 className="font-semibold text-slate-800">Reloads &amp; balance</h3>
            <select
              value={ledgerYear}
              onChange={(e) => setLedgerYear(Number(e.target.value))}
              className={`${inputCls} h-9 w-28 px-2 text-sm`}
              aria-label="Year"
            >
              {(ledgerYears.length ? ledgerYears : [ledgerYear]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            <span className="text-sm text-slate-500">Card balance now</span>
            <span className={`text-lg font-bold tabular-nums ${balanceNow < 0 ? "text-red-600" : "text-brand-dark"}`}>
              {ledger ? money(balanceNow) : "—"}
            </span>
          </div>
          {!ledger ? (
            <Empty>Run the Fuel SQL migration 20261126 (fleet card reloads from claims) to see the balance.</Empty>
          ) : ledgerRows.length === 0 ? (
            <Empty>No reload or fill-up in {ledgerYear}.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">Month</th>
                    <th className="px-3 py-2.5 text-right">Reloads (RM)</th>
                    <th className="px-3 py-2.5 text-right">Fuel taken (RM)</th>
                    <th className="px-3 py-2.5 text-right">Fuel taken (L)</th>
                    <th className="px-3 py-2.5 text-right">Balance at month end (RM)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openingBalance !== 0 && (
                    <tr className="text-slate-500">
                      <td className="px-5 py-2.5" colSpan={4}>
                        Balance brought forward
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(openingBalance)}</td>
                    </tr>
                  )}
                  {ledgerRows.map((r) => (
                    <tr key={r.month} className={r.month === month ? "bg-brand-light/40" : ""}>
                      <td className="px-5 py-2.5 font-medium text-slate-800">{monthLabel(r.month)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.inRM ? `+ ${money(r.inRM)}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.outRM ? `− ${money(r.outRM)}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.outL ? `${num(r.outL, 2)} L` : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${r.balance < 0 ? "text-red-600" : "text-slate-900"}`}>{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-2.5 text-xs text-slate-500">
                Fuel taken = fill-ups recorded on this card plus fleet-card receipts on fuel claims for its vehicle or by its drivers. Reloads = those typed here plus fleet card reloads on fuel claims.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* This month, once the card is in use */}
      {id && form.status !== "application" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">
              Fill-ups this month
            </h3>
            {usage.length === 0 ? (
              <Empty>No fill-up this month.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {usage.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span className="text-slate-500">{day(u.fill_date)}</span>
                    <span className="font-medium text-slate-800">
                      {num(u.litres, 2)} L
                    </span>
                    <span className="text-slate-500">
                      {[
                        u.station,
                        u.driver_id && personLabel(person.get(u.driver_id)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="flex-1" />
                    <span className="font-medium">{money(u.amount)}</span>
                    {access.can("cards", "delete") && (
                      <button
                        type="button"
                        onClick={() => removeRecord("usage", u.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">
              Reloads this month
            </h3>
            {reloads.length === 0 ? (
              <Empty>No reload this month.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {reloads.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span className="text-slate-500">{day(r.reload_date)}</span>
                    <span className="text-slate-500">{r.reference}</span>
                    {r.claim_line_id && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">from fuel claim</span>
                    )}
                    <span className="flex-1" />
                    <span className="font-medium text-emerald-600">
                      + {money(r.amount)}
                    </span>
                    {access.can("cards", "delete") && !r.claim_line_id && (
                      <button
                        type="button"
                        onClick={() => removeRecord("reload", r.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {editing && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              navigate(id ? `/diesel/cards/${id}` : "/diesel/cards")
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      {modal === "usage" && card && (
        <UsageModal
          company={company}
          cards={[card]}
          vehicles={vehicles}
          people={people}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === "reload" && card && (
        <ReloadModal
          company={company}
          cards={[card]}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </form>
  );
}

function Row({ label, ro, show, children }) {
  return (
    <div className="grid items-start gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">{label}</span>
      {ro ? (
        <p className="min-h-10 py-2 text-sm text-slate-800">
          {show || <span className="text-slate-400">—</span>}
        </p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
