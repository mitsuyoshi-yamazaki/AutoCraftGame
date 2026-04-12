import type { GameEvent } from '@shared/types.js';

interface Props {
  events: GameEvent[];
}

function eventClass(event: GameEvent): string {
  switch (event.type) {
    case 'character_spawned': return 'log-entry log-birth';
    case 'character_died': return 'log-entry log-death';
    case 'species_extinct': return 'log-entry log-extinction';
  }
}

function eventText(event: GameEvent): string {
  switch (event.type) {
    case 'character_spawned':
      return `[${event.tick}] ${event.parentId} spawned ${event.childId} (${event.species})`;
    case 'character_died':
      return `[${event.tick}] ${event.characterId} (${event.species}) died`;
    case 'species_extinct':
      return `[${event.tick}] *** ${event.species} is now EXTINCT ***`;
  }
}

export function EventLog({ events }: Props) {
  // Newest first
  const reversed = [...events].reverse();

  return (
    <div className="event-log">
      <h3>Events</h3>
      <div className="event-log-content">
        {reversed.map((event, i) => (
          <div key={`${event.tick}-${i}`} className={eventClass(event)}>
            {eventText(event)}
          </div>
        ))}
      </div>
    </div>
  );
}
