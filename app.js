const STORAGE_KEYS = {
  shifts: "shift-tracker-shifts",
  settings: "shift-tracker-settings",
};

const DEFAULT_SETTINGS = {
  hourlyRate: 13.5,
  overtimeMultiplier: 1.5,
  mealPenaltyMultiplier: 0.5,
  overtimeThresholdPerDay: 8,
};

const HOURS_MS = 60 * 60 * 1000;
const DAYS_MS = 24 * HOURS_MS;
const PAY_PERIOD_LENGTH_DAYS = 14;
const REFERENCE_PERIOD_END = "2026-04-19";

const state = {
  shifts: loadShifts(),
  settings: loadSettings(),
  activePeriodEnd: getBiweeklyPeriodEnd(new Date()),
  editingShiftId: null,
};

const elements = {
  weekRange: document.getElementById("weekRange"),
  weeklyHours: document.getElementById("weeklyHours"),
  weeklyGrossPay: document.getElementById("weeklyGrossPay"),
  shiftCount: document.getElementById("shiftCount"),
  shiftList: document.getElementById("shiftList"),
  emptyState: document.getElementById("emptyState"),
  shiftsHeading: document.getElementById("shiftsHeading"),
  settingsForm: document.getElementById("settingsForm"),
  shiftForm: document.getElementById("shiftForm"),
  shiftSheetBackdrop: document.getElementById("shiftSheetBackdrop"),
  shiftSheetTitle: document.getElementById("shiftSheetTitle"),
  breakFields: document.getElementById("breakFields"),
  tookBreak: document.getElementById("tookBreak"),
  formError: document.getElementById("formError"),
  openShiftButton: document.getElementById("openShiftButton"),
  openShiftFab: document.getElementById("openShiftFab"),
  closeSheetButton: document.getElementById("closeSheetButton"),
  cancelShiftButton: document.getElementById("cancelShiftButton"),
  prevWeekButton: document.getElementById("prevWeekButton"),
  nextWeekButton: document.getElementById("nextWeekButton"),
  currentWeekButton: document.getElementById("currentWeekButton"),
};

init();

function init() {
  bindEvents();
  renderSettingsForm();
  render();
}

function bindEvents() {
  elements.openShiftButton.addEventListener("click", () => openShiftSheet());
  elements.openShiftFab.addEventListener("click", () => openShiftSheet());
  elements.closeSheetButton.addEventListener("click", closeShiftSheet);
  elements.cancelShiftButton.addEventListener("click", closeShiftSheet);
  elements.tookBreak.addEventListener("change", toggleBreakFields);

  elements.shiftSheetBackdrop.addEventListener("click", (event) => {
    if (event.target === elements.shiftSheetBackdrop) {
      closeShiftSheet();
    }
  });

  elements.shiftForm.addEventListener("submit", handleShiftSubmit);
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.shiftList.addEventListener("click", handleShiftListClick);

  elements.prevWeekButton.addEventListener("click", () => {
    state.activePeriodEnd = addDays(state.activePeriodEnd, -PAY_PERIOD_LENGTH_DAYS);
    render();
  });

  elements.nextWeekButton.addEventListener("click", () => {
    state.activePeriodEnd = addDays(state.activePeriodEnd, PAY_PERIOD_LENGTH_DAYS);
    render();
  });

  elements.currentWeekButton.addEventListener("click", () => {
    state.activePeriodEnd = getBiweeklyPeriodEnd(new Date());
    render();
  });
}

function handleSettingsSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const nextSettings = {
    hourlyRate: parseNumericField(formData.get("hourlyRate"), "Hourly rate"),
    overtimeMultiplier: parseNumericField(formData.get("overtimeMultiplier"), "Overtime multiplier"),
    mealPenaltyMultiplier: parseNumericField(formData.get("mealPenaltyMultiplier"), "Meal penalty multiplier"),
    overtimeThresholdPerDay: parseNumericField(formData.get("overtimeThresholdPerDay"), "Daily overtime threshold"),
  };

  state.settings = nextSettings;
  saveSettings();
  render();
}

