import { createServerFn, createMiddleware } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { agentSchema, memorySchema, missionSchema, monitorSchema, projectSchema, providerSchema } from './schemas';
import { approvalIsUsable, safeSlug } from './policy';

export const ownerOnly = createMiddleware({type:'function'}).middleware([requireSupabaseAuth]).server(async ({context,next})=>{
  const {data:user}=await context.supabase.auth.getUser();
  const {data:role,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'owner'});
  if(error || !role || !user.user?.email_confirmed_at) throw new Error('Accès réservé au propriétaire confirmé. Votre adresse doit être autorisée pour Vigilia.');
  return next({context:{...context,email:user.user.email??''}});
});
export const getWorkspace = createServerFn({method:'GET'}).middleware([ownerOnly]).handler(async({context})=>{
  const s=context.supabase;
  const [projects,agents,missions,monitors,incidents,approvals]=await Promise.all([
    s.from('projects').select('*').order('created_at',{ascending:false}),s.from('ai_agents').select('*').order('is_lead',{ascending:false}),s.from('missions').select('*').order('created_at',{ascending:false}).limit(100),s.from('monitors').select('*').order('created_at',{ascending:false}),s.from('incidents').select('*').order('started_at',{ascending:false}).limit(100),s.from('approvals').select('*').order('created_at',{ascending:false}).limit(100)
  ]);
  const [integrations,providers,memories,logs,steps,checks]=await Promise.all([
    s.from('integrations').select('id,provider,name,status,config,permissions,last_tested_at,last_error').order('created_at'),s.from('ai_provider_keys').select('id,provider,label,model_default,fallback_model,key_fingerprint,shared_quota_group,enabled,priority,status,requests_count,errors_count,tokens_used,monthly_token_limit,last_error_message,last_used_at').order('priority'),s.from('memories').select('*').order('created_at',{ascending:false}),s.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100),s.from('mission_steps').select('*').order('step_order').limit(400),s.from('checks').select('*').order('checked_at',{ascending:false}).limit(150)
  ]);
  const telegram=await s.from('telegram_links').select('bot_username,chat_id,verified,webhook_active,notify_incidents,notify_missions,notify_approvals,last_error').maybeSingle();
  const failovers=await s.from('ai_failover_logs').select('*').order('created_at',{ascending:false}).limit(100);
  const telegramMessages=await s.from('telegram_messages').select('*').order('created_at',{ascending:false}).limit(30);
  for(const q of [projects,agents,missions,monitors,incidents,approvals,integrations,providers,memories,logs,steps,checks,telegram,failovers,telegramMessages]) if(q.error) throw new Error(q.error.message);
  return {email:context.email,projects:projects.data??[],agents:agents.data??[],missions:missions.data??[],monitors:monitors.data??[],incidents:incidents.data??[],approvals:approvals.data??[],integrations:integrations.data??[],providers:providers.data??[],memories:memories.data??[],logs:logs.data??[],steps:steps.data??[],checks:checks.data??[],telegram:telegram.data,telegramMessages:telegramMessages.data??[],failovers:failovers.data??[],backgroundAvailable:true};
});
export type Workspace=Awaited<ReturnType<typeof getWorkspace>>;

export const saveRecord=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({kind:z.enum(['project','agent','monitor','memory']),id:z.uuid().optional(),values:z.record(z.string(),z.unknown())})).handler(async({data,context})=>{
  const {containsSecret}=await import('@/lib/crypto.server');
  if(containsSecret(JSON.stringify(data.values))) throw new Error('Les secrets doivent être enregistrés uniquement dans les champs protégés des intégrations.');
  const s=context.supabase;
  if(data.kind==='project') {
    const p=projectSchema.parse(data.values); const {parseRepoSlug}=await import('@/lib/github/client.server');
    const row={...p,owner_id:context.userId,slug:safeSlug(p.name),url:p.url||null,github_repo:p.github_repo?parseRepoSlug(p.github_repo):null};
    const q=data.id?await s.from('projects').update(row).eq('id',data.id).select('id').single():await s.from('projects').insert(row).select('id').single(); if(q.error) throw new Error(q.error.message);return q.data;
  }
  if(data.kind==='agent') {
    const p=agentSchema.parse(data.values);
    if(p.allowed_project_ids.length) { const {data:owned}=await s.from('projects').select('id').in('id',p.allowed_project_ids);if(owned?.length!==p.allowed_project_ids.length)throw new Error('Projet non autorisé'); }
    if(data.id){const {data:old}=await s.from('ai_agents').select('is_lead').eq('id',data.id).single();if(old?.is_lead&&!p.enabled) throw new Error('L’agent principal ne peut pas être désactivé.');}
    const row={...p,owner_id:context.userId,slug:safeSlug(p.name)};
    const q=data.id?await s.from('ai_agents').update(row).eq('id',data.id).select('id').single():await s.from('ai_agents').insert(row).select('id').single();if(q.error)throw new Error(q.error.message);return q.data;
  }
  if(data.kind==='monitor') {
    const p=monitorSchema.parse(data.values);const {assertPublicUrl}=await import('@/lib/monitoring/ssrf');await assertPublicUrl(p.url);
    if(p.project_id){const q=await s.from('projects').select('id').eq('id',p.project_id).single();if(q.error)throw new Error('Projet non autorisé');}
    const row={...p,owner_id:context.userId};const q=data.id?await s.from('monitors').update(row).eq('id',data.id).select('id').single():await s.from('monitors').insert(row).select('id').single();if(q.error)throw new Error(q.error.message);return q.data;
  }
  const p=memorySchema.parse(data.values);
  if(p.project_id){const q=await s.from('projects').select('id').eq('id',p.project_id).single();if(q.error)throw new Error('Projet non autorisé');}
  if(p.agent_id){const q=await s.from('ai_agents').select('id').eq('id',p.agent_id).single();if(q.error)throw new Error('Agent non autorisé');}
  const row={...p,owner_id:context.userId};const q=data.id?await s.from('memories').update(row).eq('id',data.id).select('id').single():await s.from('memories').insert(row).select('id').single();if(q.error)throw new Error(q.error.message);return q.data;
});

