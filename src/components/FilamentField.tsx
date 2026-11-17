import type { Filament } from "../types";
import { grams, readDecimal, roundGrams } from "../lib/format";
import { colorGroups } from "../lib/pools";
import { NumericInput } from "./ui";

export interface FilamentPick {
  filament: string;
  grams: string;
}

export function FilamentField({
  filaments,
  picks,
  onPicks,
  seedGrams,
}: {
  filaments: Filament[];
  picks: FilamentPick[];
  onPicks: (picks: FilamentPick[]) => void;
  seedGrams?: number;
}) {
  const groups = colorGroups(filaments);
  const selected = groups.flatMap((group) => {
    const mine = picks.filter((pick) => group.spools.some((spool) => spool.id === pick.filament));
    if (mine.length === 0) return [];
    const amount = mine.reduce((sum, pick) => sum + (readDecimal(pick.grams) ?? 0), 0);
    const gramsText = mine.length === 1 ? mine[0].grams : amount > 0 ? String(roundGrams(amount)) : "";
    return [{ group, grams: gramsText }];
  });
  const total = selected.reduce((sum, item) => sum + (readDecimal(item.grams) ?? 0), 0);

  function without(groupId: string) {
    const ids = new Set(groups.find((group) => group.key === groupId)?.spools.map((spool) => spool.id) ?? []);
    return picks.filter((pick) => !ids.has(pick.filament));
  }

  function toggle(key: string) {
    const group = groups.find((item) => item.key === key);
    if (!group) return;
    const on = picks.some((pick) => group.spools.some((spool) => spool.id === pick.filament));
    const gramsText = !on && picks.length === 0 && seedGrams && seedGrams > 0 ? String(seedGrams) : "";
    onPicks(on ? without(key) : [...without(key), { filament: group.lead.id, grams: gramsText }]);
  }

  function setGrams(key: string, value: string) {
    const group = groups.find((item) => item.key === key);
    if (!group) return;
    const current = picks.find((pick) => group.spools.some((spool) => spool.id === pick.filament));
    onPicks([...without(key), { filament: current?.filament ?? group.lead.id, grams: value }]);
  }

  return (
    <>
      <div className="field">
        <span>Filament</span>
        <div className="filament-picks">
          {groups.map((group) => {
            const picked = picks.some((pick) => group.spools.some((spool) => spool.id === pick.filament));
            const brand = new Set(group.spools.map((spool) => spool.brand)).size === 1 ? `${group.lead.brand} ` : "";
            return (
              <label key={group.key} className={picked ? "filament-pick on" : "filament-pick"}>
                <input type="checkbox" checked={picked} onChange={() => toggle(group.key)} />
                <span className="spool-orb tiny" style={{ background: group.lead.colorHex }} />
                <span className="filament-pick-name">
                  {group.lead.color} · {brand}
                  {group.lead.material}
                </span>
                <span className="muted filament-pick-left">
                  {grams(group.remainingGrams)} left
                  {group.spools.length > 1 ? ` · ${group.spools.length} spools` : ""}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      {selected.length > 0 ? (
        <div className="field">
          <span>{selected.length > 1 ? "Grams per color" : "Grams"}</span>
          <div className="color-grams">
            {selected.map(({ group, grams: value }) => (
              <div key={group.key} className="color-gram">
                <span className="spool-orb tiny" style={{ background: group.lead.colorHex }} />
                <span className="color-gram-name">
                  <strong>{group.lead.color}</strong>
                  <small>
                    {group.lead.material}
                    {group.spools.length > 1 ? ` · ${group.spools.length} spools` : ""}
                  </small>
                </span>
                <NumericInput
                  decimal
                  aria-label={`${group.lead.color} grams`}
                  placeholder="0"
                  value={value}
                  onChange={(next) => setGrams(group.key, next)}
                />
              </div>
            ))}
          </div>
          {selected.length > 1 && total > 0 ? <small>This plate uses {grams(total)} in total.</small> : null}
        </div>
      ) : null}
    </>
  );
}