function handleShiftSubmit(event) {
  event.preventDefault();
  clearFormError();

  try {
    const formData = new FormData(event.currentTarget);
    const shift = {
      id: formData.get("shiftId") || createId(),
      date: String(formData.get("date") || "").trim(),
      clockIn: String(formData.get("clockIn") || "").trim(),
      clockOut: String(formData.get("clockOut") || "").trim(),
      tookBreak: elements.tookBreak.checked,
      breakIn: "",
      breakOut: "",
    };

    if (!shift.date || !shift.clockIn || !shift.clockOut) {
      throw new Error("Date, clock in, and clock out are required.");
    }

    if (shift.tookBreak) {
      shift.breakIn = String(formData.get("breakIn") || "").trim();
      shift.breakOut = String(formData.get("breakOut") || "").trim();

      if (!shift.breakIn || !shift.breakOut) {
        throw new Error("Break in and break out are required when a break is taken.");
      }
    }

    calculateShiftMetrics(shift, state.settings);

    const existingIndex = state.shifts.findIndex((item) => item.id === shift.id);

    if (existingIndex >= 0) {
      state.shifts[existingIndex] = shift;
    } else {
      state.shifts.push(shift);
    }

    saveShifts();
    closeShiftSheet();

    const shiftDate = parseDateOnly(shift.date);
    state.activePeriodEnd = getBiweeklyPeriodEnd(shiftDate);
    render();
  } catch (error) {
    showFormError(error.message);
  }
}

function handleShiftListClick(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const { action, shiftId } = actionButton.dataset;
  const shift = state.shifts.find((item) => item.id === shiftId);

  if (!shift) {
    return;
  }

  if (action === "edit") {
    openShiftSheet(shift);
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this shift?");

    if (!confirmed) {
      return;
    }

    state.shifts = state.shifts.filter((item) => item.id !== shiftId);
    saveShifts();
    render();
  }
}

function openShiftSheet(shift = null) {
  state.editingShiftId = shift ? shift.id : null;
  elements.shiftForm.reset();
  clearFormError();

  if (shift) {
    elements.shiftSheetTitle.textContent = "Edit Shift";
    document.getElementById("shiftId").value = shift.id;
    document.getElementById("date").value = shift.date;
    document.getElementById("clockIn").value = shift.clockIn;
    document.getElementById("clockOut").value = shift.clockOut;
    elements.tookBreak.checked = Boolean(shift.tookBreak);
    document.getElementById("breakIn").value = shift.breakIn || "";
    document.getElementById("breakOut").value = shift.breakOut || "";
  } else {
    elements.shiftSheetTitle.textContent = "Add Shift";
    document.getElementById("shiftId").value = "";
    document.getElementById("date").value = formatDateInput(new Date());
    document.getElementById("clockIn").value = "";
    document.getElementById("clockOut").value = "";
    document.getElementById("breakIn").value = "";
    document.getElementById("breakOut").value = "";
    elements.tookBreak.checked = false;
  }

  toggleBreakFields();
  elements.shiftSheetBackdrop.classList.remove("hidden");
}

function closeShiftSheet() {
  state.editingShiftId = null;
  elements.shiftSheetBackdrop.classList.add("hidden");
  elements.shiftForm.reset();
  clearFormError();
  toggleBreakFields();
}

function toggleBreakFields() {
  const visible = elements.tookBreak.checked;
  elements.breakFields.classList.toggle("hidden", !visible);
}

function render() {
  renderSummary();
  renderShiftList();
}

function renderSettingsForm() {
  document.getElementById("hourlyRate").value = state.settings.hourlyRate.toFixed(2);
  document.getElementById("overtimeMultiplier").value = state.settings.overtimeMultiplier.toFixed(2);
  document.getElementById("mealPenaltyMultiplier").value = state.settings.mealPenaltyMultiplier.toFixed(2);
  document.getElementById("overtimeThresholdPerDay").value = stripTrailingZeros(state.settings.overtimeThresholdPerDay);
}

function renderSummary() {
  const periodEntries = getPayPeriodEntries();
  const totals = periodEntries.reduce(
    (accumulator, entry) => {
      const { metrics } = entry;
      accumulator.workedHours += metrics.workedHours;
      accumulator.grossPay += metrics.grossPay;
      return accumulator;
    },
    { workedHours: 0, grossPay: 0 }
  );

  const periodEnd = state.activePeriodEnd;
  const periodStart = addDays(periodEnd, -(PAY_PERIOD_LENGTH_DAYS - 1));
  const headingLabel = isSameDay(periodEnd, getBiweeklyPeriodEnd(new Date()))
    ? "This Pay Period"
    : "Selected Period";

  elements.weekRange.textContent = formatDateRange(periodStart, periodEnd);
  elements.weeklyHours.textContent = `${formatHours(totals.workedHours)}h`;
  elements.weeklyGrossPay.textContent = formatCurrency(totals.grossPay);
  elements.shiftsHeading.textContent = headingLabel;
  elements.shiftCount.textContent = `${periodEntries.length} ${periodEntries.length === 1 ? "shift" : "shifts"}`;
}

