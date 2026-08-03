import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  integer,
  boolean,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------- NextAuth tables (Drizzle adapter) ----------
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------- Travel claims ----------
export const travelClaims = pgTable("travel_claim", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Snapshot of submitter info at time of submission
  submitterName: text("submitter_name").notNull(),
  submitterEmail: text("submitter_email").notNull(),
  purpose: text("purpose").notNull(),
  travelType: text("travel_type").notNull(),
  startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
  endDate: text("end_date").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  // Full structured claim data (line items, meals, etc.)
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("submitted"), // submitted | emailed | failed | cancelled
  emailMessageId: text("email_message_id"),
  emailError: text("email_error"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type TravelClaim = typeof travelClaims.$inferSelect;
export type NewTravelClaim = typeof travelClaims.$inferInsert;

// ---------- Leave (vacation / sick days) ----------
export const leaveRequests = pgTable(
  "leave_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Canonical employee address: aliases are resolved before insert so one
     * person always draws down a single balance.
     */
    employeeEmail: text("employee_email").notNull(),
    employeeName: text("employee_name").notNull(),
    leaveType: text("leave_type").notNull(), // vacation | sick
    startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
    endDate: text("end_date").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    /** Chargeable working days, excluding weekends and paid holidays. */
    dayCount: numeric("day_count", { precision: 4, scale: 1 }).notNull(),
    /** Calendar year the entitlement is drawn from. */
    leaveYear: integer("leave_year").notNull(),
    reason: text("reason"),
    // pending | approved | declined | recorded | cancelled
    status: text("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    emailMessageId: text("email_message_id"),
    emailError: text("email_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Balance lookups are always scoped to one employee and year.
    index("leave_request_employee_year_idx").on(t.employeeEmail, t.leaveYear),
  ],
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
