import { BELLS } from "../lib/bells";

export default function WeightPicker({ value, onChange }) {
  return (
    <fieldset className="weights">
      <legend>Bell weight</legend>
      <div className="weights-row">
        {BELLS.map((bell) => (
          <button
            key={bell.kg}
            type="button"
            className="weight"
            aria-pressed={bell.kg === value.kg}
            style={{ "--chip": bell.color, "--chip-ink": bell.ink }}
            onClick={() => onChange(bell)}
          >
            {bell.kg}
            <span className="weight-unit"> kg</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
