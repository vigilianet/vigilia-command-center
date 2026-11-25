CREATE TYPE public.app_role AS ENUM ('owner', 'admin');
CREATE TYPE public.app_env AS ENUM ('production', 'staging', 'development');
CREATE TYPE public.incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.incident_status AS ENUM ('open', 'in_progress', 'resolved');
CREATE TYPE public.mission_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.mission_status AS ENUM ('pending','planning','investigating','in_progress','awaiting_approval','validating','completed','failed','cancelled');
CREATE TYPE public.step_status AS ENUM ('pending','running','awaiting_approval','completed','failed','skipped');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','expired','executed');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 120),
  description text, category text,
  url text CHECK (url IS NULL OR (url ~* '^https?://' AND char_length(url) <= 2048)),
  github_repo text,
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  environments jsonb NOT NULL DEFAULT '[]'::jsonb,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','degraded','maintenance','archived','unknown')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner projects" ON public.projects FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (url ~* '^https?://' AND char_length(url) <= 2048),
  description text,
  environment public.app_env NOT NULL DEFAULT 'production',
  category text,
  check_type text NOT NULL DEFAULT 'http' CHECK (check_type IN ('http','api')),
  http_method text NOT NULL DEFAULT 'GET' CHECK (http_method IN ('GET','HEAD','POST')),
  expected_status int NOT NULL DEFAULT 200,
  expected_keyword text,
  interval_minutes int NOT NULL DEFAULT 5 CHECK (interval_minutes IN (1,5,10,15,30,60)),
  timeout_ms int NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  enabled boolean NOT NULL DEFAULT true,
  last_status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  last_response_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitors TO authenticated;
GRANT ALL ON public.monitors TO service_role;
ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner monitors" ON public.monitors FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES public.monitors(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL, status_code int, response_ms int, error text
);
CREATE INDEX idx_checks_monitor_at ON public.checks(monitor_id, checked_at DESC);
CREATE INDEX idx_checks_owner_at ON public.checks(owner_id, checked_at DESC);
GRANT SELECT ON public.checks TO authenticated;
GRANT ALL ON public.checks TO service_role;
ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner checks" ON public.checks FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  monitor_id uuid REFERENCES public.monitors(id) ON DELETE SET NULL,
  type text NOT NULL,
  severity public.incident_severity NOT NULL DEFAULT 'medium',
  status public.incident_status NOT NULL DEFAULT 'open',
  title text NOT NULL, description text, ai_analysis text, recommendations text,
  notified_telegram_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner incidents" ON public.incidents FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE UNIQUE INDEX single_open_monitor_incident ON public.incidents(monitor_id) WHERE status <> 'resolved' AND monitor_id IS NOT NULL;

CREATE TABLE public.incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.incident_events TO authenticated;
GRANT ALL ON public.incident_events TO service_role;
ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner incident_events" ON public.incident_events FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role_title text NOT NULL, specialty text NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  is_builtin boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  instructions text NOT NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_project_ids uuid[] NOT NULL DEFAULT '{}',
  permissions jsonb NOT NULL DEFAULT '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner ai_agents" ON public.ai_agents FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL,
  priority public.mission_priority NOT NULL DEFAULT 'medium',
  status public.mission_status NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','telegram','monitoring')),
  assigned_agent_ids uuid[] NOT NULL DEFAULT '{}',
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  final_report text, structured_report jsonb,
  token_budget int NOT NULL DEFAULT 32000 CHECK (token_budget BETWEEN 1000 AND 100000),
  tokens_used int NOT NULL DEFAULT 0,
  max_steps int NOT NULL DEFAULT 8 CHECK (max_steps BETWEEN 1 AND 8),
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_missions_owner_created ON public.missions(owner_id, created_at DESC);
GRANT SELECT ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner missions" ON public.missions FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.mission_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  step_order int NOT NULL,
  title text NOT NULL,
  status public.step_status NOT NULL DEFAULT 'pending',
  depends_on uuid[] NOT NULL DEFAULT '{}',
  input_context jsonb, output_summary text, output_data jsonb,
  retry_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_mission_steps_mission ON public.mission_steps(mission_id, step_order);
GRANT SELECT ON public.mission_steps TO authenticated;
GRANT ALL ON public.mission_steps TO service_role;
ALTER TABLE public.mission_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner mission_steps" ON public.mission_steps FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  step_id uuid REFERENCES public.mission_steps(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('github_write','deploy','delete','migration','sensitive_config','permissions','irreversible')),
  title text NOT NULL, operation text NOT NULL, target_repo text,
  target_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_level public.incident_severity NOT NULL DEFAULT 'medium',
  risk_summary text NOT NULL, expected_result text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.approval_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_at timestamptz, decision_note text, executed_at timestamptz, execution_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_owner_status ON public.approvals(owner_id, status, created_at DESC);
