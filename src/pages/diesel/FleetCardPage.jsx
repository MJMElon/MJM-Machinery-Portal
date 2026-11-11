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
import { day, money, num, thisMonth, today } from "../../lib/format.js";

// One fleet card: the application check list (vehicle, company items, driver
// items) and, once the card is in use, this month's fill-ups and reloads.
// /diesel/cards/new applies; /diesel/cards/:id views; /diesel/cards/:id/edit edits.
const EMPTY = {
  vehicle_id: "",
  driver_id: "",
  provider: "",
  subsidy_litres: "",
  card_no: "",
  status: "application",
  licence_expiry: "",
  notes: "",
  checklist: {},
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, v, p, d] = await Promise.all([
        id ? getCard(id) : null,
        listVehicles(company.id),
        listPeople(company.id).catch(() => []),
        id ? listCardData(company.id) : { usage: [], reloads: [] },
      ]);
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
          driver_id: c.driver_id || "",
          provider: c.provider || "",
          subsidy_litres: c.subsidy_litres ?? "",
          card_no: c.card_no || "",
          status: c.status || "application",
          licence_expiry: c.licence_expiry || "",
          notes: c.notes || "",
          checklist: c.checklist || {},
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
  // Choosing the vehicle brings its driver along.
  const setVehicle = (e) => {
    const v = vById.get(e.target.value);
    setForm((f) => ({
      ...f,
      vehicle_id: e.target.value,
      driver_id: f.driver_id || v?.driver_ids?.[0] || v?.driver_id || "",
    }));
  };
  const item = (key) => form.checklist[key] || {};
  const setItem = (key, patch) =>
    setForm((f) => ({
      ...f,
      checklist: {
        ...f.checklist,
        [key]: { ...(f.checklist[key] || {}), ...patch },
      },
    }));
  const tick = (key) => (e) =>
    setItem(key, {
      done: e.target.checked,
      date: e.target.checked ? item(key).date || today() : "",
    });

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
        driver_id: form.driver_id || null,
        provider: form.provider.trim() || null,
        subsidy_litres:
          form.subsidy_litres === "" ? null : Number(form.subsidy_litres),
        card_no: form.card_no.trim() || null,
        status: form.status,
        licence_expiry: form.licence_expiry || null,
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
  const licence = form.licence_expiry
    ? Math.round(
        (new Date(form.licence_expiry) - new Date(new Date().toDateString())) /
          86400000,
      )
    : null;
  const title =
    mode === "new"
      ? "New fleet card application"
      : form.card_no || "Fleet card application";
  const sorted = [...vehicles].sort(
    (a, b) =>
      Number(Boolean(b.kpdn_subsidy)) - Number(Boolean(a.kpdn_subsidy)) ||
      a.name.localeCompare(b.name),
  );

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
        {/* Card details (profile) first, the application check list below */}
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">
            Fleet card profile
          </h3>
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
                <select
                  value={form.vehicle_id}
                  onChange={setVehicle}
                  className={box}
                  required
                >
                  <option value="">Choose vehicle…</option>
                  {sorted.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(v.kpdn_subsidy ? "★ " : "") + vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </Row>
              <Row
                label="Driver"
                ro={ro}
                show={
                  form.driver_id ? personLabel(person.get(form.driver_id)) : ""
                }
              >
                <select
                  value={form.driver_id}
                  onChange={set("driver_id")}
                  className={box}
                >
                  <option value="">—</option>
                  {people.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {personLabel(p)}
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
                  {["Petronas", "Shell", "Petron", "Caltex", "BHP"].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
              <Row label="Fleet card number" ro={ro} show={form.card_no}>
                <input
                  value={form.card_no}
                  onChange={set("card_no")}
                  maxLength={40}
                  placeholder="Once the card is awarded"
                  className={box}
                />
              </Row>
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

        {/* Check list */}
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
                  {CARD_CHECKLIST.filter((i) => i.group === group).map((i) => {
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
                  })}
                  {group === "Driver" && (
                    <div className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="h-5 w-5" />
                      <span className="flex-1 text-slate-800">
                        Licence expiry date
                      </span>
                      {ro ? (
                        <span className="text-xs text-slate-700">
                          {form.licence_expiry ? day(form.licence_expiry) : "—"}
                          {licence != null && licence < 0 && (
                            <Badge color="red" className="ml-2">
                              Expired
                            </Badge>
                          )}
                          {licence != null && licence >= 0 && licence <= 60 && (
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
      </div>

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
                    <span className="flex-1" />
                    <span className="font-medium text-emerald-600">
                      + {money(r.amount)}
                    </span>
                    {access.can("cards", "delete") && (
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
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
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
