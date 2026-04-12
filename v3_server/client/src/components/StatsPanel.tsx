import type { WorldStats } from '@shared/types.js';

interface Props {
  stats: WorldStats;
}

export function StatsPanel({ stats }: Props) {
  const speciesEntries = Object.entries(stats.speciesCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel-section">
      <h3>Statistics</h3>
      <div className="row">Characters: <span className="value">{stats.characterCount}</span></div>
      <div className="row">Births: <span className="value">{stats.totalBirths}</span></div>
      <div className="row">Deaths: <span className="value">{stats.totalDeaths}</span></div>
      <div className="row">Resources: <span className="value">{stats.resourceNodeCount}</span></div>
      <div className="row">Energy: <span className="value">{stats.energyNodeCount}</span></div>
      <div className="row">Remains: <span className="value">{stats.remainsCount}</span></div>
      {speciesEntries.length > 0 && (
        <>
          <h3 style={{ marginTop: 8 }}>Species</h3>
          {speciesEntries.map(([name, count]) => (
            <div key={name} className="row species-row">
              {name}: <span className="value">{count}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
