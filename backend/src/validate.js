// Zod validation middleware helper.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const r = schema.safeParse(data);
    if (!r.success) {
      const first = r.error.issues && r.error.issues[0];
      const msg = first
        ? `${first.path.join('.') || 'field'}: ${first.message}`
        : 'Invalid input.';
      return res.status(400).json({ error: `Invalid input — ${msg}`, fix: 'Check the highlighted field and try again.' });
    }
    if (source === 'query') req.query = r.data;
    else if (source === 'params') req.params = r.data;
    else req.body = r.data;
    next();
  };
}

module.exports = { validate };
