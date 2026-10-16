// AI stubs. AI never writes timetable data — it only suggests/explains.
// Off switch: AI_ENABLED=false by default.
function aiEnabled() {
  return String(process.env.AI_ENABLED || 'false').toLowerCase() === 'true';
}

function off(payload) {
  return Object.assign(
    { aiEnabled: false, message: 'AI is off. Set AI_ENABLED=true to enable suggestions; the app works fully without it.' },
    payload || {}
  );
}

module.exports = { aiEnabled, off };
