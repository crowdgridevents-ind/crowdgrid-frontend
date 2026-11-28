import { fmtDateTime } from './format';

// Same rules as the server (crowdgrid-backend/modules/event/prebook.service.js)
export const PREBOOK_MAX = 5;
export const DEPOSIT_SHARE = 0.25;
export const PAY_WINDOW_HOURS = 48;

/** True while an event takes pre-bookings only (its booking opening date is still ahead). */
export const inPrebooking = (event, now = Date.now()) => Boolean(event?.bookingOpensAt) && now < new Date(event.bookingOpensAt).getTime();

/** Deposit rounded up to the rupee; the rest is paid when booking opens. */
export const splitPrice = (ticketPrice, people) => {
  const total = (ticketPrice || 0) * people;
  const deposit = Math.ceil(total * DEPOSIT_SHARE);
  return { total, deposit, balance: total - deposit };
};

export const balanceDueAt = (event) =>
  event?.bookingOpensAt ? new Date(new Date(event.bookingOpensAt).getTime() + PAY_WINDOW_HOURS * 3600 * 1000) : null;

/** Cart line for a pre-booking: the 25% deposit (the server prices it again at checkout). */
export const addPrebookToCart = (cart, event, people) => {
  const s = splitPrice(event.ticketPrice, people);
  cart.add({
    key: `PREBOOK:${event._id}`,
    kind: 'PREBOOK',
    refId: event._id,
    label: `${event.title} (pre-booking)`,
    detail: `${people} ${people === 1 ? 'ticket' : 'tickets'} · 25% now · ₹${s.balance.toLocaleString('en-IN')} due when booking opens on ${fmtDateTime(event.bookingOpensAt)}`,
    estimate: s.deposit,
    input: { people },
  });
};

/** Cart line for the remaining 75% of a pre-booking. */
export const addBalanceToCart = (cart, p) =>
  cart.add({
    key: `BALANCE:${p._id}`,
    kind: 'BALANCE',
    refId: p._id,
    label: `${p.event?.title || 'Event'} (rest of pre-booking)`,
    detail: `${p.people} ${p.people === 1 ? 'ticket' : 'tickets'} · 75% remaining${p.balanceDueAt ? ` · pay by ${fmtDateTime(p.balanceDueAt)}` : ''}`,
    estimate: p.balance,
    input: {},
  });
