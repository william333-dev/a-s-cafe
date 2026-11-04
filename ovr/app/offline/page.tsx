export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="font-display text-6xl text-ember">OVR</div>
        <p className="mt-4 text-muted">You&apos;re offline and this screen isn&apos;t cached yet. Open Today — your taps still save.</p>
        <a href="/today" className="mt-6 inline-block rounded-2xl bg-ember px-5 py-3 font-semibold text-black">Go to Today</a>
      </div>
    </main>
  );
}
