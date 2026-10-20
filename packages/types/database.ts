// このファイルは supabase/release/types.mjs が実DBから生成する。手で編集しない。
// 更新: node supabase/release/types.mjs --env=dev --write
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
  private: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      vw_trial_application_list: {
        Row: {
          accepted_at: string | null
          application_id: string | null
          apply_count: number | null
          country_city: string | null
          email: string | null
          first_name: string | null
          first_name_latin: string | null
          full_name: string | null
          full_name_latin: string | null
          insert_date: string | null
          invitation_expires_at: string | null
          last_applied_at: string | null
          last_name: string | null
          last_name_latin: string | null
          message: string | null
          occupation: number | null
          occupation_other: string | null
          referral_source: number | null
          referral_source_other: string | null
          status: string | null
          timezone: string | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_user_list: {
        Row: {
          client_id: string | null
          client_name: string | null
          confirmed_at: string | null
          contract_id: string | null
          contract_name: string | null
          email: string | null
          id: string | null
          insert_date: string | null
          last_mail_error: string | null
          last_sign_in_at: string | null
          license_end_date: string | null
          license_id: string | null
          license_start_date: string | null
          license_state: string | null
          license_status: number | null
          mail_sent_at: string | null
          plan_name: string | null
          roles: string[] | null
          user_id: number | null
          user_name: string | null
          user_status: number | null
          user_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_monitor_client_id: { Args: never; Returns: string }
      get_monitor_target_users: {
        Args: {
          _client_id: string | null
          _end_date: string | null
          _include_monitor?: boolean | null
          _start_date: string | null
        }
        Returns: {
          contract_id: string
          license_end_date: string
          license_id: string
          license_start_date: string
          license_status: number
          plan_name: string
          user_id: string
        }[]
      }
      invoke_mail_dispatch: { Args: { p_body?: Json }; Returns: undefined }
      invoke_mail_dispatch_if_due: { Args: never; Returns: undefined }
      purge_cron_run_history: {
        Args: { p_retention_days?: number | null }
        Returns: number
      }
      purge_mail_history: {
        Args: { p_retention_days?: number | null }
        Returns: number
      }
      request_mail_dispatch: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      com_m_ai_knowledge_base: {
        Row: {
          body: string
          created_by: string | null
          embedding: string | null
          embedding_model: string | null
          insert_date: string
          knowledge_id: string
          metadata: Json
          source_type: string
          title: string
          update_date: string
        }
        Insert: {
          body: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          insert_date?: string
          knowledge_id?: string
          metadata?: Json
          source_type: string
          title: string
          update_date?: string
        }
        Update: {
          body?: string
          created_by?: string | null
          embedding?: string | null
          embedding_model?: string | null
          insert_date?: string
          knowledge_id?: string
          metadata?: Json
          source_type?: string
          title?: string
          update_date?: string
        }
        Relationships: []
      }
      com_m_calendar_event: {
        Row: {
          calendar_event_id: string
          client_id: string | null
          description: string | null
          end_datetime: string | null
          event_type: string
          insert_date: string
          is_published: boolean
          location_url: string | null
          rsvp_enabled: boolean
          series_id: string | null
          start_datetime: string
          target_type: "ALL" | "CLIENT" | "COACH"
          title: string
          update_date: string
        }
        Insert: {
          calendar_event_id?: string
          client_id?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type: string
          insert_date?: string
          is_published?: boolean
          location_url?: string | null
          rsvp_enabled?: boolean
          series_id?: string | null
          start_datetime: string
          target_type?: "ALL" | "CLIENT" | "COACH"
          title: string
          update_date?: string
        }
        Update: {
          calendar_event_id?: string
          client_id?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string
          insert_date?: string
          is_published?: boolean
          location_url?: string | null
          rsvp_enabled?: boolean
          series_id?: string | null
          start_datetime?: string
          target_type?: "ALL" | "CLIENT" | "COACH"
          title?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_calendar_event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "com_m_calendar_event_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "com_m_calendar_event_series"
            referencedColumns: ["series_id"]
          },
        ]
      }
      com_m_calendar_event_series: {
        Row: {
          description: string | null
          event_type: string
          insert_date: string
          series_id: string
          title: string
          update_date: string
        }
        Insert: {
          description?: string | null
          event_type?: string
          insert_date?: string
          series_id?: string
          title: string
          update_date?: string
        }
        Update: {
          description?: string | null
          event_type?: string
          insert_date?: string
          series_id?: string
          title?: string
          update_date?: string
        }
        Relationships: []
      }
      com_m_client: {
        Row: {
          client_id: string
          client_name: string
          client_type: 0 | 1 | 2
          industry_type: number
          insert_date: string
          status: 1 | 9
          update_date: string
        }
        Insert: {
          client_id?: string
          client_name: string
          client_type?: 0 | 1 | 2
          industry_type?: number
          insert_date?: string
          status?: 1 | 9
          update_date?: string
        }
        Update: {
          client_id?: string
          client_name?: string
          client_type?: 0 | 1 | 2
          industry_type?: number
          insert_date?: string
          status?: 1 | 9
          update_date?: string
        }
        Relationships: []
      }
      com_m_coach_availability: {
        Row: {
          availability_id: string
          coach_id: string
          day_of_week: number
          end_time: string
          insert_date: string
          start_time: string
          update_date: string
        }
        Insert: {
          availability_id?: string
          coach_id: string
          day_of_week: number
          end_time: string
          insert_date?: string
          start_time: string
          update_date?: string
        }
        Update: {
          availability_id?: string
          coach_id?: string
          day_of_week?: number
          end_time?: string
          insert_date?: string
          start_time?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_coach_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_m_coach_matching_suspension: {
        Row: {
          coach_id: string
          insert_date: string
          note: string | null
          suspended_by: string | null
          update_date: string
        }
        Insert: {
          coach_id: string
          insert_date?: string
          note?: string | null
          suspended_by?: string | null
          update_date?: string
        }
        Update: {
          coach_id?: string
          insert_date?: string
          note?: string | null
          suspended_by?: string | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_coach_matching_suspension_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_coach_matching_suspension_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_m_coach_profile: {
        Row: {
          accepting_students: boolean
          availability_confirmed_at: string | null
          coach_since: string | null
          country_code: string | null
          education: string | null
          insert_date: string
          intro_video_path: string | null
          introduction: string | null
          job_experience: string | null
          qualifications: string | null
          teaching_years: number | null
          update_date: string
          user_id: string
          zoom_meeting_url: string | null
        }
        Insert: {
          accepting_students?: boolean
          availability_confirmed_at?: string | null
          coach_since?: string | null
          country_code?: string | null
          education?: string | null
          insert_date?: string
          intro_video_path?: string | null
          introduction?: string | null
          job_experience?: string | null
          qualifications?: string | null
          teaching_years?: number | null
          update_date?: string
          user_id: string
          zoom_meeting_url?: string | null
        }
        Update: {
          accepting_students?: boolean
          availability_confirmed_at?: string | null
          coach_since?: string | null
          country_code?: string | null
          education?: string | null
          insert_date?: string
          intro_video_path?: string | null
          introduction?: string | null
          job_experience?: string | null
          qualifications?: string | null
          teaching_years?: number | null
          update_date?: string
          user_id?: string
          zoom_meeting_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_m_coach_profile_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "com_m_country"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "com_m_coach_profile_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_m_coach_specialty: {
        Row: {
          insert_date: string
          is_active: boolean
          kind: "field" | "skill"
          name_en: string
          name_ja: string
          sort_no: number
          specialty_code: string
          update_date: string
        }
        Insert: {
          insert_date?: string
          is_active?: boolean
          kind?: "field" | "skill"
          name_en: string
          name_ja: string
          sort_no?: number
          specialty_code: string
          update_date?: string
        }
        Update: {
          insert_date?: string
          is_active?: boolean
          kind?: "field" | "skill"
          name_en?: string
          name_ja?: string
          sort_no?: number
          specialty_code?: string
          update_date?: string
        }
        Relationships: []
      }
      com_m_coach_specialty_assignment: {
        Row: {
          coach_id: string
          created_by: string | null
          insert_date: string
          specialty_code: string
        }
        Insert: {
          coach_id: string
          created_by?: string | null
          insert_date?: string
          specialty_code: string
        }
        Update: {
          coach_id?: string
          created_by?: string | null
          insert_date?: string
          specialty_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_coach_specialty_assignment_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_coach_specialty_assignment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_coach_specialty_assignment_specialty_code_fkey"
            columns: ["specialty_code"]
            isOneToOne: false
            referencedRelation: "com_m_coach_specialty"
            referencedColumns: ["specialty_code"]
          },
        ]
      }
      com_m_coach_student_relationship: {
        Row: {
          coach_id: string
          insert_date: string
          is_active: boolean
          relationship_id: string
          student_id: string
          update_date: string
        }
        Insert: {
          coach_id: string
          insert_date?: string
          is_active?: boolean
          relationship_id?: string
          student_id: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          insert_date?: string
          is_active?: boolean
          relationship_id?: string
          student_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_coach_student_relationship_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_coach_student_relationship_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_m_color_vowel: {
        Row: {
          audio_path: string
          cv_id: string
          cv_name: string
          description: string
          icon_path: string
          insert_date: string
          update_date: string
          video_path: string | null
          video_title: string | null
        }
        Insert: {
          audio_path: string
          cv_id: string
          cv_name: string
          description: string
          icon_path: string
          insert_date?: string
          update_date?: string
          video_path?: string | null
          video_title?: string | null
        }
        Update: {
          audio_path?: string
          cv_id?: string
          cv_name?: string
          description?: string
          icon_path?: string
          insert_date?: string
          update_date?: string
          video_path?: string | null
          video_title?: string | null
        }
        Relationships: []
      }
      com_m_color_vowel_dictionary: {
        Row: {
          audio_path: string | null
          cv_id: string
          dic_id: string
          insert_date: string
          last_tts_date: string | null
          lemma: string | null
          part_of_speech: string
          phonetic_spelling: string | null
          primary_stress_syllable: number
          status: "live" | "pending"
          stress_vowel_spelling: string
          syllables: string
          tts_adjustments: Json | null
          tts_ssml: string | null
          tts_ssml_mode: "auto" | "manual"
          tts_status: 0 | 1 | 2 | 9
          update_date: string
          word_en: string
          word_ja: string | null
        }
        Insert: {
          audio_path?: string | null
          cv_id: string
          dic_id?: string
          insert_date?: string
          last_tts_date?: string | null
          lemma?: string | null
          part_of_speech?: string
          phonetic_spelling?: string | null
          primary_stress_syllable?: number
          status?: "live" | "pending"
          stress_vowel_spelling: string
          syllables: string
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          tts_status?: 0 | 1 | 2 | 9
          update_date?: string
          word_en: string
          word_ja?: string | null
        }
        Update: {
          audio_path?: string | null
          cv_id?: string
          dic_id?: string
          insert_date?: string
          last_tts_date?: string | null
          lemma?: string | null
          part_of_speech?: string
          phonetic_spelling?: string | null
          primary_stress_syllable?: number
          status?: "live" | "pending"
          stress_vowel_spelling?: string
          syllables?: string
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          tts_status?: 0 | 1 | 2 | 9
          update_date?: string
          word_en?: string
          word_ja?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_m_color_vowel_dictionary_cv_id_fkey"
            columns: ["cv_id"]
            isOneToOne: false
            referencedRelation: "com_m_color_vowel"
            referencedColumns: ["cv_id"]
          },
        ]
      }
      com_m_company_profile: {
        Row: {
          address: string
          company_code: string
          company_name: string
          company_name_ja: string | null
          company_profile_id: string
          insert_date: string
          logo_path: string | null
          tax_registration_number: string | null
          update_date: string
        }
        Insert: {
          address: string
          company_code: string
          company_name: string
          company_name_ja?: string | null
          company_profile_id?: string
          insert_date?: string
          logo_path?: string | null
          tax_registration_number?: string | null
          update_date?: string
        }
        Update: {
          address?: string
          company_code?: string
          company_name?: string
          company_name_ja?: string | null
          company_profile_id?: string
          insert_date?: string
          logo_path?: string | null
          tax_registration_number?: string | null
          update_date?: string
        }
        Relationships: []
      }
      com_m_contents: {
        Row: {
          category_id: number | null
          content_id: string
          content_label: string
          content_name: string
          content_name_en: string | null
          content_scope: 0 | 1
          content_type: 0 | 1 | 2 | 3
          description: string | null
          difficulty_level: number
          insert_date: string
          metadata: Json
          recommend: number
          seq_no: number
          status: 0 | 1
          update_date: string
        }
        Insert: {
          category_id?: number | null
          content_id?: string
          content_label: string
          content_name: string
          content_name_en?: string | null
          content_scope?: 0 | 1
          content_type?: 0 | 1 | 2 | 3
          description?: string | null
          difficulty_level?: number
          insert_date?: string
          metadata?: Json
          recommend?: number
          seq_no?: number
          status?: 0 | 1
          update_date?: string
        }
        Update: {
          category_id?: number | null
          content_id?: string
          content_label?: string
          content_name?: string
          content_name_en?: string | null
          content_scope?: 0 | 1
          content_type?: 0 | 1 | 2 | 3
          description?: string | null
          difficulty_level?: number
          insert_date?: string
          metadata?: Json
          recommend?: number
          seq_no?: number
          status?: 0 | 1
          update_date?: string
        }
        Relationships: []
      }
      com_m_contents_access: {
        Row: {
          access_id: string
          client_id: string
          content_id: string
          insert_date: string
          notes: string | null
          update_date: string
        }
        Insert: {
          access_id?: string
          client_id: string
          content_id: string
          insert_date?: string
          notes?: string | null
          update_date?: string
        }
        Update: {
          access_id?: string
          client_id?: string
          content_id?: string
          insert_date?: string
          notes?: string | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_contents_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "com_m_contents_access_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
        ]
      }
      com_m_contents_tag: {
        Row: {
          insert_date: string
          seq_no: number
          tag_id: string
          tag_name: string
          tag_type: "industry" | "scene" | "skill" | "level" | "other"
          update_date: string
        }
        Insert: {
          insert_date?: string
          seq_no?: number
          tag_id?: string
          tag_name: string
          tag_type: "industry" | "scene" | "skill" | "level" | "other"
          update_date?: string
        }
        Update: {
          insert_date?: string
          seq_no?: number
          tag_id?: string
          tag_name?: string
          tag_type?: "industry" | "scene" | "skill" | "level" | "other"
          update_date?: string
        }
        Relationships: []
      }
      com_m_contract: {
        Row: {
          client_id: string
          contract_id: string
          contract_name: string
          contract_type: 1 | 2
          end_date: string
          has_dialogue_practice: boolean
          insert_date: string
          max_licenses: number
          note: string | null
          plan_id: string
          plan_name: string
          plan_name_en: string
          start_date: string
          status: 0 | 1 | 9
          total_sessions: number | null
          update_date: string
          weekly_frequency: number | null
        }
        Insert: {
          client_id: string
          contract_id?: string
          contract_name: string
          contract_type?: 1 | 2
          end_date: string
          has_dialogue_practice?: boolean
          insert_date?: string
          max_licenses: number
          note?: string | null
          plan_id: string
          plan_name: string
          plan_name_en: string
          start_date: string
          status?: 0 | 1 | 9
          total_sessions?: number | null
          update_date?: string
          weekly_frequency?: number | null
        }
        Update: {
          client_id?: string
          contract_id?: string
          contract_name?: string
          contract_type?: 1 | 2
          end_date?: string
          has_dialogue_practice?: boolean
          insert_date?: string
          max_licenses?: number
          note?: string | null
          plan_id?: string
          plan_name?: string
          plan_name_en?: string
          start_date?: string
          status?: 0 | 1 | 9
          total_sessions?: number | null
          update_date?: string
          weekly_frequency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "com_m_contract_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "com_m_contract_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract_plan"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      com_m_contract_plan: {
        Row: {
          contract_type: 1 | 2
          has_dialogue_practice: boolean
          insert_date: string
          is_active: boolean
          period_months: number
          plan_code: string
          plan_id: string
          plan_name: string
          plan_name_en: string
          sort_no: number
          total_sessions: number | null
          update_date: string
          weekly_frequency: number | null
        }
        Insert: {
          contract_type: 1 | 2
          has_dialogue_practice?: boolean
          insert_date?: string
          is_active?: boolean
          period_months?: number
          plan_code: string
          plan_id?: string
          plan_name: string
          plan_name_en: string
          sort_no?: number
          total_sessions?: number | null
          update_date?: string
          weekly_frequency?: number | null
        }
        Update: {
          contract_type?: 1 | 2
          has_dialogue_practice?: boolean
          insert_date?: string
          is_active?: boolean
          period_months?: number
          plan_code?: string
          plan_id?: string
          plan_name?: string
          plan_name_en?: string
          sort_no?: number
          total_sessions?: number | null
          update_date?: string
          weekly_frequency?: number | null
        }
        Relationships: []
      }
      com_m_country: {
        Row: {
          country_code: string
          icon_path: string | null
          insert_date: string
          is_active: boolean
          name_en: string
          name_ja: string
          sort_no: number
          update_date: string
        }
        Insert: {
          country_code: string
          icon_path?: string | null
          insert_date?: string
          is_active?: boolean
          name_en: string
          name_ja: string
          sort_no?: number
          update_date?: string
        }
        Update: {
          country_code?: string
          icon_path?: string | null
          insert_date?: string
          is_active?: boolean
          name_en?: string
          name_ja?: string
          sort_no?: number
          update_date?: string
        }
        Relationships: []
      }
      com_m_dialogue_session: {
        Row: {
          admin_notes: string | null
          coach_slides_link: string | null
          coach_slides_title: string | null
          content_id: string
          dialogue_session_id: string
          insert_date: string
          session_no: number
          student_slides_link: string | null
          student_slides_title: string | null
          update_date: string
        }
        Insert: {
          admin_notes?: string | null
          coach_slides_link?: string | null
          coach_slides_title?: string | null
          content_id: string
          dialogue_session_id?: string
          insert_date?: string
          session_no: number
          student_slides_link?: string | null
          student_slides_title?: string | null
          update_date?: string
        }
        Update: {
          admin_notes?: string | null
          coach_slides_link?: string | null
          coach_slides_title?: string | null
          content_id?: string
          dialogue_session_id?: string
          insert_date?: string
          session_no?: number
          student_slides_link?: string | null
          student_slides_title?: string | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_dialogue_session_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
        ]
      }
      com_m_lesson_schedule: {
        Row: {
          coach_id: string
          day_of_week: number
          end_date: string
          end_time: string
          insert_date: string
          schedule_id: string
          schedule_timezone: string
          slot_no: number
          source_request_id: string | null
          start_date: string
          start_time: string
          status: 0 | 1 | 9
          student_id: string
          target_sessions: number
          ticket_id: string
          update_date: string
        }
        Insert: {
          coach_id: string
          day_of_week: number
          end_date: string
          end_time: string
          insert_date?: string
          schedule_id?: string
          schedule_timezone: string
          slot_no: number
          source_request_id?: string | null
          start_date: string
          start_time: string
          status?: 0 | 1 | 9
          student_id: string
          target_sessions: number
          ticket_id: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          day_of_week?: number
          end_date?: string
          end_time?: string
          insert_date?: string
          schedule_id?: string
          schedule_timezone?: string
          slot_no?: number
          source_request_id?: string | null
          start_date?: string
          start_time?: string
          status?: 0 | 1 | 9
          student_id?: string
          target_sessions?: number
          ticket_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_lesson_schedule_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_lesson_schedule_schedule_timezone_fkey"
            columns: ["schedule_timezone"]
            isOneToOne: false
            referencedRelation: "com_m_timezone"
            referencedColumns: ["timezone"]
          },
          {
            foreignKeyName: "com_m_lesson_schedule_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "com_t_matching_request"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "com_m_lesson_schedule_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_lesson_schedule_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "com_t_user_session_ticket"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      com_m_notice: {
        Row: {
          attachments: Json
          client_id: string | null
          content: string
          cta_label: string | null
          cta_url: string | null
          display_mode: "POPUP" | "HOME" | "LIST"
          expired_at: string | null
          image_path: string | null
          insert_date: string
          is_important: boolean
          is_published: boolean
          notice_id: string
          notice_type: "INFO" | "CAMPAIGN" | "MAINTENANCE" | "UPDATE"
          published_at: string
          target_type: "ALL" | "CLIENT" | "COACH"
          title: string
          update_date: string
        }
        Insert: {
          attachments?: Json
          client_id?: string | null
          content: string
          cta_label?: string | null
          cta_url?: string | null
          display_mode?: "POPUP" | "HOME" | "LIST"
          expired_at?: string | null
          image_path?: string | null
          insert_date?: string
          is_important?: boolean
          is_published?: boolean
          notice_id?: string
          notice_type?: "INFO" | "CAMPAIGN" | "MAINTENANCE" | "UPDATE"
          published_at: string
          target_type?: "ALL" | "CLIENT" | "COACH"
          title: string
          update_date?: string
        }
        Update: {
          attachments?: Json
          client_id?: string | null
          content?: string
          cta_label?: string | null
          cta_url?: string | null
          display_mode?: "POPUP" | "HOME" | "LIST"
          expired_at?: string | null
          image_path?: string | null
          insert_date?: string
          is_important?: boolean
          is_published?: boolean
          notice_id?: string
          notice_type?: "INFO" | "CAMPAIGN" | "MAINTENANCE" | "UPDATE"
          published_at?: string
          target_type?: "ALL" | "CLIENT" | "COACH"
          title?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_notice_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
        ]
      }
      com_m_phrase: {
        Row: {
          audio_path: string | null
          insert_date: string
          last_tts_date: string | null
          phrase_en: string
          phrase_id: string
          phrase_ja: string
          phrase_type: 1 | 2 | 3 | 4 | 5
          seq_no: number
          status: "live" | "pending"
          tts_adjustments: Json | null
          tts_ssml: string | null
          tts_ssml_mode: "auto" | "manual"
          tts_status: 0 | 1 | 2 | 9
          update_date: string
          word_id: string
        }
        Insert: {
          audio_path?: string | null
          insert_date?: string
          last_tts_date?: string | null
          phrase_en: string
          phrase_id?: string
          phrase_ja: string
          phrase_type: 1 | 2 | 3 | 4 | 5
          seq_no?: number
          status?: "live" | "pending"
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          tts_status?: 0 | 1 | 2 | 9
          update_date?: string
          word_id: string
        }
        Update: {
          audio_path?: string | null
          insert_date?: string
          last_tts_date?: string | null
          phrase_en?: string
          phrase_id?: string
          phrase_ja?: string
          phrase_type?: 1 | 2 | 3 | 4 | 5
          seq_no?: number
          status?: "live" | "pending"
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          tts_status?: 0 | 1 | 2 | 9
          update_date?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_phrase_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "com_m_word"
            referencedColumns: ["word_id"]
          },
        ]
      }
      com_m_role: {
        Row: {
          role_id: string
          role_name: string
          seq_no: number
          target_user_type: string | null
        }
        Insert: {
          role_id: string
          role_name: string
          seq_no?: number
          target_user_type?: string | null
        }
        Update: {
          role_id?: string
          role_name?: string
          seq_no?: number
          target_user_type?: string | null
        }
        Relationships: []
      }
      com_m_session_pay_rate: {
        Row: {
          currency_code: string
          insert_date: string
          rate_amount: number
          session_pay_rate_id: string
          update_date: string
        }
        Insert: {
          currency_code: string
          insert_date?: string
          rate_amount: number
          session_pay_rate_id?: string
          update_date?: string
        }
        Update: {
          currency_code?: string
          insert_date?: string
          rate_amount?: number
          session_pay_rate_id?: string
          update_date?: string
        }
        Relationships: []
      }
      com_m_sprint_questions: {
        Row: {
          answer_sentence_no_en: string | null
          answer_sentence_no_ja: string | null
          answer_sentence_no_tts_adjustments: Json | null
          answer_sentence_no_tts_ssml: string | null
          answer_sentence_no_tts_ssml_mode: "auto" | "manual"
          answer_sentence_no_tts_status: 0 | 1 | 2 | 9
          answer_sentence_no_voice: string | null
          answer_sentence_yes_en: string
          answer_sentence_yes_ja: string | null
          answer_sentence_yes_tts_adjustments: Json | null
          answer_sentence_yes_tts_ssml: string | null
          answer_sentence_yes_tts_ssml_mode: "auto" | "manual"
          answer_sentence_yes_tts_status: 0 | 1 | 2 | 9
          answer_sentence_yes_voice: string | null
          content_id: string
          difficulty_level: number
          group_id: string | null
          insert_date: string
          last_tts_date: string | null
          legacy_group_id: number | null
          legacy_question_id: number | null
          question_en: string
          question_id: string
          question_ja: string | null
          question_tts_adjustments: Json | null
          question_tts_ssml: string | null
          question_tts_ssml_mode: "auto" | "manual"
          question_tts_status: 0 | 1 | 2 | 9
          question_type: "0" | "4" | "5" | "6"
          question_voice: string | null
          seq_no: number
          sprint_type: "0" | "1"
          statement_en: string | null
          statement_ja: string | null
          statement_tts_adjustments: Json | null
          statement_tts_ssml: string | null
          statement_tts_ssml_mode: "auto" | "manual"
          statement_tts_status: 0 | 1 | 2 | 9
          statement_voice: string | null
          update_date: string
        }
        Insert: {
          answer_sentence_no_en?: string | null
          answer_sentence_no_ja?: string | null
          answer_sentence_no_tts_adjustments?: Json | null
          answer_sentence_no_tts_ssml?: string | null
          answer_sentence_no_tts_ssml_mode?: "auto" | "manual"
          answer_sentence_no_tts_status?: 0 | 1 | 2 | 9
          answer_sentence_no_voice?: string | null
          answer_sentence_yes_en: string
          answer_sentence_yes_ja?: string | null
          answer_sentence_yes_tts_adjustments?: Json | null
          answer_sentence_yes_tts_ssml?: string | null
          answer_sentence_yes_tts_ssml_mode?: "auto" | "manual"
          answer_sentence_yes_tts_status?: 0 | 1 | 2 | 9
          answer_sentence_yes_voice?: string | null
          content_id: string
          difficulty_level?: number
          group_id?: string | null
          insert_date?: string
          last_tts_date?: string | null
          legacy_group_id?: number | null
          legacy_question_id?: number | null
          question_en: string
          question_id?: string
          question_ja?: string | null
          question_tts_adjustments?: Json | null
          question_tts_ssml?: string | null
          question_tts_ssml_mode?: "auto" | "manual"
          question_tts_status?: 0 | 1 | 2 | 9
          question_type: "0" | "4" | "5" | "6"
          question_voice?: string | null
          seq_no?: number
          sprint_type?: "0" | "1"
          statement_en?: string | null
          statement_ja?: string | null
          statement_tts_adjustments?: Json | null
          statement_tts_ssml?: string | null
          statement_tts_ssml_mode?: "auto" | "manual"
          statement_tts_status?: 0 | 1 | 2 | 9
          statement_voice?: string | null
          update_date?: string
        }
        Update: {
          answer_sentence_no_en?: string | null
          answer_sentence_no_ja?: string | null
          answer_sentence_no_tts_adjustments?: Json | null
          answer_sentence_no_tts_ssml?: string | null
          answer_sentence_no_tts_ssml_mode?: "auto" | "manual"
          answer_sentence_no_tts_status?: 0 | 1 | 2 | 9
          answer_sentence_no_voice?: string | null
          answer_sentence_yes_en?: string
          answer_sentence_yes_ja?: string | null
          answer_sentence_yes_tts_adjustments?: Json | null
          answer_sentence_yes_tts_ssml?: string | null
          answer_sentence_yes_tts_ssml_mode?: "auto" | "manual"
          answer_sentence_yes_tts_status?: 0 | 1 | 2 | 9
          answer_sentence_yes_voice?: string | null
          content_id?: string
          difficulty_level?: number
          group_id?: string | null
          insert_date?: string
          last_tts_date?: string | null
          legacy_group_id?: number | null
          legacy_question_id?: number | null
          question_en?: string
          question_id?: string
          question_ja?: string | null
          question_tts_adjustments?: Json | null
          question_tts_ssml?: string | null
          question_tts_ssml_mode?: "auto" | "manual"
          question_tts_status?: 0 | 1 | 2 | 9
          question_type?: "0" | "4" | "5" | "6"
          question_voice?: string | null
          seq_no?: number
          sprint_type?: "0" | "1"
          statement_en?: string | null
          statement_ja?: string | null
          statement_tts_adjustments?: Json | null
          statement_tts_ssml?: string | null
          statement_tts_ssml_mode?: "auto" | "manual"
          statement_tts_status?: 0 | 1 | 2 | 9
          statement_voice?: string | null
          update_date?: string
        }
        Relationships: []
      }
      com_m_terms: {
        Row: {
          insert_date: string
          is_required: boolean
          published_date: string
          storage_path: string | null
          term_id: string
          term_type: string
          update_date: string
          version_name: string
        }
        Insert: {
          insert_date?: string
          is_required?: boolean
          published_date?: string
          storage_path?: string | null
          term_id?: string
          term_type: string
          update_date?: string
          version_name: string
        }
        Update: {
          insert_date?: string
          is_required?: boolean
          published_date?: string
          storage_path?: string | null
          term_id?: string
          term_type?: string
          update_date?: string
          version_name?: string
        }
        Relationships: []
      }
      com_m_terms_revision: {
        Row: {
          change_note: string | null
          content: string
          insert_date: string
          insert_user: string | null
          revision_id: string
          revision_no: number
          term_id: string
        }
        Insert: {
          change_note?: string | null
          content: string
          insert_date?: string
          insert_user?: string | null
          revision_id?: string
          revision_no: number
          term_id: string
        }
        Update: {
          change_note?: string | null
          content?: string
          insert_date?: string
          insert_user?: string | null
          revision_id?: string
          revision_no?: number
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_terms_revision_insert_user_fkey"
            columns: ["insert_user"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_terms_revision_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "com_m_terms"
            referencedColumns: ["term_id"]
          },
        ]
      }
      com_m_timezone: {
        Row: {
          display_name_en: string
          display_name_ja: string
          insert_date: string
          is_active: boolean
          short_name_en: string
          short_name_ja: string
          sort_no: number
          timezone: string
          update_date: string
        }
        Insert: {
          display_name_en: string
          display_name_ja: string
          insert_date?: string
          is_active?: boolean
          short_name_en: string
          short_name_ja: string
          sort_no?: number
          timezone: string
          update_date?: string
        }
        Update: {
          display_name_en?: string
          display_name_ja?: string
          insert_date?: string
          is_active?: boolean
          short_name_en?: string
          short_name_ja?: string
          sort_no?: number
          timezone?: string
          update_date?: string
        }
        Relationships: []
      }
      com_m_user: {
        Row: {
          client_id: string | null
          icon_path: string | null
          id: string
          insert_date: string
          locale_id: string
          locked_until: string | null
          login_failed_count: number
          status: 0 | 1 | 9
          timezone: string
          update_date: string
          user_id: number
          user_name: string | null
          user_type: "0" | "1" | "2"
        }
        Insert: {
          client_id?: string | null
          icon_path?: string | null
          id: string
          insert_date?: string
          locale_id?: string
          locked_until?: string | null
          login_failed_count?: number
          status?: 0 | 1 | 9
          timezone?: string
          update_date?: string
          user_id?: number
          user_name?: string | null
          user_type?: "0" | "1" | "2"
        }
        Update: {
          client_id?: string | null
          icon_path?: string | null
          id?: string
          insert_date?: string
          locale_id?: string
          locked_until?: string | null
          login_failed_count?: number
          status?: 0 | 1 | 9
          timezone?: string
          update_date?: string
          user_id?: number
          user_name?: string | null
          user_type?: "0" | "1" | "2"
        }
        Relationships: [
          {
            foreignKeyName: "com_m_user_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_com_m_user_timezone"
            columns: ["timezone"]
            isOneToOne: false
            referencedRelation: "com_m_timezone"
            referencedColumns: ["timezone"]
          },
        ]
      }
      com_m_user_legal: {
        Row: {
          first_name: string
          first_name_latin: string | null
          insert_date: string
          last_name: string | null
          last_name_latin: string | null
          update_date: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          first_name: string
          first_name_latin?: string | null
          insert_date?: string
          last_name?: string | null
          last_name_latin?: string | null
          update_date?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          first_name?: string
          first_name_latin?: string | null
          insert_date?: string
          last_name?: string | null
          last_name_latin?: string | null
          update_date?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_user_legal_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_m_user_legal_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_m_video: {
        Row: {
          description: string | null
          duration_sec: number | null
          insert_date: string
          legacy_code: string | null
          section_id: string
          seq_no: number
          status: 0 | 1
          thumbnail_path: string | null
          title: string
          update_date: string
          video_id: string
          video_path: string
        }
        Insert: {
          description?: string | null
          duration_sec?: number | null
          insert_date?: string
          legacy_code?: string | null
          section_id: string
          seq_no?: number
          status?: 0 | 1
          thumbnail_path?: string | null
          title: string
          update_date?: string
          video_id?: string
          video_path: string
        }
        Update: {
          description?: string | null
          duration_sec?: number | null
          insert_date?: string
          legacy_code?: string | null
          section_id?: string
          seq_no?: number
          status?: 0 | 1
          thumbnail_path?: string | null
          title?: string
          update_date?: string
          video_id?: string
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_video_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "com_m_video_section"
            referencedColumns: ["section_id"]
          },
        ]
      }
      com_m_video_section: {
        Row: {
          content_id: string
          insert_date: string
          section_id: string
          section_name: string | null
          seq_no: number
          update_date: string
        }
        Insert: {
          content_id: string
          insert_date?: string
          section_id?: string
          section_name?: string | null
          seq_no?: number
          update_date?: string
        }
        Update: {
          content_id?: string
          insert_date?: string
          section_id?: string
          section_name?: string | null
          seq_no?: number
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_video_section_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
        ]
      }
      com_m_word: {
        Row: {
          content_id: string | null
          frequency_rank: number | null
          insert_date: string
          status: "live" | "pending"
          update_date: string
          word_en: string
          word_id: string
          word_ja: string
        }
        Insert: {
          content_id?: string | null
          frequency_rank?: number | null
          insert_date?: string
          status?: "live" | "pending"
          update_date?: string
          word_en: string
          word_id?: string
          word_ja: string
        }
        Update: {
          content_id?: string | null
          frequency_rank?: number | null
          insert_date?: string
          status?: "live" | "pending"
          update_date?: string
          word_en?: string
          word_id?: string
          word_ja?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_m_word_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
        ]
      }
      com_t_admin_impersonation_log: {
        Row: {
          admin_id: string | null
          expires_at: string | null
          impersonation_id: string
          reason: string
          redeemed_at: string | null
          requested_at: string
          target_user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          expires_at?: string | null
          impersonation_id?: string
          reason: string
          redeemed_at?: string | null
          requested_at?: string
          target_user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          expires_at?: string | null
          impersonation_id?: string
          reason?: string
          redeemed_at?: string | null
          requested_at?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_admin_impersonation_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_calendar_event_coach: {
        Row: {
          calendar_event_coach_id: string
          calendar_event_id: string
          coach_id: string
          insert_date: string
        }
        Insert: {
          calendar_event_coach_id?: string
          calendar_event_id: string
          coach_id: string
          insert_date?: string
        }
        Update: {
          calendar_event_coach_id?: string
          calendar_event_id?: string
          coach_id?: string
          insert_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_calendar_event_coach_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "com_m_calendar_event"
            referencedColumns: ["calendar_event_id"]
          },
          {
            foreignKeyName: "com_t_calendar_event_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_calendar_event_message: {
        Row: {
          attachments: Json
          calendar_event_id: string
          calendar_event_message_id: string
          content: string
          insert_date: string
          title: string
          update_date: string
        }
        Insert: {
          attachments?: Json
          calendar_event_id: string
          calendar_event_message_id?: string
          content: string
          insert_date?: string
          title: string
          update_date?: string
        }
        Update: {
          attachments?: Json
          calendar_event_id?: string
          calendar_event_message_id?: string
          content?: string
          insert_date?: string
          title?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_calendar_event_message_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "com_m_calendar_event"
            referencedColumns: ["calendar_event_id"]
          },
        ]
      }
      com_t_calendar_event_participant: {
        Row: {
          calendar_event_id: string
          insert_date: string
          participant_id: string
          user_id: string
        }
        Insert: {
          calendar_event_id: string
          insert_date?: string
          participant_id?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string
          insert_date?: string
          participant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_calendar_event_participant_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "com_m_calendar_event"
            referencedColumns: ["calendar_event_id"]
          },
          {
            foreignKeyName: "com_t_calendar_event_participant_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_chat: {
        Row: {
          chat_id: string
          created_at: string
          deleted_at: string | null
          message: string
          message_type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
          room_id: string
          sender_user_id: string
        }
        Insert: {
          chat_id?: string
          created_at?: string
          deleted_at?: string | null
          message: string
          message_type?: "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
          room_id: string
          sender_user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          deleted_at?: string | null
          message?: string
          message_type?: "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
          room_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_chat_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "com_t_chat_room"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "com_t_chat_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_chat_attachment: {
        Row: {
          attachment_id: string
          chat_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
        }
        Insert: {
          attachment_id?: string
          chat_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type: string
        }
        Update: {
          attachment_id?: string
          chat_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_chat_attachment_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "com_t_chat"
            referencedColumns: ["chat_id"]
          },
        ]
      }
      com_t_chat_room: {
        Row: {
          closed_at: string | null
          created_at: string
          room_id: string
          room_name: string | null
          room_type: "1ON1" | "GROUP"
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          room_id?: string
          room_name?: string | null
          room_type?: "1ON1" | "GROUP"
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          room_id?: string
          room_name?: string | null
          room_type?: "1ON1" | "GROUP"
        }
        Relationships: []
      }
      com_t_chat_room_user: {
        Row: {
          joined_at: string
          last_read_chat_id: string | null
          left_at: string | null
          room_id: string
          user_id: string
          user_type: "0" | "1" | "2"
        }
        Insert: {
          joined_at?: string
          last_read_chat_id?: string | null
          left_at?: string | null
          room_id: string
          user_id: string
          user_type: "0" | "1" | "2"
        }
        Update: {
          joined_at?: string
          last_read_chat_id?: string | null
          left_at?: string | null
          room_id?: string
          user_id?: string
          user_type?: "0" | "1" | "2"
        }
        Relationships: [
          {
            foreignKeyName: "com_t_chat_room_user_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "com_t_chat_room"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "com_t_chat_room_user_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_coach_availability_exception: {
        Row: {
          coach_id: string
          end_time: string
          exception_date: string
          exception_id: string
          exception_type: "BLOCK" | "ADD"
          insert_date: string
          note: string | null
          start_time: string
          update_date: string
        }
        Insert: {
          coach_id: string
          end_time: string
          exception_date: string
          exception_id?: string
          exception_type: "BLOCK" | "ADD"
          insert_date?: string
          note?: string | null
          start_time: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          end_time?: string
          exception_date?: string
          exception_id?: string
          exception_type?: "BLOCK" | "ADD"
          insert_date?: string
          note?: string | null
          start_time?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_coach_availability_exception_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_coach_monthly_report_approval: {
        Row: {
          approval_id: string
          approved_at: string | null
          approved_by: string | null
          coach_id: string
          insert_date: string
          rate_amount: number | null
          rate_currency: string | null
          report_month: string
          session_count_snapshot: Json | null
          status: 1 | 2
          update_date: string
        }
        Insert: {
          approval_id?: string
          approved_at?: string | null
          approved_by?: string | null
          coach_id: string
          insert_date?: string
          rate_amount?: number | null
          rate_currency?: string | null
          report_month: string
          session_count_snapshot?: Json | null
          status?: 1 | 2
          update_date?: string
        }
        Update: {
          approval_id?: string
          approved_at?: string | null
          approved_by?: string | null
          coach_id?: string
          insert_date?: string
          rate_amount?: number | null
          rate_currency?: string | null
          report_month?: string
          session_count_snapshot?: Json | null
          status?: 1 | 2
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_coach_monthly_report_approval_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_coach_monthly_report_approval_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_coach_rating: {
        Row: {
          coach_id: string
          coaching_score: number
          feedback: string | null
          friendliness_score: number
          insert_date: string
          legacy_evaluation_id: number | null
          rated_at: string
          rating_id: string
          recommendation_score: number
          source: 1 | 2 | 3
          student_id: string | null
          ticket_id: string | null
          update_date: string
        }
        Insert: {
          coach_id: string
          coaching_score: number
          feedback?: string | null
          friendliness_score: number
          insert_date?: string
          legacy_evaluation_id?: number | null
          rated_at?: string
          rating_id?: string
          recommendation_score: number
          source?: 1 | 2 | 3
          student_id?: string | null
          ticket_id?: string | null
          update_date?: string
        }
        Update: {
          coach_id?: string
          coaching_score?: number
          feedback?: string | null
          friendliness_score?: number
          insert_date?: string
          legacy_evaluation_id?: number | null
          rated_at?: string
          rating_id?: string
          recommendation_score?: number
          source?: 1 | 2 | 3
          student_id?: string | null
          ticket_id?: string | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_coach_rating_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_coach_rating_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_coach_rating_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "com_t_user_session_ticket"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      com_t_coach_stats: {
        Row: {
          coach_id: string
          insert_date: string
          rating_coaching_avg: number | null
          rating_count: number
          rating_friendliness_avg: number | null
          rating_overall_avg: number | null
          rating_recommendation_avg: number | null
          rating_updated_at: string | null
          update_date: string
        }
        Insert: {
          coach_id: string
          insert_date?: string
          rating_coaching_avg?: number | null
          rating_count?: number
          rating_friendliness_avg?: number | null
          rating_overall_avg?: number | null
          rating_recommendation_avg?: number | null
          rating_updated_at?: string | null
          update_date?: string
        }
        Update: {
          coach_id?: string
          insert_date?: string
          rating_coaching_avg?: number | null
          rating_count?: number
          rating_friendliness_avg?: number | null
          rating_overall_avg?: number | null
          rating_recommendation_avg?: number | null
          rating_updated_at?: string | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_coach_stats_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_coach_student_note: {
        Row: {
          coach_id: string
          insert_date: string
          note_id: string
          note_text: string
          student_id: string
        }
        Insert: {
          coach_id: string
          insert_date?: string
          note_id?: string
          note_text: string
          student_id: string
        }
        Update: {
          coach_id?: string
          insert_date?: string
          note_id?: string
          note_text?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_coach_student_note_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_coach_student_note_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_contents_tag_rel: {
        Row: {
          content_id: string
          insert_date: string
          tag_id: string
        }
        Insert: {
          content_id: string
          insert_date?: string
          tag_id: string
        }
        Update: {
          content_id?: string
          insert_date?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_contents_tag_rel_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "com_t_contents_tag_rel_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents_tag"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      com_t_contract_training_report: {
        Row: {
          coach_id: string
          comment_text: string
          finalized_at: string | null
          insert_date: string
          report_id: string
          status: 1 | 2
          student_id: string
          ticket_id: string
          update_date: string
        }
        Insert: {
          coach_id: string
          comment_text?: string
          finalized_at?: string | null
          insert_date?: string
          report_id?: string
          status?: 1 | 2
          student_id: string
          ticket_id: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          comment_text?: string
          finalized_at?: string | null
          insert_date?: string
          report_id?: string
          status?: 1 | 2
          student_id?: string
          ticket_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_contract_training_report_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_contract_training_report_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_contract_training_report_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "com_t_user_session_ticket"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      com_t_data_deletion_log: {
        Row: {
          counts: Json
          kind: "withdraw_user" | "purge_client"
          log_id: string
          performed_at: string
          performed_by: string | null
          target_id: string
        }
        Insert: {
          counts?: Json
          kind: "withdraw_user" | "purge_client"
          log_id?: string
          performed_at?: string
          performed_by?: string | null
          target_id: string
        }
        Update: {
          counts?: Json
          kind?: "withdraw_user" | "purge_client"
          log_id?: string
          performed_at?: string
          performed_by?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_data_deletion_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_dialogue_assignment: {
        Row: {
          assigned_by_coach_id: string
          assigned_date: string
          assignment_id: string
          content_id: string
          insert_date: string
          status: 0 | 1
          student_id: string
          update_date: string
        }
        Insert: {
          assigned_by_coach_id: string
          assigned_date?: string
          assignment_id?: string
          content_id: string
          insert_date?: string
          status?: 0 | 1
          student_id: string
          update_date?: string
        }
        Update: {
          assigned_by_coach_id?: string
          assigned_date?: string
          assignment_id?: string
          content_id?: string
          insert_date?: string
          status?: 0 | 1
          student_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_dialogue_assignment_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_dialogue_assignment_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "com_t_dialogue_assignment_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_dialogue_session_progress: {
        Row: {
          assignment_id: string
          completed_date: string | null
          dialogue_session_id: string
          insert_date: string
          is_completed: boolean
          notes: string | null
          progress_id: string
          update_date: string
          updated_by_coach_id: string
        }
        Insert: {
          assignment_id: string
          completed_date?: string | null
          dialogue_session_id: string
          insert_date?: string
          is_completed?: boolean
          notes?: string | null
          progress_id?: string
          update_date?: string
          updated_by_coach_id: string
        }
        Update: {
          assignment_id?: string
          completed_date?: string | null
          dialogue_session_id?: string
          insert_date?: string
          is_completed?: boolean
          notes?: string | null
          progress_id?: string
          update_date?: string
          updated_by_coach_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_dialogue_session_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "com_t_dialogue_assignment"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "com_t_dialogue_session_progress_dialogue_session_id_fkey"
            columns: ["dialogue_session_id"]
            isOneToOne: false
            referencedRelation: "com_m_dialogue_session"
            referencedColumns: ["dialogue_session_id"]
          },
          {
            foreignKeyName: "com_t_dialogue_session_progress_updated_by_coach_id_fkey"
            columns: ["updated_by_coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_favorite_contents: {
        Row: {
          content_id: string
          favorite_id: string
          insert_date: string
          user_id: string
        }
        Insert: {
          content_id: string
          favorite_id?: string
          insert_date?: string
          user_id: string
        }
        Update: {
          content_id?: string
          favorite_id?: string
          insert_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_favorite_contents_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "com_t_favorite_contents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_favorite_phrase: {
        Row: {
          favorite_id: string
          insert_date: string
          phrase_id: string
          user_id: string
        }
        Insert: {
          favorite_id?: string
          insert_date?: string
          phrase_id: string
          user_id: string
        }
        Update: {
          favorite_id?: string
          insert_date?: string
          phrase_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_favorite_phrase_phrase_id_fkey"
            columns: ["phrase_id"]
            isOneToOne: false
            referencedRelation: "com_m_phrase"
            referencedColumns: ["phrase_id"]
          },
          {
            foreignKeyName: "com_t_favorite_phrase_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_favorite_sprint_question: {
        Row: {
          favorite_id: string
          insert_date: string
          question_id: string
          user_id: string
        }
        Insert: {
          favorite_id?: string
          insert_date?: string
          question_id: string
          user_id: string
        }
        Update: {
          favorite_id?: string
          insert_date?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_favorite_sprint_question_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "com_m_sprint_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "com_t_favorite_sprint_question_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_invitation: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          contract_id: string | null
          email: string
          expires_at: string
          id: string
          insert_date: string
          invited_by: string | null
          last_mail_error: string | null
          mail_sent_at: string | null
          roles: string[] | null
          token: string
          update_date: string
          user_name: string | null
          user_type: "0" | "1" | "2"
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          contract_id?: string | null
          email: string
          expires_at: string
          id?: string
          insert_date?: string
          invited_by?: string | null
          last_mail_error?: string | null
          mail_sent_at?: string | null
          roles?: string[] | null
          token: string
          update_date?: string
          user_name?: string | null
          user_type?: "0" | "1" | "2"
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          contract_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          insert_date?: string
          invited_by?: string | null
          last_mail_error?: string | null
          mail_sent_at?: string | null
          roles?: string[] | null
          token?: string
          update_date?: string
          user_name?: string | null
          user_type?: "0" | "1" | "2"
        }
        Relationships: [
          {
            foreignKeyName: "com_t_invitation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "com_t_invitation_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_invitation_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vw_contract_details"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      com_t_mail_event: {
        Row: {
          detail: string | null
          event_id: string
          event_type: string
          insert_date: string
          mail_id: string | null
          mail_kind: string | null
          occurred_at: string
          provider_message_id: string
          recipient: string | null
          subject: string | null
          webhook_id: string
        }
        Insert: {
          detail?: string | null
          event_id?: string
          event_type: string
          insert_date?: string
          mail_id?: string | null
          mail_kind?: string | null
          occurred_at: string
          provider_message_id: string
          recipient?: string | null
          subject?: string | null
          webhook_id: string
        }
        Update: {
          detail?: string | null
          event_id?: string
          event_type?: string
          insert_date?: string
          mail_id?: string | null
          mail_kind?: string | null
          occurred_at?: string
          provider_message_id?: string
          recipient?: string | null
          subject?: string | null
          webhook_id?: string
        }
        Relationships: []
      }
      com_t_mail_outbox: {
        Row: {
          attempts: number
          category: string
          dedup_key: string
          delivery_detail: string | null
          delivery_status: "DELAYED" | "DELIVERED" | "BOUNCED" | "FAILED" | "SUPPRESSED" | "COMPLAINED" | null
          delivery_updated_at: string | null
          insert_date: string
          last_error: string | null
          locked_at: string | null
          mail_id: string
          mail_type: string
          payload: Json
          provider_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED"
          update_date: string
          user_id: string
        }
        Insert: {
          attempts?: number
          category: string
          dedup_key: string
          delivery_detail?: string | null
          delivery_status?: "DELAYED" | "DELIVERED" | "BOUNCED" | "FAILED" | "SUPPRESSED" | "COMPLAINED" | null
          delivery_updated_at?: string | null
          insert_date?: string
          last_error?: string | null
          locked_at?: string | null
          mail_id?: string
          mail_type: string
          payload?: Json
          provider_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED"
          update_date?: string
          user_id: string
        }
        Update: {
          attempts?: number
          category?: string
          dedup_key?: string
          delivery_detail?: string | null
          delivery_status?: "DELAYED" | "DELIVERED" | "BOUNCED" | "FAILED" | "SUPPRESSED" | "COMPLAINED" | null
          delivery_updated_at?: string | null
          insert_date?: string
          last_error?: string | null
          locked_at?: string | null
          mail_id?: string
          mail_type?: string
          payload?: Json
          provider_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED"
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_mail_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_matching_request: {
        Row: {
          coach_id: string
          expires_at: string | null
          insert_date: string
          reject_reason: string | null
          request_id: string
          requested_bookable_sessions: number | null
          requested_day_of_week: number
          requested_end_time: string
          requested_start_time: string
          requested_timezone: string
          responded_at: string | null
          responded_by: string | null
          slot_no: number
          status: 1 | 2 | 3 | 4 | 5 | 6
          student_id: string
          ticket_id: string
          update_date: string
        }
        Insert: {
          coach_id: string
          expires_at?: string | null
          insert_date?: string
          reject_reason?: string | null
          request_id?: string
          requested_bookable_sessions?: number | null
          requested_day_of_week: number
          requested_end_time: string
          requested_start_time: string
          requested_timezone: string
          responded_at?: string | null
          responded_by?: string | null
          slot_no: number
          status?: 1 | 2 | 3 | 4 | 5 | 6
          student_id: string
          ticket_id: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          expires_at?: string | null
          insert_date?: string
          reject_reason?: string | null
          request_id?: string
          requested_bookable_sessions?: number | null
          requested_day_of_week?: number
          requested_end_time?: string
          requested_start_time?: string
          requested_timezone?: string
          responded_at?: string | null
          responded_by?: string | null
          slot_no?: number
          status?: 1 | 2 | 3 | 4 | 5 | 6
          student_id?: string
          ticket_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_matching_request_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_matching_request_requested_timezone_fkey"
            columns: ["requested_timezone"]
            isOneToOne: false
            referencedRelation: "com_m_timezone"
            referencedColumns: ["timezone"]
          },
          {
            foreignKeyName: "com_t_matching_request_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_matching_request_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_matching_request_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "com_t_user_session_ticket"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      com_t_notice_read: {
        Row: {
          cta_clicked_at: string | null
          insert_date: string
          notice_id: string
          read_at: string
          update_date: string
          user_id: string
        }
        Insert: {
          cta_clicked_at?: string | null
          insert_date?: string
          notice_id: string
          read_at?: string
          update_date?: string
          user_id: string
        }
        Update: {
          cta_clicked_at?: string | null
          insert_date?: string
          notice_id?: string
          read_at?: string
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_notice_read_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "com_m_notice"
            referencedColumns: ["notice_id"]
          },
        ]
      }
      com_t_notification: {
        Row: {
          dedup_key: string | null
          insert_date: string
          is_read: boolean
          link_path: string | null
          notification_id: string
          notification_type: string
          occurred_at: string
          payload: Json
          read_at: string | null
          update_date: string
          user_id: string
        }
        Insert: {
          dedup_key?: string | null
          insert_date?: string
          is_read?: boolean
          link_path?: string | null
          notification_id?: string
          notification_type: string
          occurred_at?: string
          payload?: Json
          read_at?: string | null
          update_date?: string
          user_id: string
        }
        Update: {
          dedup_key?: string | null
          insert_date?: string
          is_read?: boolean
          link_path?: string | null
          notification_id?: string
          notification_type?: string
          occurred_at?: string
          payload?: Json
          read_at?: string | null
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_resume_contents: {
        Row: {
          content_id: string
          item_id: string | null
          metadata: Json
          update_date: string
          user_id: string
        }
        Insert: {
          content_id: string
          item_id?: string | null
          metadata?: Json
          update_date?: string
          user_id: string
        }
        Update: {
          content_id?: string
          item_id?: string | null
          metadata?: Json
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_resume_contents_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
        ]
      }
      com_t_session: {
        Row: {
          cancel_category: 1 | 2 | 3 | 4 | 5 | 6 | null
          cancel_reason: string | null
          cancelled_by: string | null
          coach_id: string
          completion_result: 1 | 2 | 3 | null
          conducted_via: 1 | 2 | null
          end_datetime: string
          homework_not_needed: boolean
          insert_date: string
          outcome_mismatch: boolean
          rescheduled_from: string | null
          schedule_id: string
          session_id: string
          start_datetime: string
          status: 1 | 2 | 3
          status_note: string | null
          student_id: string
          suggested_outcome: 1 | 2 | 3 | null
          ticket_consumed: boolean
          ticket_id: string
          ticket_refunded: boolean | null
          update_date: string
        }
        Insert: {
          cancel_category?: 1 | 2 | 3 | 4 | 5 | 6 | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          coach_id: string
          completion_result?: 1 | 2 | 3 | null
          conducted_via?: 1 | 2 | null
          end_datetime: string
          homework_not_needed?: boolean
          insert_date?: string
          outcome_mismatch?: boolean
          rescheduled_from?: string | null
          schedule_id: string
          session_id?: string
          start_datetime: string
          status?: 1 | 2 | 3
          status_note?: string | null
          student_id: string
          suggested_outcome?: 1 | 2 | 3 | null
          ticket_consumed?: boolean
          ticket_id: string
          ticket_refunded?: boolean | null
          update_date?: string
        }
        Update: {
          cancel_category?: 1 | 2 | 3 | 4 | 5 | 6 | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          coach_id?: string
          completion_result?: 1 | 2 | 3 | null
          conducted_via?: 1 | 2 | null
          end_datetime?: string
          homework_not_needed?: boolean
          insert_date?: string
          outcome_mismatch?: boolean
          rescheduled_from?: string | null
          schedule_id?: string
          session_id?: string
          start_datetime?: string
          status?: 1 | 2 | 3
          status_note?: string | null
          student_id?: string
          suggested_outcome?: 1 | 2 | 3 | null
          ticket_consumed?: boolean
          ticket_id?: string
          ticket_refunded?: boolean | null
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "com_t_session_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "com_m_lesson_schedule"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "com_t_session_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "com_t_user_session_ticket"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      com_t_session_call_log: {
        Row: {
          call_log_id: string
          joined_at: string
          left_at: string | null
          role: "coach" | "student"
          session_id: string
          user_id: string
          zoom_session_id: string | null
        }
        Insert: {
          call_log_id?: string
          joined_at?: string
          left_at?: string | null
          role: "coach" | "student"
          session_id: string
          user_id: string
          zoom_session_id?: string | null
        }
        Update: {
          call_log_id?: string
          joined_at?: string
          left_at?: string | null
          role?: "coach" | "student"
          session_id?: string
          user_id?: string
          zoom_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_call_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "com_t_session_call_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_session_chat: {
        Row: {
          chat_id: string
          created_at: string
          message: string
          sender_role: "coach" | "student"
          sender_user_id: string
          session_id: string
        }
        Insert: {
          chat_id?: string
          created_at?: string
          message: string
          sender_role: "coach" | "student"
          sender_user_id: string
          session_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          message?: string
          sender_role?: "coach" | "student"
          sender_user_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_chat_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_chat_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
        ]
      }
      com_t_session_dialogue_log: {
        Row: {
          assignment_id: string
          dialogue_session_id: string
          insert_date: string
          log_id: string
          opened_by_coach_id: string
          session_id: string
        }
        Insert: {
          assignment_id: string
          dialogue_session_id: string
          insert_date?: string
          log_id?: string
          opened_by_coach_id: string
          session_id: string
        }
        Update: {
          assignment_id?: string
          dialogue_session_id?: string
          insert_date?: string
          log_id?: string
          opened_by_coach_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_dialogue_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "com_t_dialogue_assignment"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "com_t_session_dialogue_log_dialogue_session_id_fkey"
            columns: ["dialogue_session_id"]
            isOneToOne: false
            referencedRelation: "com_m_dialogue_session"
            referencedColumns: ["dialogue_session_id"]
          },
          {
            foreignKeyName: "com_t_session_dialogue_log_opened_by_coach_id_fkey"
            columns: ["opened_by_coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_dialogue_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
        ]
      }
      com_t_session_homework: {
        Row: {
          coach_id: string
          homework_id: string
          homework_text: string
          insert_date: string
          session_id: string
          student_id: string
          student_viewed_at: string | null
        }
        Insert: {
          coach_id: string
          homework_id?: string
          homework_text: string
          insert_date?: string
          session_id: string
          student_id: string
          student_viewed_at?: string | null
        }
        Update: {
          coach_id?: string
          homework_id?: string
          homework_text?: string
          insert_date?: string
          session_id?: string
          student_id?: string
          student_viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_homework_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_homework_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "com_t_session_homework_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_session_homework_attachment: {
        Row: {
          comment_id: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          homework_attachment_id: string
          homework_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type: string
          homework_attachment_id?: string
          homework_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          homework_attachment_id?: string
          homework_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_homework_attachment_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "com_t_session_homework_comment"
            referencedColumns: ["comment_id"]
          },
          {
            foreignKeyName: "com_t_session_homework_attachment_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "com_t_session_homework"
            referencedColumns: ["homework_id"]
          },
        ]
      }
      com_t_session_homework_comment: {
        Row: {
          coach_id: string
          comment_id: string
          comment_text: string
          homework_id: string
          insert_date: string
        }
        Insert: {
          coach_id: string
          comment_id?: string
          comment_text: string
          homework_id: string
          insert_date?: string
        }
        Update: {
          coach_id?: string
          comment_id?: string
          comment_text?: string
          homework_id?: string
          insert_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_homework_comment_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_homework_comment_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "com_t_session_homework"
            referencedColumns: ["homework_id"]
          },
        ]
      }
      com_t_session_outcome_history: {
        Row: {
          action: "recorded" | "corrected"
          conducted_via: 1 | 2 | null
          history_id: string
          outcome: number
          performed_at: string
          performed_by: string | null
          previous_cancel_category: number | null
          previous_completion_result: number | null
          previous_conducted_via: number | null
          previous_status: number
          reason: string | null
          session_id: string
          suggested_outcome: 1 | 2 | 3 | null
          ticket_action: "consumed" | "restored" | null
        }
        Insert: {
          action: "recorded" | "corrected"
          conducted_via?: 1 | 2 | null
          history_id?: string
          outcome: number
          performed_at?: string
          performed_by?: string | null
          previous_cancel_category?: number | null
          previous_completion_result?: number | null
          previous_conducted_via?: number | null
          previous_status: number
          reason?: string | null
          session_id: string
          suggested_outcome?: 1 | 2 | 3 | null
          ticket_action?: "consumed" | "restored" | null
        }
        Update: {
          action?: "recorded" | "corrected"
          conducted_via?: 1 | 2 | null
          history_id?: string
          outcome?: number
          performed_at?: string
          performed_by?: string | null
          previous_cancel_category?: number | null
          previous_completion_result?: number | null
          previous_conducted_via?: number | null
          previous_status?: number
          reason?: string | null
          session_id?: string
          suggested_outcome?: 1 | 2 | 3 | null
          ticket_action?: "consumed" | "restored" | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_outcome_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
        ]
      }
      com_t_session_slot_proposal: {
        Row: {
          coach_id: string
          expires_at: string | null
          insert_date: string
          proposal_id: string
          proposed_by_role: 1 | 2
          proposed_end_datetime: string
          proposed_start_datetime: string
          reason: string | null
          reject_reason: string | null
          responded_at: string | null
          resulting_session_id: string | null
          schedule_id: string
          source_session_id: string | null
          status: 1 | 2 | 3 | 4 | 5
          student_id: string
          update_date: string
        }
        Insert: {
          coach_id: string
          expires_at?: string | null
          insert_date?: string
          proposal_id?: string
          proposed_by_role: 1 | 2
          proposed_end_datetime: string
          proposed_start_datetime: string
          reason?: string | null
          reject_reason?: string | null
          responded_at?: string | null
          resulting_session_id?: string | null
          schedule_id: string
          source_session_id?: string | null
          status?: 1 | 2 | 3 | 4 | 5
          student_id: string
          update_date?: string
        }
        Update: {
          coach_id?: string
          expires_at?: string | null
          insert_date?: string
          proposal_id?: string
          proposed_by_role?: 1 | 2
          proposed_end_datetime?: string
          proposed_start_datetime?: string
          reason?: string | null
          reject_reason?: string | null
          responded_at?: string | null
          resulting_session_id?: string | null
          schedule_id?: string
          source_session_id?: string | null
          status?: 1 | 2 | 3 | 4 | 5
          student_id?: string
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_session_slot_proposal_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_session_slot_proposal_resulting_session_id_fkey"
            columns: ["resulting_session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "com_t_session_slot_proposal_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "com_m_lesson_schedule"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "com_t_session_slot_proposal_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "com_t_session_slot_proposal_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_trial_application: {
        Row: {
          accepted_at: string | null
          application_id: string
          apply_count: number
          country_city: string | null
          email: string
          first_name: string
          first_name_latin: string
          insert_date: string
          invitation_id: string | null
          last_applied_at: string
          last_name: string
          last_name_latin: string
          message: string | null
          occupation: number
          occupation_other: string | null
          referral_source: number
          referral_source_other: string | null
          timezone: string
          update_date: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          application_id?: string
          apply_count?: number
          country_city?: string | null
          email: string
          first_name: string
          first_name_latin: string
          insert_date?: string
          invitation_id?: string | null
          last_applied_at?: string
          last_name: string
          last_name_latin: string
          message?: string | null
          occupation: number
          occupation_other?: string | null
          referral_source: number
          referral_source_other?: string | null
          timezone: string
          update_date?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          application_id?: string
          apply_count?: number
          country_city?: string | null
          email?: string
          first_name?: string
          first_name_latin?: string
          insert_date?: string
          invitation_id?: string | null
          last_applied_at?: string
          last_name?: string
          last_name_latin?: string
          message?: string | null
          occupation?: number
          occupation_other?: string | null
          referral_source?: number
          referral_source_other?: string | null
          timezone?: string
          update_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_trial_application_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "com_t_invitation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_t_trial_application_timezone_fkey"
            columns: ["timezone"]
            isOneToOne: false
            referencedRelation: "com_m_timezone"
            referencedColumns: ["timezone"]
          },
          {
            foreignKeyName: "com_t_trial_application_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_tts_asset: {
        Row: {
          asset_id: string
          audio_path: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          raw_text: string
          tts_adjustments: Json | null
          tts_ssml: string | null
          tts_ssml_mode: "auto" | "manual"
          updated_at: string
        }
        Insert: {
          asset_id?: string
          audio_path?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          raw_text: string
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          updated_at?: string
        }
        Update: {
          asset_id?: string
          audio_path?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          raw_text?: string
          tts_adjustments?: Json | null
          tts_ssml?: string | null
          tts_ssml_mode?: "auto" | "manual"
          updated_at?: string
        }
        Relationships: []
      }
      com_t_user_license: {
        Row: {
          contract_id: string
          end_date: string
          has_dialogue_practice: boolean
          insert_date: string | null
          license_id: string
          note: string | null
          start_date: string
          status: 0 | 1
          update_date: string | null
          user_id: string
        }
        Insert: {
          contract_id: string
          end_date: string
          has_dialogue_practice?: boolean
          insert_date?: string | null
          license_id?: string
          note?: string | null
          start_date: string
          status?: 0 | 1
          update_date?: string | null
          user_id: string
        }
        Update: {
          contract_id?: string
          end_date?: string
          has_dialogue_practice?: boolean
          insert_date?: string | null
          license_id?: string
          note?: string | null
          start_date?: string
          status?: 0 | 1
          update_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_license_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_license_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vw_contract_details"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_license_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_user_license_history: {
        Row: {
          action: "assigned" | "updated" | "invalidated" | "removed"
          contract_id: string | null
          end_date: string
          has_dialogue_practice: boolean
          history_id: string
          license_id: string
          note: string | null
          performed_at: string
          performed_by: string | null
          start_date: string
          status: 0 | 1
          user_id: string | null
        }
        Insert: {
          action: "assigned" | "updated" | "invalidated" | "removed"
          contract_id?: string | null
          end_date: string
          has_dialogue_practice?: boolean
          history_id?: string
          license_id: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          start_date: string
          status: 0 | 1
          user_id?: string | null
        }
        Update: {
          action?: "assigned" | "updated" | "invalidated" | "removed"
          contract_id?: string | null
          end_date?: string
          has_dialogue_practice?: boolean
          history_id?: string
          license_id?: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          start_date?: string
          status?: 0 | 1
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_license_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_license_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vw_contract_details"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_license_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_user_mail_setting: {
        Row: {
          category: string
          enabled: boolean
          insert_date: string
          update_date: string
          user_id: string
        }
        Insert: {
          category: string
          enabled?: boolean
          insert_date?: string
          update_date?: string
          user_id: string
        }
        Update: {
          category?: string
          enabled?: boolean
          insert_date?: string
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_mail_setting_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_user_role: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "com_m_role"
            referencedColumns: ["role_id"]
          },
        ]
      }
      com_t_user_session_ticket: {
        Row: {
          contract_id: string
          insert_date: string
          license_id: string
          ticket_id: string
          total_sessions: number
          update_date: string
          used_sessions: number
          user_id: string
          weekly_frequency: number
        }
        Insert: {
          contract_id: string
          insert_date?: string
          license_id: string
          ticket_id?: string
          total_sessions: number
          update_date?: string
          used_sessions?: number
          user_id: string
          weekly_frequency: number
        }
        Update: {
          contract_id?: string
          insert_date?: string
          license_id?: string
          ticket_id?: string
          total_sessions?: number
          update_date?: string
          used_sessions?: number
          user_id?: string
          weekly_frequency?: number
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_session_ticket_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vw_contract_details"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: true
            referencedRelation: "com_t_user_license"
            referencedColumns: ["license_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: true
            referencedRelation: "vw_my_license_status"
            referencedColumns: ["license_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_user_session_ticket_history: {
        Row: {
          action: "granted" | "consumed" | "restored" | "removed"
          contract_id: string | null
          history_id: string
          note: string | null
          performed_at: string
          performed_by: string | null
          sessions_delta: number
          ticket_id: string
          total_sessions: number
          used_sessions_after: number
          user_id: string | null
        }
        Insert: {
          action: "granted" | "consumed" | "restored" | "removed"
          contract_id?: string | null
          history_id?: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          sessions_delta: number
          ticket_id: string
          total_sessions: number
          used_sessions_after: number
          user_id?: string | null
        }
        Update: {
          action?: "granted" | "consumed" | "restored" | "removed"
          contract_id?: string | null
          history_id?: string
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          sessions_delta?: number
          ticket_id?: string
          total_sessions?: number
          used_sessions_after?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_session_ticket_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vw_contract_details"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "com_t_user_session_ticket_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      com_t_user_terms_agreement: {
        Row: {
          agreed_date: string
          agreement_id: string
          insert_date: string
          ip_address: string | null
          revision_id: string | null
          term_id: string
          update_date: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          agreed_date?: string
          agreement_id?: string
          insert_date?: string
          ip_address?: string | null
          revision_id?: string | null
          term_id: string
          update_date?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          agreed_date?: string
          agreement_id?: string
          insert_date?: string
          ip_address?: string | null
          revision_id?: string | null
          term_id?: string
          update_date?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_terms_agreement_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "com_m_terms_revision"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "com_t_user_terms_agreement_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "com_m_terms"
            referencedColumns: ["term_id"]
          },
          {
            foreignKeyName: "com_t_user_terms_agreement_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_t_sprint: {
        Row: {
          answer_type: "0" | "1"
          answered_history: Json
          coach_id: string
          content_id: string
          difficulty_level: number
          insert_date: string
          lesson_sprint_id: string
          paused_duration_sec: number
          question_type: "0" | "4" | "5" | "6"
          session_id: string | null
          session_note: string | null
          sprint_type: "0" | "1"
          student_id: string
          time_limit_sec: number
          total_answered: number
          total_evaluated: number
          update_date: string
        }
        Insert: {
          answer_type: "0" | "1"
          answered_history?: Json
          coach_id: string
          content_id: string
          difficulty_level: number
          insert_date?: string
          lesson_sprint_id?: string
          paused_duration_sec?: number
          question_type: "0" | "4" | "5" | "6"
          session_id?: string | null
          session_note?: string | null
          sprint_type: "0" | "1"
          student_id: string
          time_limit_sec: number
          total_answered: number
          total_evaluated: number
          update_date?: string
        }
        Update: {
          answer_type?: "0" | "1"
          answered_history?: Json
          coach_id?: string
          content_id?: string
          difficulty_level?: number
          insert_date?: string
          lesson_sprint_id?: string
          paused_duration_sec?: number
          question_type?: "0" | "4" | "5" | "6"
          session_id?: string | null
          session_note?: string | null
          sprint_type?: "0" | "1"
          student_id?: string
          time_limit_sec?: number
          total_answered?: number
          total_evaluated?: number
          update_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_t_sprint_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_t_sprint_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "lesson_t_sprint_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "com_t_session"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "lesson_t_sprint_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      self_t_sprint: {
        Row: {
          answer_type: "0" | "1"
          answered_history: Json
          content_id: string
          difficulty_level: number
          insert_date: string
          question_type: "0" | "4" | "5" | "6"
          self_sprint_id: string
          sprint_type: "0" | "1"
          time_limit_sec: number
          total_answered: number
          total_assessments: number
          update_date: string
          user_id: string
        }
        Insert: {
          answer_type: "0" | "1"
          answered_history?: Json
          content_id: string
          difficulty_level: number
          insert_date?: string
          question_type: "0" | "4" | "5" | "6"
          self_sprint_id?: string
          sprint_type: "0" | "1"
          time_limit_sec: number
          total_answered: number
          total_assessments: number
          update_date?: string
          user_id: string
        }
        Update: {
          answer_type?: "0" | "1"
          answered_history?: Json
          content_id?: string
          difficulty_level?: number
          insert_date?: string
          question_type?: "0" | "4" | "5" | "6"
          self_sprint_id?: string
          sprint_type?: "0" | "1"
          time_limit_sec?: number
          total_answered?: number
          total_assessments?: number
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_t_sprint_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "self_t_sprint_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      self_t_sprint_summary: {
        Row: {
          assessment_count: number
          builders_count: number
          content_id: string
          insert_date: string
          mastery_count: number
          question_count: number
          speed_count: number
          structure_count: number
          summary_id: string
          training_date: string
          update_date: string
          user_id: string
        }
        Insert: {
          assessment_count?: number
          builders_count?: number
          content_id: string
          insert_date?: string
          mastery_count?: number
          question_count?: number
          speed_count?: number
          structure_count?: number
          summary_id?: string
          training_date?: string
          update_date?: string
          user_id: string
        }
        Update: {
          assessment_count?: number
          builders_count?: number
          content_id?: string
          insert_date?: string
          mastery_count?: number
          question_count?: number
          speed_count?: number
          structure_count?: number
          summary_id?: string
          training_date?: string
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_t_sprint_summary_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "self_t_sprint_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      self_t_word_summary: {
        Row: {
          assessment_count: number
          content_id: string
          insert_date: string
          phrase_count: number
          summary_id: string
          training_date: string
          update_date: string
          user_id: string
          word_count: number
        }
        Insert: {
          assessment_count?: number
          content_id: string
          insert_date?: string
          phrase_count?: number
          summary_id?: string
          training_date?: string
          update_date?: string
          user_id: string
          word_count?: number
        }
        Update: {
          assessment_count?: number
          content_id?: string
          insert_date?: string
          phrase_count?: number
          summary_id?: string
          training_date?: string
          update_date?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "self_t_word_summary_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "com_m_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "self_t_word_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      student_m_sprint_progress: {
        Row: {
          insert_date: string
          level_builders: number
          level_managed: boolean
          level_mastery: number
          level_speed: number
          level_structure: number
          stage: number
          update_date: string
          user_id: string
        }
        Insert: {
          insert_date?: string
          level_builders?: number
          level_managed?: boolean
          level_mastery?: number
          level_speed?: number
          level_structure?: number
          stage?: number
          update_date?: string
          user_id: string
        }
        Update: {
          insert_date?: string
          level_builders?: number
          level_managed?: boolean
          level_mastery?: number
          level_speed?: number
          level_structure?: number
          stage?: number
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_m_sprint_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      student_m_training_lifetime_stats: {
        Row: {
          current_streak_days: number
          first_training_date: string | null
          insert_date: string
          last_training_date: string | null
          total_active_days: number
          total_assessments: number
          total_phrases: number
          total_sprint_answers: number
          total_sprint_sessions: number
          total_words: number
          update_date: string
          user_id: string
        }
        Insert: {
          current_streak_days?: number
          first_training_date?: string | null
          insert_date?: string
          last_training_date?: string | null
          total_active_days?: number
          total_assessments?: number
          total_phrases?: number
          total_sprint_answers?: number
          total_sprint_sessions?: number
          total_words?: number
          update_date?: string
          user_id: string
        }
        Update: {
          current_streak_days?: number
          first_training_date?: string | null
          insert_date?: string
          last_training_date?: string | null
          total_active_days?: number
          total_assessments?: number
          total_phrases?: number
          total_sprint_answers?: number
          total_sprint_sessions?: number
          total_words?: number
          update_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_m_training_lifetime_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
      student_m_video_progress: {
        Row: {
          completed_at: string | null
          insert_date: string
          last_position_sec: number
          last_viewed_at: string
          update_date: string
          user_id: string
          video_id: string
        }
        Insert: {
          completed_at?: string | null
          insert_date?: string
          last_position_sec?: number
          last_viewed_at?: string
          update_date?: string
          user_id: string
          video_id: string
        }
        Update: {
          completed_at?: string | null
          insert_date?: string
          last_position_sec?: number
          last_viewed_at?: string
          update_date?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_m_video_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_m_video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "com_m_video"
            referencedColumns: ["video_id"]
          },
        ]
      }
      student_t_sprint_level_history: {
        Row: {
          change_kind: 0 | 1 | 2
          changed_by: string | null
          effective_at: string
          history_id: number
          insert_date: string
          new_level: number
          old_level: number | null
          question_type: 0 | 4 | 5 | 6
          user_id: string
          voided_at: string | null
          voided_by_history_id: number | null
        }
        Insert: {
          change_kind: 0 | 1 | 2
          changed_by?: string | null
          effective_at: string
          history_id?: never
          insert_date?: string
          new_level: number
          old_level?: number | null
          question_type: 0 | 4 | 5 | 6
          user_id: string
          voided_at?: string | null
          voided_by_history_id?: number | null
        }
        Update: {
          change_kind?: 0 | 1 | 2
          changed_by?: string | null
          effective_at?: string
          history_id?: never
          insert_date?: string
          new_level?: number
          old_level?: number | null
          question_type?: 0 | 4 | 5 | 6
          user_id?: string
          voided_at?: string | null
          voided_by_history_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_t_sprint_level_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_t_sprint_level_history_voided_by_history_id_fkey"
            columns: ["voided_by_history_id"]
            isOneToOne: false
            referencedRelation: "student_t_sprint_level_history"
            referencedColumns: ["history_id"]
          },
        ]
      }
    }
    Views: {
      vw_contract_details: {
        Row: {
          client_id: string | null
          client_name: string | null
          contract_id: string | null
          contract_name: string | null
          contract_type: number | null
          current_active_count: number | null
          current_assigned_count: number | null
          end_date: string | null
          has_dialogue_practice: boolean | null
          insert_date: string | null
          max_licenses: number | null
          note: string | null
          plan_id: string | null
          plan_name: string | null
          plan_name_en: string | null
          remaining_licenses: number | null
          start_date: string | null
          status: number | null
          total_sessions: number | null
          update_date: string | null
          weekly_frequency: number | null
        }
        Relationships: [
          {
            foreignKeyName: "com_m_contract_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "com_m_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "com_m_contract_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "com_m_contract_plan"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      vw_my_license_status: {
        Row: {
          contract_status: number | null
          end_date: string | null
          is_active_member: boolean | null
          license_id: string | null
          license_status: number | null
          plan_name: string | null
          start_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_t_user_license_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "com_m_user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_term_revision: {
        Args: { p_change_note: string | null; p_content: string | null; p_term_id: string | null }
        Returns: number
      }
      admin_add_calendar_event_series_sessions: {
        Args: { p_series_id: string | null; p_sessions: Json }
        Returns: string[]
      }
      admin_adjust_schedule_target_sessions: {
        Args: {
          p_new_target_sessions: number | null
          p_reason: string | null
          p_schedule_id: string | null
        }
        Returns: undefined
      }
      admin_book_session_direct: {
        Args: {
          p_end_datetime: string | null
          p_reason?: string | null
          p_schedule_id: string | null
          p_start_datetime: string | null
        }
        Returns: string
      }
      admin_correct_session_outcome: {
        Args: {
          p_conducted_via: number | null
          p_outcome: number | null
          p_reason: string | null
          p_session_id: string | null
        }
        Returns: undefined
      }
      admin_create_calendar_event_series: {
        Args: { p_description: string | null; p_sessions: Json; p_title: string | null }
        Returns: string
      }
      admin_get_coach_ratings: { Args: { p_coach_id: string }; Returns: Json }
      admin_get_session_records: {
        Args: {
          p_coach_id?: string | null
          p_from?: string | null
          p_limit?: number | null
          p_name_pattern?: string | null
          p_offset?: number | null
          p_result?: string | null
          p_review_only?: boolean | null
          p_to?: string | null
          p_via?: string | null
        }
        Returns: {
          cancel_category: number
          cancel_reason: string
          coach_id: string
          coach_name: string
          completion_result: number
          conducted_via: number
          end_datetime: string
          is_corrected: boolean
          needs_review: boolean
          outcome_mismatch: boolean
          session_id: string
          start_datetime: string
          status: number
          status_note: string
          student_id: string
          student_name: string
          suggested_outcome: number
          total_count: number
        }[]
      }
      admin_match_student_with_coach: {
        Args: {
          p_coach_id: string | null
          p_day_of_week: number | null
          p_end_time: string | null
          p_slot_no: number | null
          p_start_time: string | null
          p_ticket_id: string | null
        }
        Returns: string
      }
      admin_set_coach_matching_suspension: {
        Args: { p_coach_id: string | null; p_note: string | null; p_suspended: boolean | null }
        Returns: undefined
      }
      admin_set_coach_specialties: {
        Args: { p_coach_id: string | null; p_specialty_codes: string[] | null }
        Returns: string[]
      }
      append_sprint_level_history: {
        Args: {
          p_changed_by: string | null
          p_new_level: number | null
          p_old_level: number | null
          p_question_type: number | null
          p_user_id: string | null
        }
        Returns: undefined
      }
      approve_coach_monthly_report: {
        Args: {
          p_approved_by: string | null
          p_coach_id: string | null
          p_report_month: string | null
        }
        Returns: undefined
      }
      approve_matching_request: {
        Args: { p_request_id: string | null }
        Returns: string
      }
      approve_slot_proposal: {
        Args: { p_proposal_id: string | null }
        Returns: string
      }
      cancel_session: {
        Args: {
          p_admin_refund_ticket?: boolean | null
          p_as_admin?: boolean | null
          p_proposed_slots?: Json
          p_reason?: string | null
          p_session_id: string | null
        }
        Returns: undefined
      }
      check_session_conflict: {
        Args: {
          p_coach_id: string | null
          p_end_datetime: string | null
          p_exclude_session_id?: string | null
          p_start_datetime: string | null
          p_student_id: string | null
        }
        Returns: {
          coach_conflict: boolean
          student_conflict: boolean
        }[]
      }
      claim_mail_outbox: {
        Args: { p_limit: number | null; p_lock_timeout_minutes?: number | null }
        Returns: {
          attempts: number
          category: string
          dedup_key: string
          delivery_detail: string | null
          delivery_status: string | null
          delivery_updated_at: string | null
          insert_date: string
          last_error: string | null
          locked_at: string | null
          mail_id: string
          mail_type: string
          payload: Json
          provider_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          update_date: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "com_t_mail_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_my_coach_availability: { Args: never; Returns: string }
      create_session_booking_request: {
        Args: {
          p_end_datetime: string | null
          p_reason?: string | null
          p_schedule_id: string | null
          p_start_datetime: string | null
        }
        Returns: string
      }
      create_term: {
        Args: {
          p_content: string | null
          p_is_required: boolean | null
          p_published_date: string | null
          p_term_type: string | null
          p_version_name: string | null
        }
        Returns: string
      }
      enqueue_coach_availability_reminders: { Args: never; Returns: number }
      enqueue_event_reminders: { Args: never; Returns: number }
      enqueue_live_session_reminders: { Args: never; Returns: number }
      enqueue_scheduled_mails: { Args: never; Returns: number }
      fn_apply_session_outcome: {
        Args: {
          p_action: string | null
          p_conducted_via: number | null
          p_outcome: number | null
          p_outcome_mismatch: boolean | null
          p_reason: string | null
          p_session_id: string | null
          p_suggested_outcome: number | null
        }
        Returns: undefined
      }
      fn_assert_actor_or_admin: {
        Args: { p_actor_id: string | null; p_message?: string | null }
        Returns: undefined
      }
      fn_assert_dual_actor_or_admin: {
        Args: { p_actor_id_1: string | null; p_actor_id_2: string | null; p_message?: string | null }
        Returns: boolean
      }
      fn_cancel_future_sessions: {
        Args: {
          p_cancel_category: number | null
          p_cancel_reason: string | null
          p_schedule_id: string | null
          p_ticket_id: string | null
        }
        Returns: number
      }
      fn_coach_matching_missing_items: {
        Args: { p_coach_id: string | null }
        Returns: string[]
      }
      fn_coach_rating_targets: {
        Args: { p_student_id: string | null }
        Returns: {
          coach_id: string
          completed_count: number
          license_end_date: string
          ticket_id: string
        }[]
      }
      fn_commit_matching_schedule: {
        Args: {
          p_coach_id: string | null
          p_day_of_week: number | null
          p_end_time: string | null
          p_enforce_rate?: boolean | null
          p_min_start_datetime?: string | null
          p_request_id: string | null
          p_slot_no: number | null
          p_start_time: string | null
          p_student_id: string | null
          p_ticket_id: string | null
          p_timezone: string | null
        }
        Returns: string
      }
      fn_consume_session_ticket: {
        Args: { p_note?: string | null; p_ticket_id: string | null }
        Returns: undefined
      }
      fn_create_initial_coach_rating: {
        Args: { p_coach_id: string | null }
        Returns: undefined
      }
      fn_ensure_one_on_one_chat_room: {
        Args: { p_user_a: string | null; p_user_b: string | null }
        Returns: {
          created: boolean
          room_id: string
        }[]
      }
      fn_expire_matching_requests: {
        Args: { p_slot_no?: number | null; p_ticket_id?: string | null }
        Returns: number
      }
      fn_find_auth_user_id_by_email: {
        Args: { p_email: string | null }
        Returns: string
      }
      fn_generate_sessions_for_schedule: {
        Args: { p_min_start_datetime?: string | null; p_schedule_id: string | null }
        Returns: number
      }
      fn_mail_delivery_rank: { Args: { p_status: string }; Returns: number }
      fn_mark_coach_availability_confirmed: {
        Args: { p_coach_id: string | null }
        Returns: undefined
      }
      fn_matching_occurrence_busy: {
        Args: {
          p_coach_id: string | null
          p_end_ts: string | null
          p_exclude_request_id?: string | null
          p_exclude_schedule_id?: string | null
          p_include_others_pending?: boolean | null
          p_start_ts: string | null
          p_student_id: string | null
        }
        Returns: boolean
      }
      fn_matching_slot_availability: {
        Args: {
          p_coach_id: string | null
          p_day_of_week: number | null
          p_end_time: string | null
          p_exclude_request_id?: string | null
          p_include_others_pending?: boolean | null
          p_min_start_datetime?: string | null
          p_slot_no: number | null
          p_start_time: string | null
          p_ticket_id: string | null
          p_timezone: string | null
        }
        Returns: {
          bookable_sessions: number
          is_acceptable: boolean
          possible_sessions: number
          required_sessions: number
          target_sessions: number
        }[]
      }
      fn_matching_slot_target_sessions: {
        Args: { p_slot_no: number | null; p_ticket_id: string | null }
        Returns: number
      }
      fn_notify: {
        Args: {
          p_link_path: string | null
          p_notification_type: string | null
          p_payload: Json
          p_user_id: string | null
        }
        Returns: undefined
      }
      fn_purge_client: {
        Args: {
          p_client_id: string | null
          p_dry_run: boolean | null
          p_performed_by: string | null
        }
        Returns: Json
      }
      fn_refresh_coach_rating_stats: {
        Args: { p_coach_id: string | null }
        Returns: undefined
      }
      fn_resolve_web_trial_contract: {
        Args: { p_at?: string | null }
        Returns: string
      }
      fn_restore_session_ticket: {
        Args: { p_note?: string | null; p_ticket_id: string | null }
        Returns: undefined
      }
      fn_schedule_bookable_count: {
        Args: { p_schedule_id: string | null }
        Returns: number
      }
      fn_schedule_shortfall: {
        Args: { p_schedule_id: string | null }
        Returns: {
          actual_sessions: number
          expected_sessions: number
          shortfall: number
        }[]
      }
      fn_send_matching_greeting: {
        Args: { p_schedule_id: string | null }
        Returns: undefined
      }
      fn_session_outcome_evidence: {
        Args: { p_session_id: string | null }
        Returns: {
          coach_joined: boolean
          overlap_seconds: number
          student_joined: boolean
          suggested_outcome: number
        }[]
      }
      fn_submit_trial_application: {
        Args: {
          p_country_city: string | null
          p_email: string | null
          p_expires_at: string | null
          p_first_name: string | null
          p_first_name_latin: string | null
          p_last_name: string | null
          p_last_name_latin: string | null
          p_message: string | null
          p_min_interval?: string | null
          p_occupation: number | null
          p_occupation_other: string | null
          p_referral_source: number | null
          p_referral_source_other: string | null
          p_timezone: string | null
          p_token: string | null
        }
        Returns: {
          application_id: string
          apply_count: number
          invitation_token: string
          kind: string
          throttled: boolean
        }[]
      }
      fn_weekly_occurrences: {
        Args: {
          p_day_of_week: number | null
          p_end_time: string | null
          p_from: string | null
          p_start_time: string | null
          p_timezone: string | null
          p_to: string | null
        }
        Returns: {
          end_ts: string
          start_ts: string
        }[]
      }
      fn_withdraw_user: {
        Args: { p_performed_by: string | null; p_user_id: string | null }
        Returns: Json
      }
      get_coach_matching_status: {
        Args: { p_coach_id: string | null }
        Returns: {
          accepting_students: boolean
          is_demo: boolean
          is_suspended: boolean
          missing_items: string[]
          suspended_at: string
          suspended_note: string
        }[]
      }
      get_coach_monthly_active_students: {
        Args: { p_coach_id: string | null; p_report_month: string | null }
        Returns: {
          icon_path: string
          student_id: string
          user_name: string
        }[]
      }
      get_coach_monthly_sessions: {
        Args: { p_coach_id: string | null; p_report_month: string | null }
        Returns: {
          cancel_category: number
          completion_result: number
          counts_toward_total: boolean
          end_datetime: string
          is_attention: boolean
          is_unresolved: boolean
          session_id: string
          start_datetime: string
          status: number
          status_note: string
          student_id: string
          ticket_refunded: boolean
        }[]
      }
      get_jwt_client_id: { Args: never; Returns: string }
      get_jwt_user_type: { Args: never; Returns: string }
      get_matchable_coach_ids: {
        Args: { p_ticket_id: string | null }
        Returns: {
          coach_id: string
        }[]
      }
      get_matching_request_availability: {
        Args: { p_request_ids: string[] | null }
        Returns: {
          bookable_sessions: number
          is_acceptable: boolean
          possible_sessions: number
          request_id: string
          required_sessions: number
          target_sessions: number
        }[]
      }
      get_matching_slot_options: {
        Args: {
          p_coach_id: string | null
          p_days: number[] | null
          p_end_times: string[] | null
          p_slot_no: number | null
          p_start_times: string[] | null
          p_ticket_id: string | null
        }
        Returns: {
          bookable_sessions: number
          day_of_week: number
          is_acceptable: boolean
          possible_sessions: number
          required_sessions: number
          start_time: string
          target_sessions: number
        }[]
      }
      get_monitor_sprint_drill_history: {
        Args: {
          _end_date: string | null
          _include_monitor?: boolean | null
          _start_date: string | null
          _user_ids?: string[] | null
        }
        Returns: Json[]
      }
      get_monitor_sprint_history: {
        Args: {
          _end_date: string | null
          _include_monitor?: boolean | null
          _start_date: string | null
          _user_ids?: string[] | null
        }
        Returns: Json[]
      }
      get_monitor_user_list: {
        Args: {
          _end_date: string | null
          _include_monitor?: boolean | null
          _start_date: string | null
        }
        Returns: {
          client_id: string
          client_name: string
          confirmed_at: string
          contract_id: string
          email: string
          id: string
          insert_date: string
          last_mail_error: string
          last_sign_in_at: string
          license_end_date: string
          license_id: string
          license_start_date: string
          license_state: string
          license_status: number
          mail_sent_at: string
          plan_name: string
          roles: string[]
          user_id: number
          user_name: string
          user_type: string
        }[]
      }
      get_monitor_word_history: {
        Args: {
          _end_date: string | null
          _include_monitor?: boolean | null
          _start_date: string | null
          _user_ids?: string[] | null
        }
        Returns: Json[]
      }
      get_my_pending_coach_ratings: {
        Args: never
        Returns: {
          coach_icon_path: string
          coach_id: string
          coach_name: string
          completed_count: number
          license_end_date: string
          plan_name: string
          ticket_id: string
        }[]
      }
      get_session_outcome_evidence: {
        Args: { p_session_id: string | null }
        Returns: {
          coach_joined: boolean
          overlap_seconds: number
          student_joined: boolean
          suggested_outcome: number
        }[]
      }
      get_sprint_available_levels: {
        Args: { p_content_ids: string[] | null }
        Returns: {
          content_id: string
          difficulty_level: number
          question_type: string
        }[]
      }
      get_sprint_level_as_of: {
        Args: { p_at: string | null; p_question_type: number | null; p_user_id: string | null }
        Returns: number
      }
      get_student_available_content_ids: {
        Args: { p_content_type: number | null; p_student_id: string | null }
        Returns: string[]
      }
      get_training_report_data: {
        Args: { p_license_ids: string[] | null }
        Returns: Json
      }
      get_training_report_targets: {
        Args: { p_from: string | null; p_to: string | null }
        Returns: {
          client_name: string
          contract_id: string
          contract_name: string
          draft_comment_count: number
          end_date: string
          finalized_comment_count: number
          has_live_session: boolean
          license_id: string
          license_status: number
          plan_name: string
          start_date: string
          student_id: string
          student_name: string
        }[]
      }
      get_user_lock_status_by_email: {
        Args: { p_email: string | null }
        Returns: {
          id: string
          locked_until: string
          login_failed_count: number
          user_type: string
        }[]
      }
      get_user_training_performance: {
        Args: { _year_month: string | null }
        Returns: Json
      }
      increment_login_failed_count: {
        Args: { p_max_attempts: number | null; p_user_id: string | null }
        Returns: undefined
      }
      increment_sprint_summary: {
        Args: {
          p_assessment_count: number | null
          p_content_id: string | null
          p_question_count: number | null
          p_question_type: string | null
        }
        Returns: undefined
      }
      increment_word_summary: {
        Args: {
          p_assessment_count: number | null
          p_content_id: string | null
          p_phrase_count: number | null
          p_word_count: number | null
        }
        Returns: undefined
      }
      invalidate_user_license: {
        Args: { p_license_id: string | null }
        Returns: undefined
      }
      is_chat_room_member: { Args: { p_room_id: string }; Returns: boolean }
      is_chat_room_peer: { Args: { p_user_id: string }; Returns: boolean }
      is_coach_content_accessible: {
        Args: { p_content_id: string | null }
        Returns: boolean
      }
      is_coach_of_contract_license: {
        Args: { p_contract_id: string | null }
        Returns: boolean
      }
      is_system_admin: { Args: never; Returns: boolean }
      mark_session_homework_viewed: {
        Args: { p_session_id: string | null }
        Returns: undefined
      }
      match_ai_knowledge_base: {
        Args: {
          _match_count?: number | null
          _match_threshold?: number | null
          _query_embedding: string | null
          _source_type?: string | null
        }
        Returns: {
          body: string
          knowledge_id: string
          metadata: Json
          similarity: number
          source_type: string
          title: string
        }[]
      }
      matching_min_bookable_rate: { Args: never; Returns: number }
      matching_request_ttl: { Args: never; Returns: string }
      purge_contract_with_history: {
        Args: { p_contract_id: string | null }
        Returns: undefined
      }
      record_mail_event: {
        Args: {
          p_detail: string | null
          p_event_type: string | null
          p_mail_id: string | null
          p_mail_kind: string | null
          p_occurred_at: string | null
          p_provider_message_id: string | null
          p_recipient: string | null
          p_subject: string | null
          p_webhook_id: string | null
        }
        Returns: boolean
      }
      record_session_call_join: {
        Args: { p_session_id: string | null; p_zoom_session_id?: string | null }
        Returns: string
      }
      record_session_call_leave: {
        Args: { p_call_log_id: string | null }
        Returns: undefined
      }
      record_session_outcome: {
        Args: {
          p_conducted_via?: number | null
          p_outcome: number | null
          p_reason?: string | null
          p_session_id: string | null
        }
        Returns: undefined
      }
      reject_matching_request: {
        Args: { p_reason: string | null; p_request_id: string | null }
        Returns: undefined
      }
      reject_slot_proposal: {
        Args: { p_proposal_id: string | null; p_reason?: string | null }
        Returns: undefined
      }
      release_lesson_schedule_slot: {
        Args: { p_schedule_id: string | null }
        Returns: undefined
      }
      reporting_timezone: { Args: never; Returns: string }
      revoke_coach_monthly_report_approval: {
        Args: { p_coach_id: string | null; p_report_month: string | null }
        Returns: undefined
      }
      set_session_homework_not_needed: {
        Args: { p_not_needed: boolean | null; p_session_id: string | null }
        Returns: undefined
      }
      submit_coach_rating: {
        Args: {
          p_coach_id: string | null
          p_coaching_score: number | null
          p_feedback: string | null
          p_friendliness_score: number | null
          p_recommendation_score: number | null
          p_ticket_id: string | null
        }
        Returns: string
      }
      touch_expired_user_licenses: { Args: never; Returns: undefined }
      update_training_lifetime_stats: {
        Args: {
          p_assessment_delta?: number | null
          p_phrase_delta?: number | null
          p_sprint_answer_delta?: number | null
          p_sprint_session_delta?: number | null
          p_training_date: string | null
          p_user_id: string | null
          p_word_delta?: number | null
        }
        Returns: undefined
      }
      web_trial_client_id: { Args: never; Returns: string }
      withdraw_matching_request: {
        Args: { p_request_id: string | null }
        Returns: undefined
      }
      withdraw_session_booking_request: {
        Args: { p_request_id: string | null }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
