import { motion } from 'framer-motion';

const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function StatTile({ label, value, hint, loading }) {
  return (
    <motion.div
      className="glass tile"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="cap">{label}</div>
      {loading ? (
        <div className="skeleton" style={{ height: 40, marginTop: 8 }} />
      ) : (
        <div className="num">{value ?? '—'}</div>
      )}
      {hint && <div className="microcopy">{hint}</div>}
    </motion.div>
  );
}
