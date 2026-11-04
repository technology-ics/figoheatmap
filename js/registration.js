/** Last calendar day of early registration, interpreted in Montréal. */
export const EARLY_REGISTRATION_DEADLINE = "2027-03-26";
export const REGISTRATION_URL = "https://congress.figo.org/registration/";

export function isEarlyRegistrationOpen(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return today <= EARLY_REGISTRATION_DEADLINE;
}
