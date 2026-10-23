import type { PageData } from '../frontend/contracts';
import { readBoard, readJobPage, readTeam } from '../lib/collab-read';
import type { Services } from './services';

const jobPath = /^\/collaborate\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** Collaborate page data. Fields are set only after a read validates, so a failure never leaves partial data. */
export async function collabPage(path: string, data: PageData, s: Services, hash: string | null) {
  if (path === '/collaborate') {
    const v = await s.domainOperation('collab_board', hash);
    if (v.kind !== 'ok') throw new Error('Unavailable');
    data.collab = readBoard(v);
    return;
  }
  const job = jobPath.exec(path);
  if (job) {
    const v = await s.domainOperation('collab_job', hash, job[1]);
    if (v.kind === 'missing') data.job = { kind: 'missing' };
    else if (v.kind === 'ok') data.job = { kind: 'ok', ...readJobPage(v) };
    else throw new Error('Unavailable');
    return;
  }
  // Team & shares is an extra on the product page: a failed read leaves that section in its fallback state.
  if (path.startsWith('/projects/') && data.project?.kind === 'ok') {
    try {
      const v = await s.domainOperation('collab_team', hash, data.project.project.id);
      if (v.kind === 'ok') data.team = readTeam(v.team);
    } catch {}
  }
}
