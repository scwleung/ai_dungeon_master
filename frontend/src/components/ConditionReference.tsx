import { useState } from 'react'

interface Props {
  onClose: () => void
}

interface Condition {
  name: string
  effects: string[]
}

const CONDITIONS: Condition[] = [
  {
    name: 'Blinded',
    effects: [
      "A blinded creature can't see and automatically fails any ability check that requires sight.",
      "Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
    ],
  },
  {
    name: 'Charmed',
    effects: [
      "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.",
      'The charmer has advantage on any ability check to interact socially with the creature.',
    ],
  },
  {
    name: 'Deafened',
    effects: [
      "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    ],
  },
  {
    name: 'Exhaustion',
    effects: [
      'Level 1: Disadvantage on ability checks.',
      'Level 2: Speed halved.',
      'Level 3: Disadvantage on attack rolls and saving throws.',
      'Level 4: Hit point maximum halved. Level 5: Speed reduced to 0. Level 6: Death.',
    ],
  },
  {
    name: 'Frightened',
    effects: [
      'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.',
      "The creature can't willingly move closer to the source of its fear.",
    ],
  },
  {
    name: 'Grappled',
    effects: [
      "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
      'The condition ends if the grappler is incapacitated or if an effect removes the grappled creature out of the reach of the grappler.',
    ],
  },
  {
    name: 'Incapacitated',
    effects: [
      "An incapacitated creature can't take actions or reactions.",
    ],
  },
  {
    name: 'Invisible',
    effects: [
      'An invisible creature is impossible to see without the aid of magic or a special sense.',
      "Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
      "The creature's location can be detected by any noise it makes or tracks it leaves.",
    ],
  },
  {
    name: 'Paralyzed',
    effects: [
      "A paralyzed creature is incapacitated and can't move or speak.",
      'The creature automatically fails STR and DEX saving throws.',
      'Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
  },
  {
    name: 'Petrified',
    effects: [
      "A petrified creature is transformed into solid inanimate matter. It is incapacitated, can't move or speak, and is unaware of its surroundings.",
      'Attack rolls against it have advantage. It automatically fails STR and DEX saving throws.',
      'It has resistance to all damage and is immune to poison and disease.',
    ],
  },
  {
    name: 'Poisoned',
    effects: [
      'A poisoned creature has disadvantage on attack rolls and ability checks.',
    ],
  },
  {
    name: 'Prone',
    effects: [
      "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
      'The creature has disadvantage on attack rolls. Attacks against it have advantage if the attacker is within 5 feet, otherwise the attacker has disadvantage.',
    ],
  },
  {
    name: 'Restrained',
    effects: [
      "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
      "Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
      'The creature has disadvantage on DEX saving throws.',
    ],
  },
  {
    name: 'Stunned',
    effects: [
      "A stunned creature is incapacitated, can't move, and can speak only falteringly.",
      'The creature automatically fails STR and DEX saving throws.',
      'Attack rolls against the creature have advantage.',
    ],
  },
  {
    name: 'Unconscious',
    effects: [
      "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
      "The creature drops whatever it's holding and falls prone.",
      'The creature automatically fails STR and DEX saving throws. Attack rolls against it have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
  },
]

function ConditionRow({ condition }: { condition: Condition }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="cond-row">
      <button className="cond-row-header" onClick={() => setOpen((v) => !v)}>
        <span className="cond-name">{condition.name}</span>
        <span className={`cond-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <ul className="cond-effects">
          {condition.effects.map((effect, i) => (
            <li key={i} className="cond-effect-item">
              {effect}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Scrollable reference panel listing all standard D&D 5e conditions with
 * expandable rows showing mechanical effects.
 */
export function ConditionReference({ onClose }: Props) {
  return (
    <div className="condition-reference">
      <div className="cond-ref-header">
        <span className="cond-ref-title">Conditions</span>
        <button className="btn-ghost btn-sm" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="cond-ref-body">
        {CONDITIONS.map((cond) => (
          <ConditionRow key={cond.name} condition={cond} />
        ))}
      </div>

      <style>{`
        .condition-reference {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-panel);
        }

        .cond-ref-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .cond-ref-title {
          font-weight: 700;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .cond-ref-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .cond-row {
          border-bottom: 1px solid var(--border);
        }

        .cond-row-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background var(--transition);
          gap: var(--space-2);
          text-transform: none;
          letter-spacing: normal;
          font-size: var(--font-size-sm);
          min-width: unset;
        }

        .cond-row-header:hover {
          background: var(--bg-secondary);
          border-color: transparent;
        }

        .cond-name {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--font-size-sm);
        }

        .cond-chevron {
          color: var(--text-muted);
          font-size: var(--font-size-xs);
          transition: transform var(--transition);
          flex-shrink: 0;
        }

        .cond-chevron.open {
          transform: rotate(180deg);
        }

        .cond-effects {
          list-style: disc;
          padding: 0 var(--space-4) var(--space-3) var(--space-8);
          margin: 0;
          background: var(--bg-card);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .cond-effect-item {
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          line-height: 1.5;
        }

        @media (max-width: 900px) {
          .condition-reference {
            position: fixed;
            top: var(--header-height, 48px);
            right: 0;
            bottom: 0;
            width: min(var(--sidebar-width, 320px), 100vw);
            z-index: 200;
            box-shadow: -4px 0 20px var(--shadow-lg);
          }
        }
      `}</style>
    </div>
  )
}
