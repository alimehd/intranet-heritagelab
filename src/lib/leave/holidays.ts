import {
  addDays,
  easterSunday,
  eachDay,
  isSupportedYear,
  isWeekend,
  lastWeekdayBefore,
  makeISO,
  nextMondayOnOrAfter,
  nthWeekdayOfMonth,
} from "./dates";

export type Holiday = {
  date: string;
  name: string;
  /**
   * Set when the statutory date fell on a weekend and the day off moves to the
   * following Monday, so the UI can explain why the dates differ.
   */
  observedFor?: string;
};

/**
 * Heritage Lab's paid holidays, transcribed from the employee calendar
 * (Employee Calendar - Shaun Annanack.xlsx) and expressed as rules so any year
 * can be generated rather than hand-maintained.
 *
 * The office also closes Dec 22 – Jan 2; see CHRISTMAS_CLOSURE below.
 */
const HOLIDAY_RULES: {
  name: string;
  /** Returns the statutory date, before any weekend shift. */
  date: (year: number) => string;
  /** Fixed-date holidays move to Monday when they land on a weekend. */
  shiftsOffWeekend: boolean;
}[] = [
  {
    name: "Good Friday",
    date: (y) => addDays(easterSunday(y), -2),
    shiftsOffWeekend: false,
  },
  {
    name: "Easter Monday",
    date: (y) => addDays(easterSunday(y), 1),
    shiftsOffWeekend: false,
  },
  {
    name: "Victoria Day",
    date: (y) => lastWeekdayBefore(y, 5, 25, 1),
    shiftsOffWeekend: false,
  },
  {
    name: "National Indigenous Peoples Day",
    date: (y) => makeISO(y, 6, 21),
    shiftsOffWeekend: true,
  },
  {
    name: "Saint-Jean-Baptiste Day",
    date: (y) => makeISO(y, 6, 24),
    shiftsOffWeekend: true,
  },
  {
    name: "Canada Day",
    date: (y) => makeISO(y, 7, 1),
    shiftsOffWeekend: true,
  },
  {
    name: "Labour Day",
    date: (y) => nthWeekdayOfMonth(y, 9, 1, 1),
    shiftsOffWeekend: false,
  },
  {
    name: "National Day for Truth and Reconciliation",
    date: (y) => makeISO(y, 9, 30),
    shiftsOffWeekend: true,
  },
  {
    name: "Thanksgiving Day",
    date: (y) => nthWeekdayOfMonth(y, 10, 1, 2),
    shiftsOffWeekend: false,
  },
  {
    name: "JBNQA Day",
    date: (y) => makeISO(y, 11, 11),
    shiftsOffWeekend: true,
  },
];

const CHRISTMAS_CLOSURE_NAME = "Christmas Holidays";

/**
 * The office closes Dec 22 through Jan 2. Within a single calendar year that
 * shows up as two spans: the tail of the previous year's closure in January,
 * and the start of this year's in December.
 */
function christmasClosure(year: number): Holiday[] {
  const spans = [
    [makeISO(year, 1, 1), makeISO(year, 1, 2)],
    [makeISO(year, 12, 22), makeISO(year, 12, 31)],
  ];

  return spans
    .flatMap(([start, end]) => eachDay(start, end))
    // Weekends inside the closure are not extra days off.
    .filter((date) => !isWeekend(date))
    .map((date) => ({ date, name: CHRISTMAS_CLOSURE_NAME }));
}

/** Every paid holiday falling in the given calendar year, sorted by date. */
export function getHolidays(year: number): Holiday[] {
  // The rules do arithmetic on constructed dates, which only works for years
  // the Date constructor accepts. Callers can pass a year straight from user
  // input, so refuse rather than build invalid dates.
  if (!isSupportedYear(year)) return [];

  const fromRules = HOLIDAY_RULES.map(({ name, date, shiftsOffWeekend }) => {
    const statutory = date(year);
    if (!shiftsOffWeekend || !isWeekend(statutory)) {
      return { date: statutory, name };
    }
    return {
      date: nextMondayOnOrAfter(statutory),
      name: `${name} (observed)`,
      observedFor: statutory,
    };
  });

  return [...fromRules, ...christmasClosure(year)].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** Date-keyed lookup, for counting working days across a range. */
export function getHolidayMap(year: number): Map<string, Holiday> {
  return new Map(getHolidays(year).map((h) => [h.date, h]));
}

export type HolidayPeriod = {
  name: string;
  start: string;
  end: string;
  /** Working days the office is closed for this period. */
  days: number;
  observedFor?: string;
};

/**
 * Groups consecutive working days sharing a name into a single period, so the
 * Christmas closure reads as one range instead of nine separate rows.
 */
export function getHolidayPeriods(year: number): HolidayPeriod[] {
  const periods: HolidayPeriod[] = [];

  for (const holiday of getHolidays(year)) {
    const last = periods[periods.length - 1];
    const isContinuation =
      last &&
      last.name === holiday.name &&
      // Bridge intervening weekend days so Fri→Mon counts as consecutive.
      eachDay(addDays(last.end, 1), addDays(holiday.date, -1)).every(isWeekend);

    if (isContinuation) {
      last.end = holiday.date;
      last.days += 1;
    } else {
      periods.push({
        name: holiday.name,
        start: holiday.date,
        end: holiday.date,
        days: 1,
        observedFor: holiday.observedFor,
      });
    }
  }

  return periods;
}
