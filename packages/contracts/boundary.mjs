// M0 pure boundary experiment. No network, global state or product collection.
export function resolveEvidence(refs, records, grants, { checkpoint, destination = 'local', allowImages = false }) {
  const accepted = new Map(), visiting = new Set();
  function visit(ref) {
    const key = `${ref.id}@${ref.version}`;
    if (accepted.has(key)) return;
    if (visiting.has(key)) throw new Error('cyclic_dependency');
    const record = records.get(key);
    if (!record || record.completeness === 'deleted') throw new Error('missing_or_deleted');
    const grant = grants.get(record.source_id);
    if (!grant?.read || grant.private_window) throw new Error('source_access_denied');
    if (destination === 'model' && !grant.model) throw new Error('transmission_denied');
    if (record.representation === 'image' && (!grant.screenshot || (destination === 'model' && (!allowImages || !grant.image_model)))) throw new Error('image_denied');
    if (!Number.isFinite(Date.parse(record.available_at)) || Date.parse(record.available_at) > Date.parse(checkpoint)) throw new Error('future_evidence');
    visiting.add(key);
    for (const dependency of record.dependencies || []) visit(dependency);
    visiting.delete(key); accepted.set(key, record);
  }
  if (!Number.isFinite(Date.parse(checkpoint))) throw new Error('invalid_checkpoint');
  for (const ref of refs) visit(ref);
  return [...accepted.values()];
}

export function assertMayCollect(grant, { enabled = false } = {}) {
  if (!enabled || !grant?.collect || grant.private_window) throw new Error('collection_denied');
  return true;
}

export function assertIndependent(skillRef, caseRef, uses) {
  if (uses.some(use => use.skill.id === skillRef.id && use.skill.version === skillRef.version && use.case.id === caseRef.id && use.case.version === caseRef.version && ['learning','regression'].includes(use.use))) throw new Error('not_independent');
  return true;
}
