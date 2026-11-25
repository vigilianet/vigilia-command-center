export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_agents: {
        Row: {
          allowed_project_ids: string[]
          created_at: string
          enabled: boolean
          id: string
          instructions: string
          is_builtin: boolean
          is_lead: boolean
          name: string
          owner_id: string
          permissions: Json
          role_title: string
          skills: Json
          slug: string
          specialty: string
          tools: Json
          updated_at: string
        }
        Insert: {
          allowed_project_ids?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          instructions: string
          is_builtin?: boolean
          is_lead?: boolean
          name: string
          owner_id: string
          permissions?: Json
          role_title: string
          skills?: Json
          slug: string
          specialty: string
          tools?: Json
          updated_at?: string
        }
        Update: {
          allowed_project_ids?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          instructions?: string
          is_builtin?: boolean
          is_lead?: boolean
          name?: string
          owner_id?: string
          permissions?: Json
          role_title?: string
          skills?: Json
          slug?: string
          specialty?: string
          tools?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_failover_logs: {
        Row: {
          created_at: string
          error_type: string
          from_key_id: string | null
          http_status: number | null
          id: string
          message: string
          mission_id: string | null
          owner_id: string
          switched: boolean
          to_key_id: string | null
        }
        Insert: {
          created_at?: string
          error_type: string
          from_key_id?: string | null
          http_status?: number | null
          id?: string
          message: string
          mission_id?: string | null
          owner_id: string
          switched?: boolean
          to_key_id?: string | null
        }
        Update: {
          created_at?: string
          error_type?: string
          from_key_id?: string | null
          http_status?: number | null
          id?: string
          message?: string
          mission_id?: string | null
          owner_id?: string
          switched?: boolean
          to_key_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_failover_logs_from_key_id_fkey"
            columns: ["from_key_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_failover_logs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_failover_logs_to_key_id_fkey"
            columns: ["to_key_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_keys: {
        Row: {
          base_url: string | null
          circuit_open_until: string | null
          consecutive_failures: number
          created_at: string
          enabled: boolean
          encrypted_secret: string | null
          errors_count: number
          fallback_model: string | null
          id: string
          key_fingerprint: string | null
          label: string
          last_error_code: number | null
          last_error_message: string | null
          last_used_at: string | null
          model_default: string
          monthly_token_limit: number
          owner_id: string
          priority: number
          provider: string
          requests_count: number
          shared_quota_group: string | null
          status: string
          tokens_used: number
        }
        Insert: {
          base_url?: string | null
          circuit_open_until?: string | null
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          encrypted_secret?: string | null
          errors_count?: number
          fallback_model?: string | null
          id?: string
          key_fingerprint?: string | null
          label: string
          last_error_code?: number | null
          last_error_message?: string | null
          last_used_at?: string | null
          model_default: string
          monthly_token_limit?: number
          owner_id: string
          priority?: number
          provider: string
          requests_count?: number
          shared_quota_group?: string | null
          status?: string
          tokens_used?: number
        }
        Update: {
          base_url?: string | null
          circuit_open_until?: string | null
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          encrypted_secret?: string | null
          errors_count?: number
          fallback_model?: string | null
          id?: string
          key_fingerprint?: string | null
          label?: string
          last_error_code?: number | null
          last_error_message?: string | null
          last_used_at?: string | null
          model_default?: string
          monthly_token_limit?: number
          owner_id?: string
          priority?: number
          provider?: string
          requests_count?: number
          shared_quota_group?: string | null
          status?: string
          tokens_used?: number
        }
        Relationships: []
      }
      approvals: {
        Row: {
          action_type: string
          created_at: string
          decided_at: string | null
          decision_note: string | null
          executed_at: string | null
          execution_result: Json | null
          expected_result: string
          expires_at: string
          id: string
          mission_id: string | null
          operation: string
          owner_id: string
          payload: Json
          project_id: string | null
          risk_level: Database["public"]["Enums"]["incident_severity"]
          risk_summary: string
          status: Database["public"]["Enums"]["approval_status"]
          step_id: string | null
          target_files: Json
          target_repo: string | null
          title: string
        }
        Insert: {
          action_type: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expected_result: string
          expires_at?: string
          id?: string
          mission_id?: string | null
          operation: string
          owner_id: string
          payload?: Json
          project_id?: string | null
          risk_level?: Database["public"]["Enums"]["incident_severity"]
          risk_summary: string
          status?: Database["public"]["Enums"]["approval_status"]
          step_id?: string | null
          target_files?: Json
          target_repo?: string | null
          title: string
        }
        Update: {
          action_type?: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expected_result?: string
          expires_at?: string
          id?: string
          mission_id?: string | null
          operation?: string
          owner_id?: string
          payload?: Json
          project_id?: string | null
          risk_level?: Database["public"]["Enums"]["incident_severity"]
          risk_summary?: string
          status?: Database["public"]["Enums"]["approval_status"]
          step_id?: string | null
          target_files?: Json
          target_repo?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "mission_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_name: string
          actor_type: string
          created_at: string
          details: Json | null
          id: string
          owner_id: string
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          actor_name: string
          actor_type: string
          created_at?: string
          details?: Json | null
          id?: string
          owner_id: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          actor_name?: string
          actor_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          owner_id?: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: []
      }
      checks: {
        Row: {
          checked_at: string
          error: string | null
          id: string
          monitor_id: string
          ok: boolean
          owner_id: string
          response_ms: number | null
          status_code: number | null
        }
        Insert: {
          checked_at?: string
          error?: string | null
          id?: string
          monitor_id: string
          ok: boolean
          owner_id: string
          response_ms?: number | null
          status_code?: number | null
        }
        Update: {
          checked_at?: string
          error?: string | null
          id?: string
          monitor_id?: string
          ok?: boolean
          owner_id?: string
          response_ms?: number | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_events: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          message: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          message: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          message?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          ai_analysis: string | null
          created_at: string
          description: string | null
          id: string
          monitor_id: string | null
          notified_telegram_at: string | null
          owner_id: string
          project_id: string | null
          recommendations: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          started_at: string
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          type: string
        }
        Insert: {
          ai_analysis?: string | null
          created_at?: string
          description?: string | null
          id?: string
          monitor_id?: string | null
          notified_telegram_at?: string | null
          owner_id: string
          project_id?: string | null
          recommendations?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          started_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          type: string
        }
        Update: {
          ai_analysis?: string | null
          created_at?: string
          description?: string | null
          id?: string
          monitor_id?: string | null
          notified_telegram_at?: string | null
          owner_id?: string
          project_id?: string | null
          recommendations?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          started_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          encrypted_credentials: string | null
          id: string
          last_error: string | null
          last_tested_at: string | null
          name: string
          owner_id: string
          permissions: Json
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          encrypted_credentials?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          owner_id: string
          permissions?: Json
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          encrypted_credentials?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          owner_id?: string
          permissions?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          agent_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          obsolete: boolean
          owner_id: string
          project_id: string | null
          scope: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          category: string
          content: string
          created_at?: string
          id?: string
          obsolete?: boolean
          owner_id: string
          project_id?: string | null
          scope: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          obsolete?: boolean
          owner_id?: string
          project_id?: string | null
          scope?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_steps: {
        Row: {
          agent_id: string | null
          agent_name: string
          completed_at: string | null
          created_at: string
          depends_on: string[]
          id: string
          input_context: Json | null
          mission_id: string
          output_data: Json | null
          output_summary: string | null
          owner_id: string
          retry_count: number
          status: Database["public"]["Enums"]["step_status"]
          step_order: number
          title: string
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          id?: string
          input_context?: Json | null
          mission_id: string
          output_data?: Json | null
          output_summary?: string | null
          owner_id: string
          retry_count?: number
          status?: Database["public"]["Enums"]["step_status"]
          step_order: number
          title: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          id?: string
          input_context?: Json | null
          mission_id?: string
          output_data?: Json | null
          output_summary?: string | null
          owner_id?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["step_status"]
          step_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_steps_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          assigned_agent_ids: string[]
          completed_at: string | null
          created_at: string
          description: string
          final_report: string | null
          id: string
          max_steps: number
          owner_id: string
          priority: Database["public"]["Enums"]["mission_priority"]
          progress: number
          project_id: string | null
          source: string
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          structured_report: Json | null
          title: string
          token_budget: number
          tokens_used: number
          updated_at: string
        }
        Insert: {
          assigned_agent_ids?: string[]
          completed_at?: string | null
          created_at?: string
          description: string
          final_report?: string | null
          id?: string
          max_steps?: number
          owner_id: string
          priority?: Database["public"]["Enums"]["mission_priority"]
          progress?: number
          project_id?: string | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          structured_report?: Json | null
          title: string
          token_budget?: number
          tokens_used?: number
          updated_at?: string
        }
        Update: {
          assigned_agent_ids?: string[]
          completed_at?: string | null
          created_at?: string
          description?: string
          final_report?: string | null
          id?: string
          max_steps?: number
          owner_id?: string
          priority?: Database["public"]["Enums"]["mission_priority"]
          progress?: number
          project_id?: string | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          structured_report?: Json | null
          title?: string
          token_budget?: number
          tokens_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors: {
        Row: {
          category: string | null
          check_type: string
          created_at: string
          description: string | null
          enabled: boolean
          environment: Database["public"]["Enums"]["app_env"]
          expected_keyword: string | null
          expected_status: number
          http_method: string
          id: string
          interval_minutes: number
          last_checked_at: string | null
          last_response_ms: number | null
          last_status: string
          name: string
          owner_id: string
          project_id: string | null
          timeout_ms: number
          url: string
        }
        Insert: {
          category?: string | null
          check_type?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: Database["public"]["Enums"]["app_env"]
          expected_keyword?: string | null
          expected_status?: number
          http_method?: string
          id?: string
          interval_minutes?: number
          last_checked_at?: string | null
          last_response_ms?: number | null
          last_status?: string
          name: string
          owner_id: string
          project_id?: string | null
          timeout_ms?: number
          url: string
        }
        Update: {
          category?: string | null
          check_type?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: Database["public"]["Enums"]["app_env"]
          expected_keyword?: string | null
          expected_status?: number
          http_method?: string
          id?: string
          interval_minutes?: number
          last_checked_at?: string | null
          last_response_ms?: number | null
          last_status?: string
          name?: string
          owner_id?: string
          project_id?: string | null
          timeout_ms?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          environments: Json
          github_repo: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          services: Json
          slug: string
          status: string
          technologies: Json
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          environments?: Json
          github_repo?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          services?: Json
          slug: string
          status?: string
          technologies?: Json
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          environments?: Json
          github_repo?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          services?: Json
          slug?: string
          status?: string
          technologies?: Json
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          bot_username: string | null
          chat_id: number | null
          created_at: string
          encrypted_bot_token: string | null
          id: string
          last_error: string | null
          notify_approvals: boolean
          notify_incidents: boolean
          notify_missions: boolean
          owner_id: string
          updated_at: string
          verification_code: string | null
          verification_expires_at: string | null
          verified: boolean
          webhook_active: boolean
          webhook_secret_hash: string | null
          webhook_url: string | null
        }
        Insert: {
          bot_username?: string | null
          chat_id?: number | null
          created_at?: string
          encrypted_bot_token?: string | null
          id?: string
          last_error?: string | null
          notify_approvals?: boolean
          notify_incidents?: boolean
          notify_missions?: boolean
          owner_id: string
          updated_at?: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified?: boolean
          webhook_active?: boolean
          webhook_secret_hash?: string | null
          webhook_url?: string | null
        }
        Update: {
          bot_username?: string | null
          chat_id?: number | null
          created_at?: string
          encrypted_bot_token?: string | null
          id?: string
          last_error?: string | null
          notify_approvals?: boolean
          notify_incidents?: boolean
          notify_missions?: boolean
          owner_id?: string
          updated_at?: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified?: boolean
          webhook_active?: boolean
          webhook_secret_hash?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          direction: string
          owner_id: string
          raw_update: Json | null
          text: string | null
          update_id: number
          user_id: number | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          direction?: string
          owner_id: string
          raw_update?: Json | null
          text?: string | null
          update_id: number
          user_id?: number | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          direction?: string
          owner_id?: string
          raw_update?: Json | null
          text?: string | null
          update_id?: number
          user_id?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_access: {
        Row: {
          created_at: string
          owner_email: string
          singleton: boolean
        }
        Insert: {
          created_at?: string
          owner_email: string
          singleton?: boolean
        }
        Update: {
          created_at?: string
          owner_email?: string
          singleton?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_owner_workspace: {
        Args: { _owner_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_env: "production" | "staging" | "development"
      app_role: "owner" | "admin"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "executed"
      incident_severity: "low" | "medium" | "high" | "critical"
      incident_status: "open" | "in_progress" | "resolved"
      mission_priority: "low" | "medium" | "high" | "critical"
      mission_status:
        | "pending"
        | "planning"
        | "investigating"
        | "in_progress"
        | "awaiting_approval"
        | "validating"
        | "completed"
        | "failed"
        | "cancelled"
      step_status:
        | "pending"
        | "running"
        | "awaiting_approval"
        | "completed"
        | "failed"
        | "skipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_env: ["production", "staging", "development"],
      app_role: ["owner", "admin"],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "executed",
      ],
      incident_severity: ["low", "medium", "high", "critical"],
      incident_status: ["open", "in_progress", "resolved"],
      mission_priority: ["low", "medium", "high", "critical"],
      mission_status: [
        "pending",
        "planning",
        "investigating",
        "in_progress",
        "awaiting_approval",
        "validating",
        "completed",
        "failed",
        "cancelled",
      ],
      step_status: [
        "pending",
        "running",
        "awaiting_approval",
        "completed",
        "failed",
        "skipped",
      ],
    },
  },
} as const