function renderShiftList() {
  const periodEntries = getPayPeriodEntries();

  if (!periodEntries.length) {
    elements.emptyState.classList.remove("hidden");
    elements.shiftList.innerHTML = "";
    return;
  }

  elements.emptyState.classList.add("hidden");

  const markup = periodEntries
    .map(({ shift, metrics }) => {
      const breakText = shift.tookBreak
        ? `${formatTime(shift.breakIn)} to ${formatTime(shift.breakOut)} • ${formatHours(metrics.breakDurationHours)}h`
        : "No break recorded";

      return `
        <article class="shift-card">
          <div class="shift-card-header">
            <div>
              <p class="shift-date">${formatLongDate(shift.date)}</p>
              <p class="shift-time">${formatTime(shift.clockIn)} → ${formatTime(shift.clockOut)}</p>
            </div>
            <p class="shift-stat-value">${formatCurrency(metrics.grossPay)}</p>
          </div>

          <p class="shift-break">Break: ${breakText}</p>

          <div class="shift-stats">
            <div class="shift-stat">
              <p class="shift-stat-label">Worked</p>
              <p class="shift-stat-value">${formatHours(metrics.workedHours)}h</p>
            </div>
            <div class="shift-stat">
              <p class="shift-stat-label">Overtime</p>
              <p class="shift-stat-value">${formatHours(metrics.overtimeHours)}h</p>
            </div>
            <div class="shift-stat">
              <p class="shift-stat-label">Meal Penalty</p>
              <p class="shift-stat-value">${formatHours(metrics.mealPenaltyHours)}h</p>
            </div>
          </div>

          <div class="shift-actions">
            <button class="text-button" type="button" data-action="edit" data-shift-id="${shift.id}">
              Edit
            </button>
            <button class="text-button danger" type="button" data-action="delete" data-shift-id="${shift.id}">
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  elements.shiftList.innerHTML = markup;
}

function getPayPeriodEntries() {
  const periodEnd = state.activePeriodEnd;
  const periodStart = addDays(periodEnd, -(PAY_PERIOD_LENGTH_DAYS - 1));

  return [...state.shifts]
    .filter((shift) => {
      const shiftDate = parseDateOnly(shift.date);
      return shiftDate >= periodStart && shiftDate <= periodEnd;
    })
    .map((shift) => {
      try {
        return { shift, metrics: calculateShiftMetrics(shift, state.settings) };
      } catch (error) {
        console.warn("Skipping invalid shift", shift, error);
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.metrics.shiftStart - left.metrics.shiftStart);
}

function calculateShiftMetrics(shift, settings) {
  const shiftStart = combineDateTime(shift.date, shift.clockIn);
  const shiftEnd = resolveEndDate(shift.date, shift.clockOut, shiftStart);

  if (shiftEnd <= shiftStart) {
    throw new Error("Clock out must be after clock in.");
  }

  let breakDurationMs = 0;

  if (shift.tookBreak) {
    const breakStart = resolveBreakStart(shift.date, shift.breakIn, shiftStart);
    const breakEnd = resolveBreakEnd(shift.date, shift.breakOut, shiftStart, breakStart);

    if (breakStart < shiftStart || breakStart >= shiftEnd) {
      throw new Error("Break in must fall inside the shift.");
    }

    if (breakEnd <= breakStart || breakEnd > shiftEnd) {
      throw new Error("Break out must be after break in and inside the shift.");
    }

    breakDurationMs = breakEnd - breakStart;
  }

  const totalDurationMs = shiftEnd - shiftStart;

  if (breakDurationMs >= totalDurationMs) {
    throw new Error("Break duration cannot be longer than the shift.");
  }

  const workedHours = (totalDurationMs - breakDurationMs) / HOURS_MS;
  const regularHours = Math.min(workedHours, settings.overtimeThresholdPerDay);
  const overtimeHours = Math.max(0, workedHours - settings.overtimeThresholdPerDay);
  const mealPenaltyHours = workedHours > 6 && !shift.tookBreak ? 0.5 : 0;

  const regularPay = regularHours * settings.hourlyRate;
  const overtimePay = overtimeHours * settings.hourlyRate * settings.overtimeMultiplier;
  const mealPay = mealPenaltyHours * settings.hourlyRate * settings.mealPenaltyMultiplier;
  const grossPay = regularPay + overtimePay + mealPay;

  return {
    shiftStart,
    shiftEnd,
    totalDurationHours: totalDurationMs / HOURS_MS,
    breakDurationHours: breakDurationMs / HOURS_MS,
    workedHours,
    regularHours,
    overtimeHours,
    mealPenaltyHours,
    regularPay,
    overtimePay,
    mealPay,
    grossPay,
  };
}

function loadShifts() {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEYS.shifts);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: item.id || createId(),
        date: String(item.date || ""),
        clockIn: String(item.clockIn || ""),
        clockOut: String(item.clockOut || ""),
        tookBreak: Boolean(item.tookBreak),
        breakIn: String(item.breakIn || ""),
        breakOut: String(item.breakOut || ""),
      }));
  } catch (error) {
    console.error("Unable to load shifts", error);
    return [];
  }
}

function loadSettings() {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEYS.settings);

    if (!rawValue) {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(DEFAULT_SETTINGS));
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(rawValue);

    return {
      hourlyRate: coerceNumber(parsed.hourlyRate, DEFAULT_SETTINGS.hourlyRate),
      overtimeMultiplier: coerceNumber(parsed.overtimeMultiplier, DEFAULT_SETTINGS.overtimeMultiplier),
      mealPenaltyMultiplier: coerceNumber(parsed.mealPenaltyMultiplier, DEFAULT_SETTINGS.mealPenaltyMultiplier),
      overtimeThresholdPerDay: coerceNumber(parsed.overtimeThresholdPerDay, DEFAULT_SETTINGS.overtimeThresholdPerDay),
    };
  } catch (error) {
    console.error("Unable to load settings", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveShifts() {
  localStorage.setItem(STORAGE_KEYS.shifts, JSON.stringify(state.shifts));
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  renderSettingsForm();
}

function parseNumericField(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a valid positive number.`);
  }

  return parsed;
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function combineDateTime(dateString, timeString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hours, minutes] = timeString.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function resolveEndDate(dateString, timeString, shiftStart) {
  let dateTime = combineDateTime(dateString, timeString);

  if (dateTime <= shiftStart) {
    dateTime = addDays(dateTime, 1);
  }

  return dateTime;
}

function resolveBreakStart(dateString, timeString, shiftStart) {
  let dateTime = combineDateTime(dateString, timeString);

  if (dateTime < shiftStart) {
    dateTime = addDays(dateTime, 1);
  }

  return dateTime;
}

function resolveBreakEnd(dateString, timeString, shiftStart, breakStart) {
  let dateTime = combineDateTime(dateString, timeString);

  if (dateTime < shiftStart) {
    dateTime = addDays(dateTime, 1);
  }

  if (dateTime <= breakStart) {
    dateTime = addDays(dateTime, 1);
  }

  return dateTime;
}

function parseDateOnly(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function getBiweeklyPeriodEnd(date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const referenceEnd = parseDateOnly(REFERENCE_PERIOD_END);
  const diffDays = Math.floor((normalized - referenceEnd) / DAYS_MS);
  const periodOffset = Math.ceil(diffDays / PAY_PERIOD_LENGTH_DAYS);

  return addDays(referenceEnd, periodOffset * PAY_PERIOD_LENGTH_DAYS);
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  const startText = formatter.format(startDate);
  const endText = formatter.format(endDate);
  return `${startText} - ${endText}`;
}

function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseDateOnly(dateString));
}

function formatTime(timeString) {
  if (!timeString) {
    return "--";
  }

  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value) {
  return value.toFixed(2);
}

function stripTrailingZeros(value) {
  return String(Number(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.classList.remove("hidden");
}

function clearFormError() {
  elements.formError.textContent = "";
  elements.formError.classList.add("hidden");
}
