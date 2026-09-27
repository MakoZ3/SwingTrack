import { BELLS } from "../lib/bells";

export default function SetLog({ sets }) {
  if (!sets.length) {
    return (
      <section className="log">
        <h2>Today's sets</h2>
        <p className="log-empty">Finish a set and it will show up here.</p>
      </section>
    );
  }
  const total = sets.reduce((sum, s) => sum + s.reps, 0);
  const volume = sets.reduce((sum, s) => sum + s.reps * s.kg, 0);
  return (
    <section className="log">
      <h2>Today's sets</h2>
      <ol className="log-list">
        {sets.map((s, i) => {
          const bell = BELLS.find((b) => b.kg === s.kg);
          return (
            <li key={s.id} className="log-row">
              <span className="log-dot" style={{ background: bell?.color }} aria-hidden="true" />
              <span className="log-set">Set {i + 1}</span>
              <span className="log-reps">{s.reps} swings</span>
              <span className="log-meta">
                {s.kg} kg, {s.durationSec}s
              </span>
            </li>
          );
        })}
      </ol>
      <p className="log-total">
        {total} swings, {volume.toLocaleString()} kg moved
      </p>
    </section>
  );
}
