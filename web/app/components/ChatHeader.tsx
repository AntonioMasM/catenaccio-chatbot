import Image from 'next/image';
import styles from './ChatHeader.module.css';

type Props = { loading: boolean; canReset: boolean; onReset: () => void };

export default function ChatHeader({ loading, canReset, onReset }: Props) {
  return <header className={styles.header}>
    <div className={styles.identity}>
      <span className={styles.avatar} aria-hidden="true">
        <Image src="/images/catenaccio-mascot-cartoon.png" alt="" width={64} height={64} />
      </span>
      <div className={styles.nameplate}>
        <h1>Catenaccio<span className={styles.nameDot} aria-hidden="true">.</span></h1>
        {loading && <p className={styles.status} role="status">
          <span className={`${styles.statusDot} ${styles.thinking}`} aria-hidden="true" />
          Leyendo la jugada…
        </p>}
      </div>
    </div>
    <button className={styles.reset} type="button" onClick={onReset} disabled={!canReset}
      aria-label="Nueva conversación" title="Nueva conversación">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <span>Nueva conversación</span>
    </button>
  </header>;
}