GRANT SELECT ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner approvals" ON public.approvals FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('github','supabase','vercel','ubuntu_ssh','telegram','webhook','monitoring','network','external_api')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','disconnected','connected','error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_credentials text,
  permissions jsonb NOT NULL DEFAULT '{"read":true,"write_requires_approval":true}'::jsonb,
  last_tested_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id,owner_id,provider,name,status,config,permissions,last_tested_at,last_error,created_at,updated_at) ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner integrations" ON public.integrations FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.ai_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('lovable_gateway','openai','gemini','anthropic','openrouter','custom')),
  label text NOT NULL, model_default text NOT NULL, fallback_model text, base_url text,
  encrypted_secret text, key_fingerprint text, shared_quota_group text,
  enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rate_limited','invalid','permission_error','circuit_open','disabled')),
  circuit_open_until timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  requests_count int NOT NULL DEFAULT 0,
  errors_count int NOT NULL DEFAULT 0,
  tokens_used int NOT NULL DEFAULT 0,
  monthly_token_limit int NOT NULL DEFAULT 1000000,
  last_error_code int, last_error_message text, last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id,owner_id,provider,label,model_default,fallback_model,base_url,key_fingerprint,shared_quota_group,enabled,priority,status,circuit_open_until,consecutive_failures,requests_count,errors_count,tokens_used,monthly_token_limit,last_error_code,last_error_message,last_used_at,created_at) ON public.ai_provider_keys TO authenticated;
GRANT ALL ON public.ai_provider_keys TO service_role;
ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner ai_provider_keys" ON public.ai_provider_keys FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.ai_failover_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  from_key_id uuid REFERENCES public.ai_provider_keys(id) ON DELETE SET NULL,
  to_key_id uuid REFERENCES public.ai_provider_keys(id) ON DELETE SET NULL,
  error_type text NOT NULL CHECK (error_type IN ('401_invalid','403_permission','429_quota','5xx_unavailable','network','prompt_error')),
  http_status int, message text NOT NULL,
  switched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_failover_logs TO authenticated;
