import type { PageData } from '../frontend/contracts';
import { readBoard, readFunding, readIdeaPage, readIdeas, readJobPage, readTeam } from '../lib/collab-read';
import type { Services } from './services';

const ideaPath = /^\/collaborate\/ideas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const jobPath = /^\/collaborate\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** Collaborate page data. Fields are set only after a read validates, so a failure never leaves partial data. */
export async function collabPage(path: string, data: PageData, s: Services, hash: string | null) {
  if (path === '/collaborate') {
    const v = await s.domainOperation('collab_board', hash);
    if (v.kind !== 'ok') throw new Error('Unavailable');
    data.collab = readBoard(v);
    // Ideas load on their own: a failure leaves the Jobs and Teams tabs working.
    try {
      const ideas = await s.domainOperation('ideas_feed', hash);
      if (ideas.kind === 'ok') data.ideas = readIdeas(ideas).ideas;
    } catch {}
    return;
  }
  const idea = ideaPath.exec(path);
  if (idea) {
    const v = await s.domainOperation('idea_page', hash, idea[1]);
    if (v.kind === 'missing') data.idea = { kind: 'missing' };
    else if (v.kind === 'ok') data.idea = { kind: 'ok', ...readIdeaPage(v) };
    else throw new Error('Unavailable');
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
    try {
      const v = await s.domainOperation('project_funding', hash, data.project.project.id);
      if (v.kind === 'ok') data.funding = readFunding(v.funding);
    } catch {}
  }
}
