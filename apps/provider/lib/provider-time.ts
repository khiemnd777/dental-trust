const localDateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/u;

export function localDateTimeToIso(value: string, timeZone: string): string {
  const match = localDateTimePattern.exec(value);
  if (!match?.groups) throw new RangeError('invalid_local_datetime');
  const desired = {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
    second: Number(match.groups.second ?? 0),
  };
  const desiredEpoch = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  if (
    !Number.isFinite(desiredEpoch) ||
    desired.month < 1 ||
    desired.month > 12 ||
    desired.day < 1 ||
    desired.day > 31 ||
    desired.hour > 23 ||
    desired.minute > 59 ||
    desired.second > 59
  ) {
    throw new RangeError('invalid_local_datetime');
  }

  const formatter = formatterForTimeZone(timeZone);
  let candidate = desiredEpoch;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const rendered = dateParts(formatter, new Date(candidate));
    const renderedEpoch = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    const adjustment = desiredEpoch - renderedEpoch;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  const roundTrip = dateParts(formatter, new Date(candidate));
  if (
    Object.keys(desired).some(
      (key) => desired[key as keyof typeof desired] !== roundTrip[key as keyof typeof roundTrip],
    )
  ) {
    throw new RangeError('nonexistent_local_datetime');
  }
  return new Date(candidate).toISOString();
}

export function isoToLocalDateTimeInput(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('invalid_iso_datetime');
  const parts = dateParts(formatterForTimeZone(timeZone), date);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function isoDateKeyInTimeZone(value: string, timeZone: string): string {
  return isoToLocalDateTimeInput(value, timeZone).slice(0, 10);
}

function formatterForTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function dateParts(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}