GRANT ALL ON public.ai_failover_logs TO service_role;
ALTER TABLE public.ai_failover_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner ai_failover_logs" ON public.ai_failover_logs FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  encrypted_bot_token text, webhook_secret_hash text, bot_username text,
  chat_id bigint,
  verified boolean NOT NULL DEFAULT false,
  verification_code text, verification_expires_at timestamptz, webhook_url text,
  webhook_active boolean NOT NULL DEFAULT false,
  notify_incidents boolean NOT NULL DEFAULT true,
  notify_missions boolean NOT NULL DEFAULT true,
  notify_approvals boolean NOT NULL DEFAULT true,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id,owner_id,bot_username,chat_id,verified,webhook_active,notify_incidents,notify_missions,notify_approvals,last_error,created_at,updated_at) ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner telegram_links" ON public.telegram_links FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.telegram_messages (
  update_id bigint PRIMARY KEY,
  owner_id uuid NOT NULL,
  chat_id bigint NOT NULL, user_id bigint,
  direction text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  text text, raw_update jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_messages_owner ON public.telegram_messages(owner_id, created_at DESC);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner telegram_messages" ON public.telegram_messages FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global','project','agent')),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('decision','investigation','preference','documentation','knowledge')),
  title text NOT NULL, content text NOT NULL,
  obsolete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_owner_scope ON public.memories(owner_id, scope, obsolete);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner memories" ON public.memories FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user','agent','system','telegram')),
  actor_name text NOT NULL, action text NOT NULL,
  resource_type text, resource_id text, details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_owner_at ON public.audit_logs(owner_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.workspace_access (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_access TO service_role;
ALTER TABLE public.workspace_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.workspace_access(singleton, owner_email)
VALUES (true, 'Kayoyolandry@gmail.com')
ON CONFLICT (singleton) DO UPDATE SET owner_email = EXCLUDED.owner_email;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['projects','monitors','checks','incidents','incident_events','ai_agents','missions','mission_steps','approvals','integrations','ai_provider_keys','ai_failover_logs','telegram_links','telegram_messages','memories','audit_logs'] LOOP EXECUTE format('CREATE POLICY personal_owner_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''owner''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''owner''::public.app_role))',t); END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.bootstrap_owner_workspace(_owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ai_agents (owner_id, slug, name, role_title, specialty, is_lead, is_builtin, instructions, skills, tools, permissions)
  VALUES
    (_owner_id, 'collaborator-lead', 'Vigilia Lead', 'Directeur des opérations techniques', 'Orchestration & Diagnostic', true, true,
     'Tu es l''agent principal en mode COLLABORATOR, directeur des opérations techniques personnel. Tu comprends les demandes en langage naturel, identifies le projet concerné, sélectionnes uniquement les spécialistes nécessaires (ou travailles seul si simple), décomposes en sous-tâches claires, vérifies les faits avant de conclure et demandes toujours une approbation explicite avant toute opération sensible (écriture GitHub, prod, suppression, migration, config sensible).',
     '["orchestration","diagnostic","architecture","coordination","gestion-risques"]'::jsonb,
     '["project_context","github_read","monitoring_read","memory_read","request_approval"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":true}'::jsonb),
    (_owner_id, 'software-engineer', 'Ingénieur Logiciel', 'Spécialiste Code & Architecture', 'Développement full-stack & débogage', false, true,
     'Tu analyses le code source, les commits récents, les flux d''authentification, les API et les dépendances. Tu sépares toujours les faits observés des hypothèses et tu prépares des correctifs propres sans jamais toucher directement à la branche principale.',
     '["typescript","react","nodejs","sql","debugging","code-review"]'::jsonb,
     '["github_read","memory_read","prepare_patch"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'sysadmin-ubuntu', 'Admin Systèmes Linux', 'Spécialiste Linux / Ubuntu', 'Serveurs Ubuntu, systemd, Docker, ressources', false, true,
     'Tu diagnostiques l''infrastructure Linux/Ubuntu : services systemd, conteneurs Docker, espace disque, mémoire, journaux système et durcissement. Tu ne prétends jamais avoir exécuté une commande sans accès réel configuré.',
     '["ubuntu","linux","systemd","docker","nginx","ssh"]'::jsonb,
     '["integration_check","memory_read"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'network-engineer', 'Ingénieur Réseaux', 'Spécialiste DNS, TLS & Routage', 'DNS, pare-feu, proxy inverse, latence, VPN', false, true,
     'Tu enquêtes sur la connectivité, la résolution DNS, les certificats TLS, les timeouts, les règles pare-feu et les reverse proxies.',
     '["dns","tls","http","vpn","firewall","reverse-proxy"]'::jsonb,
     '["monitoring_read","integration_check"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'cybersecurity-expert', 'Expert Cybersécurité', 'Spécialiste Sécurité & Conformité', 'RLS, secrets, auth OAuth, vulnérabilités, moindre privilège', false, true,
     'Tu vérifies l''exposition de secrets, les politiques d''accès, les callbacks OAuth, les en-têtes de sécurité et le respect du moindre privilège. Tu bloques toute fuite de secret.',
     '["owasp","oauth","rls","secrets-audit","hardening"]'::jsonb,
     '["github_read","audit_read","memory_read"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'monitoring-diagnostics', 'Spécialiste Surveillance', 'Observabilité & Diagnostic', 'Disponibilité, latence, corrélation d''incidents', false, true,
     'Tu corrèles les contrôles HTTP/API, les temps de réponse, les codes d''erreur et l''historique d''incidents pour identifier la cause racine et évaluer la gravité.',
     '["uptime","latency","incident-triage","root-cause-analysis"]'::jsonb,
     '["monitoring_read","incident_read","memory_read"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'automation-engineer', 'Ingénieur Automatisation', 'CI/CD, Webhooks & Workflows', 'Pipelines, tâches périodiques, webhooks, Telegram', false, true,
     'Tu conçois et fiabilises les automatisations, webhooks, alertes Telegram et tâches de fond avec gestion des réessais et idempotence.',
     '["ci-cd","webhooks","cron","telegram","idempotency"]'::jsonb,
     '["github_read","integration_check"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb),
    (_owner_id, 'tech-project-manager', 'Chef de Projet Technique', 'Planification & Synthèse', 'Découpage, priorisation, suivi de risques, restitution', false, true,
     'Tu structures les plans d''action, identifies les dépendances, évalues les risques et consolides des synthèses exploitables avec étapes claires.',
     '["planning","prioritization","risk-management","documentation"]'::jsonb,
     '["project_context","memory_read"]'::jsonb,
     '{"read":true,"analyze":true,"prepare":true,"execute_with_approval":false}'::jsonb)
  ON CONFLICT (owner_id, slug) DO NOTHING;

  INSERT INTO public.ai_provider_keys (owner_id, provider, label, model_default, fallback_model, enabled, priority, status, monthly_token_limit)
  SELECT _owner_id, 'lovable_gateway', 'Passerelle IA intégrée (défaut)', 'openai/gpt-6-astra', 'google/gemini-3.8-flash', true, 1, 'active', 2000000
  WHERE NOT EXISTS (SELECT 1 FROM public.ai_provider_keys WHERE owner_id = _owner_id AND provider = 'lovable_gateway');
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE allowed text;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
  SELECT owner_email INTO allowed FROM public.workspace_access WHERE singleton;
  IF allowed IS NOT NULL AND lower(allowed) = lower(NEW.email) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    PERFORM public.bootstrap_owner_workspace(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_owner_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.bootstrap_owner_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_owner_workspace(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;