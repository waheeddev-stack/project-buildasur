const DOT_COLORS = ['#8b5cf6', '#ec4899', '#34d399', '#fbbf24', '#60a5fa', '#f97316', '#a3e635'];

export function dotFor(key) {
  if (!key) return DOT_COLORS[0];
  let h = 0;
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % 997;
  return DOT_COLORS[h % DOT_COLORS.length];
}

// Draggable session chip: HTML5 draggable + click-to-move fallback (keyboard accessible).
export default function SessionChip({ session, selected, onDragStart, onSelect }) {
  const subject = session.subjectName || session.subject?.name || session.subjectCode || 'Session';
  const meta = [session.teacherName || session.teacher?.name, session.roomName || session.room?.name]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className={`chip${session.isLocked ? ' locked' : ''}${selected ? ' selected' : ''}`}
      draggable={!session.isLocked}
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
      aria-label={`${subject}${meta ? `, ${meta}` : ''}${session.isLocked ? ', locked' : ''}. Press Enter to select, then choose a slot.`}
      title={session.isLocked ? 'Locked — unlock to move' : 'Drag me, or click then click a slot'}
    >
      <span className="dot" style={{ background: dotFor(subject) }} aria-hidden="true" />
      <span>
        <strong>{subject}</strong>
        {session.batchName && <div className="microcopy">{session.batchName}</div>}
        {meta && <div className="microcopy">{meta}</div>}
        {session.isLocked && <div className="microcopy">🔒 locked</div>}
      </span>
    </div>
  );
}
