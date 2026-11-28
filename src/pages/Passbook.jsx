import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API, { errorMessage } from '../lib/api';
import { rupees, useCart } from '../lib/cart';
import { addBalanceToCart } from '../lib/prebook';

const PREBOOK_STATUS = { HELD: 'Pre-booked', CONFIRMED: 'Confirmed', LAPSED: 'Lapsed' };
import { loadPasses, savePasses } from '../lib/passCache';
import { fmtDateTime } from '../lib/format';
import Notice, { Loading } from '../components/Notice';
import PassCard, { PASS_META } from '../components/PassCard';
import MyQrCard from '../components/MyQrCard';
import CancelPassDialog from '../components/CancelPassDialog';
import { useAuth } from '../lib/auth';
import PageTitle from '../components/PageTitle';
import { useCelebrate } from '../components/SuccessSplash';

/**
 * My Yatra Passbook (FR-11). Loads passes from the API and caches them; with no
 * network it falls back to the cached copy so QR codes still show at the ghat.
 */
export default function Passbook() {
  const cached = useMemo(() => loadPasses(), []);
  const [passes, setPasses] = useState(cached?.passes || null);
  const [offlineSince, setOfflineSince] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [showPast, setShowPast] = useState(false);
  const [now] = useState(() => Date.now());
  const [showEach, setShowEach] = useState(false);
  const { user } = useAuth();
  const [cancelling, setCancelling] = useState(null); // pass shown in the cancel pop-up
  const [done, setDone] = useState('');
  const [prebookings, setPrebookings] = useState([]);
  const celebrate = useCelebrate();
  const cart = useCart();
  const navigate = useNavigate();

  // Pre-booked event tickets (25% paid); needs the network, so it simply stays hidden offline
  useEffect(() => {
    API.get('/events/prebookings/mine').then(({ data }) => setPrebookings(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);
  const payRest = (p) => {
    addBalanceToCart(cart, p);
    navigate('/checkout');
  };

  const load = () =>
    API.get('/passes/mine')
      .then(({ data }) => {
        setPasses(data);
        savePasses(data);
        setOfflineSince(null);
      })
      .catch((e) => {
        if (cached) setOfflineSince(cached.savedAt);
        else setError(errorMessage(e));
      });
  useEffect(() => {
    load();
  }, [cached]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="shell py-10"><Notice tone="error">{error}</Notice></div>;
  if (!passes) return <Loading label="Opening your passbook" />;

  // Recompute state on the device too, so an offline pass shows "Expired" correctly
  const withState = passes.map((p) => {
    if (p.status !== 'ACTIVE') return p;
    if (new Date(p.validUntil).getTime() < now) return { ...p, state: 'EXPIRED' };
    if (new Date(p.validFrom).getTime() > now) return { ...p, state: 'UPCOMING' };
    return { ...p, state: 'ACTIVE' };
  });
  const usable = withState.filter((p) => p.state === 'ACTIVE' || p.state === 'UPCOMING');
  const past = withState.filter((p) => !(p.state === 'ACTIVE' || p.state === 'UPCOMING'));
  const types = [...new Set(usable.map((p) => p.type))];
  const shown = usable.filter((p) => filter === 'ALL' || p.type === filter);

  return (
    <div className="shell space-y-6 py-6">
      <div className="cg-pagehead">
        <PageTitle kicker="Attendee" tone="saffron" title="My passbook" lead="Every pass in one place. Opens without network." />
      </div>
      {user && <MyQrCard name={user.name} photoUrl={user.photoUrl} activeCount={withState.filter((p) => p.state === 'ACTIVE').length} />}
      {done && <Notice tone="success">{done}</Notice>}
      {offlineSince && <Notice>Showing passes saved on {fmtDateTime(offlineSince)}. You're offline, but these QR codes still work at the gate.</Notice>}

      {prebookings.length > 0 && (
        <section aria-labelledby="prebook-head" data-testid="prebookings">
          <h2 id="prebook-head" className="text-xl font-bold">Pre-bookings</h2>
          <p className="text-sm text-ink-soft">25% paid. Pay the rest within 48 hours of booking opening to get your entry pass.</p>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {prebookings.map((p) => (
              <li key={p._id} className="panel space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold">{p.event?.slug ? <Link to={`/event/${p.event.slug}`} className="underline">{p.event.title}</Link> : p.event?.title || 'Event'}</p>
                  <span className={p.status === 'CONFIRMED' ? 'pill-ok' : p.status === 'LAPSED' ? 'pill-out' : 'pill-low'}>{PREBOOK_STATUS[p.status]}</span>
                </div>
                <p className="text-sm text-ink-soft">
                  {p.people} {p.people === 1 ? 'ticket' : 'tickets'} · {rupees(p.deposit)} paid of {rupees(p.total)}
                  {p.event?.startDate && <> · event on {fmtDateTime(p.event.startDate)}</>}
                </p>
                {p.status === 'HELD' && p.canPayBalance && (
                  <>
                    <p className="text-sm">Pay by <b>{fmtDateTime(p.balanceDueAt)}</b> or the seats are released.</p>
                    <button type="button" className="btn-primary w-full" onClick={() => payRest(p)}>Pay the rest · {rupees(p.balance)}</button>
                  </>
                )}
                {p.status === 'HELD' && !p.canPayBalance && p.waitingReason && <p className="text-sm text-ink-soft">{p.waitingReason}.</p>}
                {p.status === 'CONFIRMED' && <p className="text-sm text-ink-soft">Paid in full. Your entry pass is below.</p>}
                {p.status === 'LAPSED' && <p className="text-sm text-ink-soft">The rest was not paid in time, so the seats were released. The 25% is not refunded.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {usable.length === 0 ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-edge p-8 text-center sm:p-12">
          <h2 className="text-xl font-bold">No active passes yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-ink-soft">Book a ticket, a bed, a meal token or a shuttle seat, and the pass appears here.</p>
          <Link to="/events" className="btn-primary mt-5">Find an event</Link>
        </div>
      ) : (
        <>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter passes">
              <button type="button" aria-pressed={filter === 'ALL'} className={`pill min-h-11 px-4 transition-colors ${filter === 'ALL' ? 'bg-blue text-white' : 'bg-sand text-ink-soft hover:text-ink'}`} onClick={() => setFilter('ALL')}>
                All ({usable.length})
              </button>
              {types.map((t) => (
                <button key={t} type="button" aria-pressed={filter === t} className={`pill min-h-11 px-4 transition-colors ${filter === t ? 'bg-blue text-white' : 'bg-sand text-ink-soft hover:text-ink'}`} onClick={() => setFilter(t)}>
                  {PASS_META[t]?.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Your passes</h2>
            <button type="button" className="btn-ghost min-h-11 text-sm" aria-pressed={showEach} onClick={() => setShowEach(!showEach)}>
              {showEach ? 'Hide individual QR codes' : 'Show individual QR codes (backup)'}
            </button>
          </div>
          <ul className="grid gap-5 md:grid-cols-2">
            {shown.map((p) => <li key={p._id}><PassCard pass={p} expanded={showEach} onCancel={offlineSince ? undefined : setCancelling} /></li>)}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <section>
          <button type="button" className="btn-ghost" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
            {showPast ? 'Hide' : 'Show'} used, expired and cancelled passes ({past.length})
          </button>
          {showPast && (
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {past.map((p) => <li key={p._id}><PassCard pass={p} expanded={false} /></li>)}
            </ul>
          )}
        </section>
      )}

      {cancelling && (
        <CancelPassDialog
          pass={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(res) => {
            setCancelling(null);
            setDone(res.message);
            celebrate({ tone: 'cancel', title: 'Booking cancelled', line: 'The pass no longer works at the gate.' });
            setShowPast(true);
            load();
          }}
        />
      )}
    </div>
  );
}
