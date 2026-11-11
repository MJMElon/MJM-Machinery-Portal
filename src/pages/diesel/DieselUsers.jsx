import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Badge, Card } from "../../components/ui.jsx";
import { IconX } from "../../components/icons.jsx";
import {
  Empty,
  ErrorBox,
  Loading,
  inputCls,
} from "../../components/diesel/shared.jsx";
import { listPortalPeople, userLabel } from "../../lib/cmms.js";
import {
  approveFor,
  has,
  listCompanyPerms,
  savePerms,
} from "../../lib/perms.js";
import { useAuth } from "../../auth/AuthContext.jsx";

// Fuel Manage → User setting: for every person in the company, who reviews
// and approves their fuel claims. Choosing an approver for a person gives that
// approver the "approve claims" right (if they do not have it yet) and puts
// the person on the approver's list. The same data as Settings → Role setup
// (claims → approve → names), seen from the claimant's side.
export default function DieselUsers() {
  const { company, access } = useOutletContext();
  const { isSuperAdmin } = useAuth();
  const [people, setPeople] = useState([]);
  const [perms, setPerms] = useState({}); // user_id → perms
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const [pp, rows] = await Promise.all([
        listPortalPeople(),
        listCompanyPerms(company.id),
      ]);
      const byUser = Object.fromEntries(
        rows.map((r) => [r.user_id, r.perms || {}]),
      );
      setPerms(byUser);
      // People of this company: Fuel icon in the Intranet, or any role here, or named as an approver / claimant
      const named = new Set(rows.flatMap((r) => approveFor(r.perms)));
      setPeople(
        pp.filter(
          (p) =>
            p.is_super_admin ||
            p.intranet_fuel ||
            Object.keys(byUser[p.user_id] || {}).length ||
            named.has(p.user_id),
        ),
      );
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    load();
  }, [load]);

  // approvers of a claimant = everyone whose approve_for names them
  const approversOf = (uid) =>
    people.filter(
      (a) =>
        a.user_id !== uid &&
        has(perms[a.user_id], "claims", "approve") &&
        approveFor(perms[a.user_id]).includes(uid),
    );
  const canEdit = isSuperAdmin || access.admin;

  async function change(approverId, claimantId, add) {
    setBusy(`${approverId}:${claimantId}`);
    setError("");
    try {
      const cur = perms[approverId] || {};
      const claims = new Set(cur.claims || []);
      claims.add("view");
      claims.add("approve");
      const list = new Set(approveFor(cur));
      if (add) list.add(claimantId);
      else list.delete(claimantId);
      const next = { ...cur, claims: [...claims], approve_for: [...list] };
      await savePerms(company.id, approverId, next);
      setPerms((p) => ({ ...p, [approverId]: next }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const t = q.trim().toLowerCase();
  const shown = people.filter(
    (p) =>
      !t ||
      [p.full_name, p.email].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(t),
      ),
  );

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-800">Fuel claim approval</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name…"
            className={`${inputCls} h-10 sm:w-72`}
          />
        </div>
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>
            No users yet. Users come from the MJM Intranet (Settings → Sync from
            MJM Intranet).
          </Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-72 px-5 py-2.5">User</th>
                <th className="px-3 py-2.5">Claims reviewed and approved by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((p) => {
                const approvers = approversOf(p.user_id);
                const options = people.filter(
                  (a) =>
                    a.user_id !== p.user_id &&
                    !approvers.some((x) => x.user_id === a.user_id),
                );
                return (
                  <tr key={p.user_id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">
                        {userLabel(p)}
                      </p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                      {p.is_super_admin && (
                        <Badge className="mt-1">Super admin</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {approvers.length === 0 && (
                          <span className="text-sm text-slate-400">
                            {p.is_super_admin
                              ? "Super admins review every claim"
                              : "No approver yet"}
                          </span>
                        )}
                        {approvers.map((a) => (
                          <span
                            key={a.user_id}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-light pl-3 pr-1.5 text-sm font-medium text-brand-dark"
                          >
                            {userLabel(a)}
                            {canEdit && (
                              <button
                                type="button"
                                disabled={busy === `${a.user_id}:${p.user_id}`}
                                onClick={() =>
                                  change(a.user_id, p.user_id, false)
                                }
                                className="rounded-full p-0.5 hover:bg-white/60"
                                aria-label={`Remove ${userLabel(a)}`}
                              >
                                <IconX width={14} height={14} />
                              </button>
                            )}
                          </span>
                        ))}
                        {canEdit && options.length > 0 && (
                          <span className="w-56">
                            <select
                              value=""
                              onChange={(e) =>
                                e.target.value &&
                                change(e.target.value, p.user_id, true)
                              }
                              disabled={busy.endsWith(`:${p.user_id}`)}
                              className={`${inputCls} h-8 w-auto px-2 text-xs`}
                            >
                              <option value="">+ Add approver…</option>
                              {options.map((a) => (
                                <option key={a.user_id} value={a.user_id}>
                                  {userLabel(a)}
                                </option>
                              ))}
                            </select>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {!canEdit && (
        <p className="text-xs text-slate-500">
          Only super admins and claim approvers can change this.
        </p>
      )}
    </div>
  );
}