export const createMission=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(missionSchema).handler(async({data,context})=>{
  const {containsSecret}=await import('@/lib/crypto.server');if(containsSecret(data.description))throw new Error('Retirez les secrets de votre demande.');
  if(data.project_id){const q=await context.supabase.from('projects').select('id').eq('id',data.project_id).single();if(q.error)throw new Error('Projet non autorisé');}
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const q=await supabaseAdmin.from('missions').insert({...data,owner_id:context.userId}).select('id').single();if(q.error)throw new Error(q.error.message);return q.data;
});
export const runMission=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid()})).handler(async({data,context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {executeMissionPipeline}=await import('@/lib/ai/orchestrator.server');
  return executeMissionPipeline(supabaseAdmin,context.userId,data.id);
});
export const cancelMission=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid()})).handler(async({data,context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const q=await supabaseAdmin.from('missions').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('owner_id',context.userId).eq('id',data.id).in('status',['pending','planning','investigating','in_progress','validating']).select('id').single();if(q.error)throw new Error('Cette mission ne peut plus être annulée.');return {ok:true};
});
export const checkMonitor=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid()})).handler(async({data,context})=>{
  const q=await context.supabase.from('monitors').select('*').eq('id',data.id).single();if(q.error)throw new Error('Contrôle non autorisé');
  const {performCheck,recordResult}=await import('@/lib/monitoring/check');const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const r=await performCheck(q.data);await recordResult(supabaseAdmin,q.data,r);return r;
});
export const decideApproval=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid(),approve:z.boolean(),note:z.string().max(2000).default('')})).handler(async({data,context})=>{
  const q=await context.supabase.from('approvals').select('*').eq('id',data.id).single();if(q.error||!approvalIsUsable(q.data))throw new Error('Approbation expirée ou déjà décidée.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const update=await supabaseAdmin.from('approvals').update({status:data.approve?'approved':'rejected',decided_at:new Date().toISOString(),decision_note:data.note}).eq('id',data.id).eq('owner_id',context.userId).eq('status','pending').gt('expires_at',new Date().toISOString()).select('id').single();if(update.error)throw new Error('Décision déjà enregistrée ou expirée');
  await supabaseAdmin.from('audit_logs').insert({owner_id:context.userId,actor_type:'user',actor_name:context.email,action:data.approve?'approval_granted':'approval_rejected',resource_type:'approval',resource_id:data.id,details:{operation:q.data.operation,repo:q.data.target_repo,files:q.data.target_files}});
  return {ok:true};
});
export const addProvider=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(providerSchema).handler(async({data,context})=>{
  const {encryptSecret,fingerprintSecret}=await import('@/lib/crypto.server');const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {secret,...values}=data;const q=await supabaseAdmin.from('ai_provider_keys').insert({...values,owner_id:context.userId,encrypted_secret:await encryptSecret(secret),key_fingerprint:fingerprintSecret(secret),status:'disabled',enabled:false}).select('id').single();if(q.error)throw new Error(q.error.message);return q.data;
});
export const testProvider=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid()})).handler(async({data,context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const q=await supabaseAdmin.from('ai_provider_keys').select('*').eq('owner_id',context.userId).eq('id',data.id).single();if(q.error)throw new Error('Fournisseur non autorisé');
  const {testProviderKey}=await import('@/lib/ai/providers.server');await testProviderKey(q.data);
  await supabaseAdmin.from('ai_provider_keys').update({enabled:true,status:'active',consecutive_failures:0,circuit_open_until:null,last_error_message:null}).eq('id',data.id);return {ok:true};
});
export const toggleProvider=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid(),enabled:z.boolean()})).handler(async({data,context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const q=await supabaseAdmin.from('ai_provider_keys').update({enabled:data.enabled,status:data.enabled?'active':'disabled'}).eq('id',data.id).eq('owner_id',context.userId).select('id').single();if(q.error)throw new Error(q.error.message);return {ok:true};
});
export const deleteProvider=createServerFn({method:'POST'}).middleware([ownerOnly]).inputValidator(z.object({id:z.uuid()})).handler(async({data,context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:row}=await supabaseAdmin.from('ai_provider_keys').select('provider').eq('id',data.id).eq('owner_id',context.userId).single();
  if(row?.provider==='lovable_gateway') throw new Error('La passerelle IA intégrée peut être désactivée, pas supprimée.');
  const q=await supabaseAdmin.from('ai_provider_keys').delete().eq('id',data.id).eq('owner_id',context.userId);if(q.error)throw new Error(q.error.message);return {ok:true};
});
