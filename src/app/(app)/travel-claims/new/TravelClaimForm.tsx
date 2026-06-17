"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  RATES,
  TRAVEL_TYPES,
  computeTotals,
  eachDate,
  formatMoney,
  type TravelClaimInput,
} from "@/lib/claims/schema";
import { submitTravelClaim, type SubmitState } from "../actions";

type TransportRow = TravelClaimInput["transport"][number];
type KmRow = TravelClaimInput["km"][number];
type MealRow = TravelClaimInput["meals"][number];
type OtherRow = TravelClaimInput["other"][number];

const emptyMealRow = (date: string): MealRow => ({
  date,
  breakfast: false,
  lunch: false,
  supper: false,
  incidentals: false,
});

export function TravelClaimForm({
  defaultName,
  defaultEmail,
}: {
  defaultName: string;
  defaultEmail: string;
}) {
  const [purpose, setPurpose] = useState("");
  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [travelType, setTravelType] =
    useState<(typeof TRAVEL_TYPES)[number] | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [airfare, setAirfare] = useState({
    origin: "",
    destination: "",
    amount: "",
  });
  const [hotel, setHotel] = useState({
    checkIn: "",
    checkOut: "",
    total: "",
  });

  const [transport, setTransport] = useState<TransportRow[]>([]);
  const [km, setKm] = useState<KmRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [other, setOther] = useState<OtherRow[]>([]);
  const [notes, setNotes] = useState("");
  const [receipts, setReceipts] = useState<File[]>([]);

  const [state, setState] = useState<SubmitState | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  // Auto-generate meal rows when dates change.
  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setMeals([]);
      return;
    }
    const dates = eachDate(startDate, endDate);
    setMeals((prev) => {
      const byDate = new Map(prev.map((m) => [m.date, m]));
      return dates.map((d) => byDate.get(d) ?? emptyMealRow(d));
    });
  }, [startDate, endDate]);

  const claim = useMemo<TravelClaimInput>(
    () => ({
      purpose,
      fullName,
      email,
      travelType: (travelType || "Meeting") as (typeof TRAVEL_TYPES)[number],
      startDate: startDate || "1970-01-01",
      endDate: endDate || startDate || "1970-01-01",
      airfare: {
        origin: airfare.origin,
        destination: airfare.destination,
        amount: parseFloat(airfare.amount || "0") || 0,
      },
      hotel: {
        checkIn: hotel.checkIn,
        checkOut: hotel.checkOut,
        total: parseFloat(hotel.total || "0") || 0,
      },
      transport,
      km,
      meals,
      other,
      notes,
    }),
    [
      purpose,
      fullName,
      email,
      travelType,
      startDate,
      endDate,
      airfare,
      hotel,
      transport,
      km,
      meals,
      other,
      notes,
    ],
  );

  const totals = computeTotals(claim);

  function addTransport() {
    setTransport((rs) => [
      ...rs,
      { date: startDate || "", origin: "", destination: "", amount: 0 },
    ]);
  }
  function addKm() {
    setKm((rs) => [
      ...rs,
      { date: startDate || "", origin: "", destination: "", km: 0 },
    ]);
  }
  function addOther() {
    setOther((rs) => [
      ...rs,
      { date: startDate || "", description: "", amount: 0 },
    ]);
  }

  function toggleColumn(type: keyof Omit<MealRow, "date">, checked: boolean) {
    setMeals((ms) => ms.map((m) => ({ ...m, [type]: checked })));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || !purpose || !fullName || !email || !travelType) {
      setState({
        ok: false,
        error: "Please fill in all required trip details.",
      });
      return;
    }
    const fd = new FormData();
    fd.append("payload", JSON.stringify(claim));
    for (const f of receipts) fd.append("receipts", f);
    startTransition(async () => {
      const res = await submitTravelClaim(undefined, fd);
      setState(res);
    });
  }

  const totalReceiptBytes = receipts.reduce((s, f) => s + f.size, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Trip info */}
      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Trip Details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="hl-label">Purpose of trip *</label>
            <input
              className="hl-input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="hl-label">Full name *</label>
            <input
              className="hl-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="hl-label">Email *</label>
            <input
              type="email"
              className="hl-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="hl-label">Travel type *</label>
            <select
              className="hl-input"
              value={travelType}
              onChange={(e) =>
                setTravelType(
                  e.target.value as (typeof TRAVEL_TYPES)[number] | "",
                )
              }
              required
            >
              <option value="">Select…</option>
              {TRAVEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="hl-label">Start date *</label>
              <input
                type="date"
                className="hl-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="hl-label">End date *</label>
              <input
                type="date"
                className="hl-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
        </div>
      </section>

      {/* Airfare */}
      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Airfare
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="hl-label">Origin</label>
            <input
              className="hl-input"
              value={airfare.origin}
              onChange={(e) =>
                setAirfare((a) => ({ ...a, origin: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="hl-label">Destination</label>
            <input
              className="hl-input"
              value={airfare.destination}
              onChange={(e) =>
                setAirfare((a) => ({ ...a, destination: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="hl-label">Amount (CAD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="hl-input"
              value={airfare.amount}
              onChange={(e) =>
                setAirfare((a) => ({ ...a, amount: e.target.value }))
              }
            />
          </div>
        </div>
      </section>

      {/* Hotel */}
      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Hotel
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="hl-label">Check-in</label>
            <input
              type="date"
              className="hl-input"
              value={hotel.checkIn}
              onChange={(e) =>
                setHotel((h) => ({ ...h, checkIn: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="hl-label">Check-out</label>
            <input
              type="date"
              className="hl-input"
              value={hotel.checkOut}
              onChange={(e) =>
                setHotel((h) => ({ ...h, checkOut: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="hl-label">Total (CAD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="hl-input"
              value={hotel.total}
              onChange={(e) =>
                setHotel((h) => ({ ...h, total: e.target.value }))
              }
            />
          </div>
        </div>
      </section>

      {/* Ground transport */}
      <section className="hl-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-hl-green-700">
            Ground Transportation
          </h2>
          <button
            type="button"
            onClick={addTransport}
            className="hl-btn-secondary"
          >
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>
        {transport.length === 0 ? (
          <EmptyHint text="No transportation entries. Click Add row to include taxis, transit, etc." />
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th className="text-right">Amount (CAD)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transport.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="date"
                        className="hl-input"
                        value={r.date}
                        onChange={(e) =>
                          setTransport((rs) =>
                            rs.map((x, j) =>
                              j === i ? { ...x, date: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hl-input"
                        value={r.origin}
                        onChange={(e) =>
                          setTransport((rs) =>
                            rs.map((x, j) =>
                              j === i ? { ...x, origin: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hl-input"
                        value={r.destination}
                        onChange={(e) =>
                          setTransport((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? { ...x, destination: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="hl-input text-right"
                        value={r.amount === 0 ? "" : r.amount}
                        onChange={(e) =>
                          setTransport((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    amount:
                                      parseFloat(e.target.value || "0") || 0,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setTransport((rs) => rs.filter((_, j) => j !== i))
                        }
                        className="hl-btn-ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* KM */}
      <section className="hl-card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-hl-green-700">
            Personal Vehicle
          </h2>
          <button type="button" onClick={addKm} className="hl-btn-secondary">
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>
        <p className="mb-4 text-sm text-hl-muted">
          Reimbursed at {formatMoney(RATES.kmRate)} / km.
        </p>
        {km.length === 0 ? (
          <EmptyHint text="No personal vehicle entries." />
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th className="text-right">KM</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {km.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="date"
                        className="hl-input"
                        value={r.date}
                        onChange={(e) =>
                          setKm((rs) =>
                            rs.map((x, j) =>
                              j === i ? { ...x, date: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hl-input"
                        value={r.origin}
                        onChange={(e) =>
                          setKm((rs) =>
                            rs.map((x, j) =>
                              j === i ? { ...x, origin: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hl-input"
                        value={r.destination}
                        onChange={(e) =>
                          setKm((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? { ...x, destination: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className="hl-input text-right"
                        value={r.km === 0 ? "" : r.km}
                        onChange={(e) =>
                          setKm((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    km: parseFloat(e.target.value || "0") || 0,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMoney(r.km * RATES.kmRate)}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setKm((rs) => rs.filter((_, j) => j !== i))
                        }
                        className="hl-btn-ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Meals */}
      <section className="hl-card p-6">
        <h2 className="font-serif text-xl font-semibold text-hl-green-700">
          Meals & Incidentals
        </h2>
        <p className="mb-4 text-sm text-hl-muted">
          Breakfast {formatMoney(RATES.breakfast)} (travelling before 8:00 AM),
          lunch {formatMoney(RATES.lunch)} (between 11:30 AM and 1:30 PM),
          supper {formatMoney(RATES.supper)} (after 5:30 PM), incidentals{" "}
          {formatMoney(RATES.incidentals)}.
        </p>
        {meals.length === 0 ? (
          <EmptyHint text="Choose travel start and end dates to populate the meal grid." />
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {(["breakfast", "lunch", "supper", "incidentals"] as const).map(
                    (k) => (
                      <th key={k} className="text-center capitalize">
                        <label className="flex flex-col items-center gap-1">
                          <span>{k}</span>
                          <input
                            type="checkbox"
                            onChange={(e) => toggleColumn(k, e.target.checked)}
                            aria-label={`Toggle all ${k}`}
                          />
                        </label>
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {meals.map((m, i) => (
                  <tr key={m.date}>
                    <td>{m.date}</td>
                    {(["breakfast", "lunch", "supper", "incidentals"] as const).map(
                      (k) => (
                        <td key={k} className="text-center">
                          <input
                            type="checkbox"
                            checked={m[k]}
                            onChange={(e) =>
                              setMeals((ms) =>
                                ms.map((x, j) =>
                                  j === i ? { ...x, [k]: e.target.checked } : x,
                                ),
                              )
                            }
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Other */}
      <section className="hl-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-hl-green-700">
            Other Expenses
          </h2>
          <button type="button" onClick={addOther} className="hl-btn-secondary">
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>
        {other.length === 0 ? (
          <EmptyHint text="No other expenses." />
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="text-right">Amount (CAD)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {other.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="date"
                        className="hl-input"
                        value={r.date}
                        onChange={(e) =>
                          setOther((rs) =>
                            rs.map((x, j) =>
                              j === i ? { ...x, date: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hl-input"
                        value={r.description}
                        onChange={(e) =>
                          setOther((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="hl-input text-right"
                        value={r.amount === 0 ? "" : r.amount}
                        onChange={(e) =>
                          setOther((rs) =>
                            rs.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    amount:
                                      parseFloat(e.target.value || "0") || 0,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setOther((rs) => rs.filter((_, j) => j !== i))
                        }
                        className="hl-btn-ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notes & Receipts */}
      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Notes & Receipts
        </h2>
        <div className="mb-4">
          <label className="hl-label">Notes (optional)</label>
          <textarea
            className="hl-input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything finance should know about this claim…"
          />
        </div>
        <div>
          <label className="hl-label">Attach receipts (optional)</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-hl-border bg-hl-cream px-4 py-6 text-sm text-hl-muted transition hover:border-hl-green-600 hover:text-hl-ink">
            <Upload className="h-5 w-5" />
            <span>
              Click to add PDF or image files. Max 8 MB per file, 20 MB total.
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              accept="application/pdf,image/*"
              onChange={(e) =>
                setReceipts((prev) => [
                  ...prev,
                  ...Array.from(e.target.files ?? []),
                ])
              }
            />
          </label>
          {receipts.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {receipts.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded border border-hl-border bg-white px-3 py-1.5"
                >
                  <span className="truncate">
                    {f.name}{" "}
                    <span className="text-hl-muted">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setReceipts((rs) => rs.filter((_, j) => j !== i))
                    }
                    className="hl-btn-ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              <li className="text-xs text-hl-muted">
                Total: {(totalReceiptBytes / 1024).toFixed(0)} KB
              </li>
            </ul>
          ) : null}
        </div>
      </section>

      {/* Totals + submit */}
      <section className="hl-card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold text-hl-green-700">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm md:grid-cols-3">
          <SummaryRow label="Airfare" value={totals.airfare} />
          <SummaryRow label="Hotel" value={totals.hotel} />
          <SummaryRow label="Ground transport" value={totals.transport} />
          <SummaryRow label="Personal vehicle" value={totals.km} />
          <SummaryRow label="Meals" value={totals.meals} />
          <SummaryRow label="Other" value={totals.other} />
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-hl-border pt-4">
          <span className="text-sm uppercase tracking-wider text-hl-muted">
            Grand Total
          </span>
          <span className="font-serif text-2xl font-semibold text-hl-green-700">
            {formatMoney(totals.grandTotal)}
          </span>
        </div>

        {state?.error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="submit"
            disabled={pending}
            className="hl-btn-primary"
          >
            {pending ? "Submitting…" : "Submit Claim"}
          </button>
        </div>
      </section>
    </form>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-hl-border bg-hl-cream/60 px-4 py-6 text-center text-sm text-hl-muted">
      {text}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-hl-muted">{label}</dt>
      <dd className="text-right tabular-nums md:col-span-2 md:text-left">
        {formatMoney(value)}
      </dd>
    </>
  );
}
