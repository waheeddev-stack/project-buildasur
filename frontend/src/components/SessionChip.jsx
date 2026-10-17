const DOT_COLORS = ['#8b5cf6', '#ec4899', '#34d399', '#fbbf24', '#60a5fa', '#f97316', '#a3e635'];

export function dotFor(key) {
  if (!key) return DOT_COLORS[0];
  let h = 0;
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % 997;
  return DOT_COLORS[h % DOT_COLORS.length];
}

// Draggable session chip: HTML5 draggable + click-to-move fallback (keyboard accessible).
export default function SessionChip({ session, selected, onDragStart, onSelect }) {
  const locked = session.isLocked || session.is_locked;
  const subject = session.subjectName || session.subject_name || session.subject?.name || session.subjectCode || session.subject?.code || 'Session';
  const batch = session.batchName || session.batch_name || session.batch?.name || '';
  const meta = [
    session.teacherName || session.teacher_name || session.teacher?.name,
    session.roomName || session.room_name || session.room?.name
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className={`chip${locked ? ' locked' : ''}${selected ? ' selected' : ''}`}
      draggable={!locked}
      onDragStart={(e) => onDragStart && onDragStart(e, session)}
      onClick={() => onSelect && onSelect(session)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect && onSelect(session);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${subject}${meta ? `, ${meta}` : ''}${locked ? ', locked' : ''}. Press Enter to select, then choose a slot.`}
      title={locked ? 'Locked — unlock to move' : 'Drag me, or click then click a slot'}
    >
      <span className="dot" style={{ background: dotFor(subject) }} aria-hidden="true" />
      <span>
        <strong>{subject}</strong>
        {batch && <div className="microcopy">{batch}</div>}
        {meta && <div className="microcopy">{meta}</div>}
        {locked && <div className="microcopy">🔒 locked</div>}
      </span>
    </div>
  );
}
