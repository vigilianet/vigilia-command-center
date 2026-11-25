export function approvalIsUsable(a: { status: string; expires_at: string }, now = Date.now()) {
  return a.status === 'pending' && Number.isFinite(Date.parse(a.expires_at)) && Date.parse(a.expires_at) > now;
}
export function canAnalyzeAgent(a: {enabled:boolean; permissions:{read?:boolean;analyze?:boolean};allowed_project_ids:string[]}, projectId?:string|null) {
  return a.enabled && a.permissions.analyze === true && a.permissions.read === true && (a.allowed_project_ids.length === 0 || Boolean(projectId && a.allowed_project_ids.includes(projectId)));
}
export function safeSlug(name:string) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70); }
export function hasTerminalMissionStatus(status:string) { return ['completed','failed','cancelled','awaiting_approval'].includes(status); }
