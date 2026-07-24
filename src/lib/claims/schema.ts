import { z } from "zod";

export const RATES = {
  breakfast: 21.0,
  lunch: 27.0,
  supper: 47.0,
  incidentals: 20.0,
  kmRate: 0.605,
  /** Flat allowance per night when staying with a private host, paid to the claimant. */
  privateHostPerNight: 80.0,
} as const;

export const TRAVEL_TYPES = [
  "Meeting",
  "Conference",
  "Training",
  "Project Work",
  "Other",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const money = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? parseFloat(v || "0") : v))
  .pipe(z.number().min(0).max(1_000_000));

const optMoney = z
  .union([z.string(), z.number(), z.literal("")])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return 0;
    return typeof v === "string" ? parseFloat(v || "0") : v;
  })
  .pipe(z.number().min(0).max(1_000_000));

export const airfareSchema = z.object({
  origin: z.string().trim().optional().default(""),
  destination: z.string().trim().optional().default(""),
  amount: optMoney.default(0),
});

export const hotelSchema = z.object({
  checkIn: z.string().optional().default(""),
  checkOut: z.string().optional().default(""),
  total: optMoney.default(0),
});

/**
 * Staying with a private host instead of a hotel. Reimbursed to the claimant at
 * a flat nightly rate, so the amount is derived from the dates rather than typed
 * in — see countNights / computeTotals.
 */
export const privateHostSchema = z.object({
  hostName: z.string().trim().max(200).optional().default(""),
  hostEmail: z.string().trim().max(200).optional().default(""),
  hostAddress: z.string().trim().max(500).optional().default(""),
  checkIn: z.string().optional().default(""),
  checkOut: z.string().optional().default(""),
});

export const transportEntrySchema = z.object({
  date: isoDate,
  origin: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  amount: money,
});

export const kmEntrySchema = z.object({
  date: isoDate,
  origin: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  km: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? parseFloat(v || "0") : v))
    .pipe(z.number().min(0).max(100_000)),
});

export const mealRowSchema = z.object({
  date: isoDate,
  breakfast: z.boolean().default(false),
  lunch: z.boolean().default(false),
  supper: z.boolean().default(false),
  incidentals: z.boolean().default(false),
});

export const otherEntrySchema = z.object({
  date: isoDate,
  description: z.string().trim().min(1),
  amount: money,
});

export const travelClaimSchema = z
  .object({
    purpose: z.string().trim().min(1, "Purpose is required"),
    fullName: z.string().trim().min(1, "Full name is required"),
    email: z.string().trim().email("Valid email required"),
    travelType: z.enum(TRAVEL_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    airfare: airfareSchema,
    hotel: hotelSchema,
    // Absent on claims submitted before private host lodging existed.
    privateHost: privateHostSchema.default({}),
    transport: z.array(transportEntrySchema).default([]),
    km: z.array(kmEntrySchema).default([]),
    meals: z.array(mealRowSchema).default([]),
    other: z.array(otherEntrySchema).default([]),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  })
  .superRefine((d, ctx) => {
    const { checkIn, checkOut, hostName, hostEmail, hostAddress } =
      d.privateHost;
    if (!checkIn && !checkOut && !hostName && !hostEmail && !hostAddress) {
      return;
    }

    if (!checkIn || !checkOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Both private host arrival and departure dates are required",
        path: ["privateHost", checkIn ? "checkOut" : "checkIn"],
      });
      return;
    }
    if (countNights(checkIn, checkOut) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Departure must be at least one night after arrival",
        path: ["privateHost", "checkOut"],
      });
    }
    if (!hostName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Host name is required",
        path: ["privateHost", "hostName"],
      });
    }
    if (!hostAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Host address is required",
        path: ["privateHost", "hostAddress"],
      });
    }
    if (!hostEmail || !z.string().email().safeParse(hostEmail).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid host email is required",
        path: ["privateHost", "hostEmail"],
      });
    }
  });

export type TravelClaimInput = z.infer<typeof travelClaimSchema>;

export type ClaimTotals = {
  airfare: number;
  hotel: number;
  privateHost: number;
  privateHostNights: number;
  transport: number;
  km: number;
  meals: number;
  other: number;
  grandTotal: number;
};

/** Whole nights between two ISO dates; 0 when either is missing or out of order. */
export function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

export function computeTotals(c: TravelClaimInput): ClaimTotals {
  const airfare = c.airfare.amount || 0;
  const hotel = c.hotel.total || 0;
  // Derived from the dates, never taken from the client, so it can't be inflated.
  const privateHostNights = countNights(
    c.privateHost?.checkIn ?? "",
    c.privateHost?.checkOut ?? "",
  );
  const privateHost = privateHostNights * RATES.privateHostPerNight;
  const transport = c.transport.reduce((s, e) => s + (e.amount || 0), 0);
  const km = c.km.reduce((s, e) => s + (e.km || 0) * RATES.kmRate, 0);
  const meals = c.meals.reduce(
    (s, m) =>
      s +
      (m.breakfast ? RATES.breakfast : 0) +
      (m.lunch ? RATES.lunch : 0) +
      (m.supper ? RATES.supper : 0) +
      (m.incidentals ? RATES.incidentals : 0),
    0,
  );
  const other = c.other.reduce((s, e) => s + (e.amount || 0), 0);
  const grandTotal =
    airfare + hotel + privateHost + transport + km + meals + other;
  return {
    airfare: round2(airfare),
    hotel: round2(hotel),
    privateHost: round2(privateHost),
    privateHostNights,
    transport: round2(transport),
    km: round2(km),
    meals: round2(meals),
    other: round2(other),
    grandTotal: round2(grandTotal),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

export function eachDate(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
