import { useId, type CSSProperties } from 'react';
import type { Point, TacticalConcept } from '../../lib/tactics';
import styles from './TacticalBoard.module.css';

function motion(from: Point, to: Point = from): CSSProperties {
  return { '--from-x': `${from[0]}px`, '--from-y': `${from[1]}px`, '--to-x': `${to[0]}px`, '--to-y': `${to[1]}px` } as CSSProperties;
}

export default function TacticalScene({ concept }: { concept: TacticalConcept }) {
  const id = useId();
  return <svg className={styles.scene} viewBox="0 0 100 140" role="img" aria-labelledby={`${id}-title ${id}-description`}>
    <title id={`${id}-title`}>{concept.title}</title>
    <desc id={`${id}-description`}>{concept.description}</desc>
    <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
    <g className={styles.markings} aria-hidden="true">
      <rect x="5" y="5" width="90" height="130" rx="2" />
      <path d="M5 70h90 M27 5v20h46V5 M27 135v-20h46v20 M39 5v7h22V5 M39 135v-7h22v7" />
      <circle cx="50" cy="70" r="15" /><circle cx="50" cy="70" r=".6" />
    </g>
    {concept.zone && <rect className={styles.zone} {...concept.zone} rx="3" />}
    {concept.guide && <g className={styles.guide}>
      <line x1="5" x2="95" y1={concept.guide.y} y2={concept.guide.y} />
      <text x="7" y={concept.guide.y - 3}>{concept.guide.label}</text>
    </g>}
    {concept.routes.map((route, index) => <line key={index} className={`${styles.route} ${route.kind === 'run' ? styles.run : ''}`}
      x1={route.from[0]} y1={route.from[1]} x2={route.to[0]} y2={route.to[1]} markerEnd={`url(#${id}-arrow)`} />)}
    {concept.players.map((player) => <g key={player.id} className={`${styles.player} ${styles[player.team]}`} style={motion(player.position, player.to)}>
      <circle r="4.1" /><text textAnchor="middle" dominantBaseline="central">{player.label}</text>
    </g>)}
    <g className={styles.ball} style={motion(concept.ball.from, concept.ball.to)}><circle r="1.8" /><path d="m0 -1 .95 .7 -.35 1.1 h-1.2 l-.35 -1.1z" /></g>
  </svg>;
}
