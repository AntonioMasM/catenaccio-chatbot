"use client";

import { useState } from 'react';
import { tacticalConcepts, type ConceptId } from '../../lib/tactics';
import TacticalScene from './TacticalScene';
import styles from './TacticalBoard.module.css';

type Props = {
  selectedId: ConceptId | null;
};

export default function TacticalBoard({ selectedId }: Props) {
  const [paused, setPaused] = useState(false);
  const concept = tacticalConcepts.find((item) => item.id === selectedId);
  if (!concept) return null;
  return <section className={`${styles.board} ${paused ? styles.paused : ''}`} aria-label="Pizarra táctica interactiva">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Pizarra táctica</span><h2>{concept.title}</h2></div>
      <button className={styles.playback} type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar animación' : 'Pausar animación'} aria-pressed={paused}>
        {paused ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>}
      </button>
    </header>
    <TacticalScene key={concept.id} concept={concept} />
    <div className={styles.bottom}>
      <p className={styles.caption} aria-live="polite">{concept.caption}</p>
      <div className={styles.legend}><span><i className={styles.attackDot} />Equipo atacante</span><span><i className={styles.defenceDot} />Rival</span><span>↑ Ataque</span></div>
    </div>
  </section>;
}
