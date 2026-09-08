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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          attributed_doctor_id: string | null
          created_at: string
          deduplication_key: string
          detail: Json
          id: string
          interaction_id: string | null
          kind: string
          measurement_id: string | null
          patient_id: string
          resolution_note: string | null
          resolved_at: string | null
          risk_assessment_id: string | null
          severity: string
          status: string
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          attributed_doctor_id?: string | null
          created_at?: string
          deduplication_key: string
          detail?: Json
          id?: string
          interaction_id?: string | null
          kind: string
          measurement_id?: string | null
          patient_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          risk_assessment_id?: string | null
          severity: string
          status?: string
          title: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          attributed_doctor_id?: string | null
          created_at?: string
          deduplication_key?: string
          detail?: Json
          id?: string
          interaction_id?: string | null
          kind?: string
          measurement_id?: string | null
          patient_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          risk_assessment_id?: string | null
          severity?: string
          status?: string
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interaction_status"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interactions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_measurement_id_fkey"
            columns: ["unit_id", "patient_id", "measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "alerts_unit_id_patient_id_risk_assessment_id_fkey"
            columns: ["unit_id", "patient_id", "risk_assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      appointments: {
        Row: {
          attributed_doctor_id: string
          consulting_room_id: string
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          starts_at: string
          status: string
          unit_id: string
          updated_at: string
          urgency: string
        }
        Insert: {
          attributed_doctor_id: string
          consulting_room_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          starts_at: string
          status?: string
          unit_id: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          attributed_doctor_id?: string
          consulting_room_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          starts_at?: string
          status?: string
          unit_id?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "appointments_unit_id_consulting_room_id_fkey"
            columns: ["unit_id", "consulting_room_id"]
            isOneToOne: false
            referencedRelation: "consulting_rooms"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "appointments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "appointments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "appointments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "appointments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "appointments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          attributed_doctor_id: string | null
          entity_id: string
          entity_table: string
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          unit_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          attributed_doctor_id?: string | null
          entity_id: string
          entity_table: string
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          unit_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          attributed_doctor_id?: string | null
          entity_id?: string
          entity_table?: string
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "audit_log_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_interactions: {
        Row: {
          accepted_at: string | null
          appointment_id: string | null
          attempt_count: number
          claimed_at: string | null
          created_at: string
          deduplication_key: string
          delivered_at: string | null
          delivery_status: string
          expects_response: boolean
          failure_code: string | null
          failure_detail: string | null
          id: string
          kind: string
          monitoring_plan_id: string | null
          patient_id: string
          payload_snapshot: Json
          prescription_id: string | null
          provider: string
          provider_message_id: string | null
          read_at: string | null
          reply_code: string
          response_at: string | null
          response_deadline_at: string | null
          scheduled_at: string
          timeout_at: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          appointment_id?: string | null
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          deduplication_key: string
          delivered_at?: string | null
          delivery_status?: string
          expects_response: boolean
          failure_code?: string | null
          failure_detail?: string | null
          id?: string
          kind: string
          monitoring_plan_id?: string | null
          patient_id: string
          payload_snapshot?: Json
          prescription_id?: string | null
          provider: string
          provider_message_id?: string | null
          read_at?: string | null
          reply_code?: string
          response_at?: string | null
          response_deadline_at?: string | null
          scheduled_at: string
          timeout_at?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          appointment_id?: string | null
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          deduplication_key?: string
          delivered_at?: string | null
          delivery_status?: string
          expects_response?: boolean
          failure_code?: string | null
          failure_detail?: string | null
          id?: string
          kind?: string
          monitoring_plan_id?: string | null
          patient_id?: string
          payload_snapshot?: Json
          prescription_id?: string | null
          provider?: string
          provider_message_id?: string | null
          read_at?: string | null
          reply_code?: string
          response_at?: string | null
          response_deadline_at?: string | null
          scheduled_at?: string
          timeout_at?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_appointment_id_fkey"
            columns: ["unit_id", "patient_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_monitoring_plan_id_fkey"
            columns: ["unit_id", "patient_id", "monitoring_plan_id"]
            isOneToOne: false
            referencedRelation: "monitoring_plans"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_prescription_id_fkey"
            columns: ["unit_id", "patient_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "current_prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_prescription_id_fkey"
            columns: ["unit_id", "patient_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      consent_events: {
        Row: {
          attributed_doctor_id: string | null
          created_at: string
          event: string
          evidence_note: string
          id: string
          method: string
          notice_version: string
          patient_id: string
          scope: string
          sequence_no: number
          unit_id: string
        }
        Insert: {
          attributed_doctor_id?: string | null
          created_at?: string
          event: string
          evidence_note: string
          id?: string
          method: string
          notice_version: string
          patient_id: string
          scope?: string
          sequence_no?: never
          unit_id: string
        }
        Update: {
          attributed_doctor_id?: string | null
          created_at?: string
          event?: string
          evidence_note?: string
          id?: string
          method?: string
          notice_version?: string
          patient_id?: string
          scope?: string
          sequence_no?: never
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "consent_events_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "consent_events_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "consent_events_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "consent_events_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "consent_events_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      consulting_rooms: {
        Row: {
          active: boolean
          created_at: string
          doctor_id: string
          id: string
          name: string
          unit_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          doctor_id: string
          id?: string
          name: string
          unit_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          doctor_id?: string
          id?: string
          name?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consulting_rooms_unit_id_doctor_id_fkey"
            columns: ["unit_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "consulting_rooms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          professional_license: string | null
          unit_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          professional_license?: string | null
          unit_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          professional_license?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      health_units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          institutional_code: string | null
          name: string
          timezone: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          institutional_code?: string | null
          name: string
          timezone?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          institutional_code?: string | null
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      measurements: {
        Row: {
          attributed_doctor_id: string | null
          correction_reason: string | null
          created_at: string
          diastolic_mm_hg: number | null
          glucose_mg_dl: number | null
          id: string
          interaction_id: string | null
          kind: string
          measured_at: string
          measurement_context: string | null
          monitoring_plan_id: string | null
          notes: string | null
          patient_id: string
          source: string
          systolic_mm_hg: number | null
          unit_id: string
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          attributed_doctor_id?: string | null
          correction_reason?: string | null
          created_at?: string
          diastolic_mm_hg?: number | null
          glucose_mg_dl?: number | null
          id?: string
          interaction_id?: string | null
          kind: string
          measured_at: string
          measurement_context?: string | null
          monitoring_plan_id?: string | null
          notes?: string | null
          patient_id: string
          source: string
          systolic_mm_hg?: number | null
          unit_id: string
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          attributed_doctor_id?: string | null
          correction_reason?: string | null
          created_at?: string
          diastolic_mm_hg?: number | null
          glucose_mg_dl?: number | null
          id?: string
          interaction_id?: string | null
          kind?: string
          measured_at?: string
          measurement_context?: string | null
          monitoring_plan_id?: string | null
          notes?: string | null
          patient_id?: string
          source?: string
          systolic_mm_hg?: number | null
          unit_id?: string
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measurements_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interaction_status"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interactions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "measurements_unit_id_patient_id_monitoring_plan_id_fkey"
            columns: ["unit_id", "patient_id", "monitoring_plan_id"]
            isOneToOne: false
            referencedRelation: "monitoring_plans"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      medication_responses: {
        Row: {
          attributed_doctor_id: string | null
          correction_reason: string | null
          created_at: string
          id: string
          interaction_id: string
          notes: string | null
          patient_id: string
          reported_at: string
          source: string
          taken: boolean
          unit_id: string
          updated_at: string
        }
        Insert: {
          attributed_doctor_id?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          interaction_id: string
          notes?: string | null
          patient_id: string
          reported_at: string
          source: string
          taken: boolean
          unit_id: string
          updated_at?: string
        }
        Update: {
          attributed_doctor_id?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          interaction_id?: string
          notes?: string | null
          patient_id?: string
          reported_at?: string
          source?: string
          taken?: boolean
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_responses_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interaction_status"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "medication_responses_unit_id_patient_id_interaction_id_fkey"
            columns: ["unit_id", "patient_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "bot_interactions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      medications: {
        Row: {
          active: boolean
          attributed_doctor_id: string | null
          created_at: string
          id: string
          name: string
          pharmaceutical_form: string | null
          strength: string | null
          therapeutic_class: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributed_doctor_id?: string | null
          created_at?: string
          id?: string
          name: string
          pharmaceutical_form?: string | null
          strength?: string | null
          therapeutic_class?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributed_doctor_id?: string | null
          created_at?: string
          id?: string
          name?: string
          pharmaceutical_form?: string | null
          strength?: string | null
          therapeutic_class?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "medications_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_plans: {
        Row: {
          active: boolean
          attributed_doctor_id: string
          created_at: string
          critical_diastolic_max_mm_hg: number | null
          critical_diastolic_min_mm_hg: number | null
          critical_glucose_max_mg_dl: number | null
          critical_glucose_min_mg_dl: number | null
          critical_systolic_max_mm_hg: number | null
          critical_systolic_min_mm_hg: number | null
          diastolic_max_mm_hg: number | null
          diastolic_min_mm_hg: number | null
          end_date: string | null
          glucose_max_mg_dl: number | null
          glucose_min_mg_dl: number | null
          id: string
          instructions: string | null
          kind: string
          local_time: string
          measurement_context: string | null
          patient_id: string
          start_date: string
          systolic_max_mm_hg: number | null
          systolic_min_mm_hg: number | null
          unit_id: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          attributed_doctor_id: string
          created_at?: string
          critical_diastolic_max_mm_hg?: number | null
          critical_diastolic_min_mm_hg?: number | null
          critical_glucose_max_mg_dl?: number | null
          critical_glucose_min_mg_dl?: number | null
          critical_systolic_max_mm_hg?: number | null
          critical_systolic_min_mm_hg?: number | null
          diastolic_max_mm_hg?: number | null
          diastolic_min_mm_hg?: number | null
          end_date?: string | null
          glucose_max_mg_dl?: number | null
          glucose_min_mg_dl?: number | null
          id?: string
          instructions?: string | null
          kind: string
          local_time: string
          measurement_context?: string | null
          patient_id: string
          start_date: string
          systolic_max_mm_hg?: number | null
          systolic_min_mm_hg?: number | null
          unit_id: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          attributed_doctor_id?: string
          created_at?: string
          critical_diastolic_max_mm_hg?: number | null
          critical_diastolic_min_mm_hg?: number | null
          critical_glucose_max_mg_dl?: number | null
          critical_glucose_min_mg_dl?: number | null
          critical_systolic_max_mm_hg?: number | null
          critical_systolic_min_mm_hg?: number | null
          diastolic_max_mm_hg?: number | null
          diastolic_min_mm_hg?: number | null
          end_date?: string | null
          glucose_max_mg_dl?: number | null
          glucose_min_mg_dl?: number | null
          id?: string
          instructions?: string | null
          kind?: string
          local_time?: string
          measurement_context?: string | null
          patient_id?: string
          start_date?: string
          systolic_max_mm_hg?: number | null
          systolic_min_mm_hg?: number | null
          unit_id?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_plans_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "monitoring_plans_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "monitoring_plans_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "monitoring_plans_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "monitoring_plans_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "monitoring_plans_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      patient_complications: {
        Row: {
          active: boolean
          attributed_doctor_id: string
          code: string
          correction_reason: string | null
          created_at: string
          diagnosed_on: string | null
          id: string
          notes: string | null
          patient_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributed_doctor_id: string
          code: string
          correction_reason?: string | null
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributed_doctor_id?: string
          code?: string
          correction_reason?: string | null
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_complications_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "patient_complications_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_complications_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_complications_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_complications_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_complications_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      patient_diagnoses: {
        Row: {
          active: boolean
          attributed_doctor_id: string | null
          condition_code: string
          created_at: string
          description: string | null
          diagnosed_on: string | null
          id: string
          patient_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributed_doctor_id?: string | null
          condition_code: string
          created_at?: string
          description?: string | null
          diagnosed_on?: string | null
          id?: string
          patient_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributed_doctor_id?: string | null
          condition_code?: string
          created_at?: string
          description?: string | null
          diagnosed_on?: string | null
          id?: string
          patient_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_diagnoses_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "patient_diagnoses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      patient_messaging_state: {
        Row: {
          last_inbound_at: string | null
          patient_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          last_inbound_at?: string | null
          patient_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          last_inbound_at?: string | null
          patient_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_messaging_state_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_messaging_state_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_messaging_state_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_messaging_state_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "patient_messaging_state_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      patients: {
        Row: {
          active: boolean
          affiliation_number: string | null
          attributed_doctor_id: string | null
          birth_date: string
          blood_type: string | null
          bot_response_timeout_minutes: number
          consulting_room_id: string
          created_at: string
          curp: string | null
          followup_interval_days: number | null
          full_name: string
          id: string
          initial_risk: string
          initial_risk_reason: string | null
          record_number: string | null
          risk_rule_config: Json
          sex: string
          unit_id: string
          updated_at: string
          whatsapp_e164: string
        }
        Insert: {
          active?: boolean
          affiliation_number?: string | null
          attributed_doctor_id?: string | null
          birth_date: string
          blood_type?: string | null
          bot_response_timeout_minutes?: number
          consulting_room_id: string
          created_at?: string
          curp?: string | null
          followup_interval_days?: number | null
          full_name: string
          id?: string
          initial_risk?: string
          initial_risk_reason?: string | null
          record_number?: string | null
          risk_rule_config?: Json
          sex: string
          unit_id: string
          updated_at?: string
          whatsapp_e164: string
        }
        Update: {
          active?: boolean
          affiliation_number?: string | null
          attributed_doctor_id?: string | null
          birth_date?: string
          blood_type?: string | null
          bot_response_timeout_minutes?: number
          consulting_room_id?: string
          created_at?: string
          curp?: string | null
          followup_interval_days?: number | null
          full_name?: string
          id?: string
          initial_risk?: string
          initial_risk_reason?: string | null
          record_number?: string | null
          risk_rule_config?: Json
          sex?: string
          unit_id?: string
          updated_at?: string
          whatsapp_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "patients_unit_id_consulting_room_id_fkey"
            columns: ["unit_id", "consulting_room_id"]
            isOneToOne: false
            referencedRelation: "consulting_rooms"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_schedules: {
        Row: {
          created_at: string
          id: string
          local_time: string
          prescription_id: string
          unit_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          id?: string
          local_time: string
          prescription_id: string
          unit_id: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          id?: string
          local_time?: string
          prescription_id?: string
          unit_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "prescription_schedules_unit_id_prescription_id_fkey"
            columns: ["unit_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "current_prescriptions"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescription_schedules_unit_id_prescription_id_fkey"
            columns: ["unit_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          attributed_doctor_id: string
          change_reason: string | null
          created_at: string
          dose_text: string
          end_date: string | null
          id: string
          instructions: string | null
          medication_id: string
          patient_id: string
          route: string | null
          series_id: string
          start_date: string
          status: string
          supersedes_id: string | null
          unit_id: string
          updated_at: string
          version: number
        }
        Insert: {
          attributed_doctor_id: string
          change_reason?: string | null
          created_at?: string
          dose_text: string
          end_date?: string | null
          id?: string
          instructions?: string | null
          medication_id: string
          patient_id: string
          route?: string | null
          series_id?: string
          start_date: string
          status?: string
          supersedes_id?: string | null
          unit_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          attributed_doctor_id?: string
          change_reason?: string | null
          created_at?: string
          dose_text?: string
          end_date?: string | null
          id?: string
          instructions?: string | null
          medication_id?: string
          patient_id?: string
          route?: string | null
          series_id?: string
          start_date?: string
          status?: string
          supersedes_id?: string | null
          unit_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_medication_id_fkey"
            columns: ["unit_id", "medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_supersedes_id_fkey"
            columns: ["unit_id", "patient_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "current_prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_supersedes_id_fkey"
            columns: ["unit_id", "patient_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          assessed_at: string
          created_at: string
          id: string
          input_snapshot: Json
          level: string
          patient_id: string
          reasons: Json
          rule_version: string
          unit_id: string
        }
        Insert: {
          assessed_at?: string
          created_at?: string
          id?: string
          input_snapshot: Json
          level: string
          patient_id: string
          reasons: Json
          rule_version: string
          unit_id: string
        }
        Update: {
          assessed_at?: string
          created_at?: string
          id?: string
          input_snapshot?: Json
          level?: string
          patient_id?: string
          reasons?: Json
          rule_version?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "risk_assessments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "risk_assessments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "risk_assessments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "risk_assessments_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
        ]
      }
      unit_memberships: {
        Row: {
          active: boolean
          created_at: string
          role: string
          unit_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          role?: string
          unit_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          role?: string
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_memberships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_key: string
          event_type: string
          external_message_id: string | null
          id: string
          last_error: string | null
          normalized_payload: Json
          processed_at: string | null
          processing_attempts: number
          processing_status: string
          provider: string
          received_at: string
          unit_id: string | null
        }
        Insert: {
          event_key: string
          event_type: string
          external_message_id?: string | null
          id?: string
          last_error?: string | null
          normalized_payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          provider: string
          received_at?: string
          unit_id?: string | null
        }
        Update: {
          event_key?: string
          event_type?: string
          external_message_id?: string | null
          id?: string
          last_error?: string | null
          normalized_payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          provider?: string
          received_at?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bot_interaction_status: {
        Row: {
          accepted_at: string | null
          appointment_id: string | null
          attempt_count: number | null
          claimed_at: string | null
          created_at: string | null
          deduplication_key: string | null
          delivered_at: string | null
          delivery_status: string | null
          expects_response: boolean | null
          failure_code: string | null
          failure_detail: string | null
          id: string | null
          kind: string | null
          monitoring_plan_id: string | null
          patient_id: string | null
          payload_snapshot: Json | null
          prescription_id: string | null
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          reply_code: string | null
          response_at: string | null
          response_deadline_at: string | null
          response_status: string | null
          scheduled_at: string | null
          timeout_at: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          appointment_id?: string | null
          attempt_count?: number | null
          claimed_at?: string | null
          created_at?: string | null
          deduplication_key?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          expects_response?: boolean | null
          failure_code?: string | null
          failure_detail?: string | null
          id?: string | null
          kind?: string | null
          monitoring_plan_id?: string | null
          patient_id?: string | null
          payload_snapshot?: Json | null
          prescription_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          reply_code?: string | null
          response_at?: string | null
          response_deadline_at?: string | null
          response_status?: never
          scheduled_at?: string | null
          timeout_at?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          appointment_id?: string | null
          attempt_count?: number | null
          claimed_at?: string | null
          created_at?: string | null
          deduplication_key?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          expects_response?: boolean | null
          failure_code?: string | null
          failure_detail?: string | null
          id?: string | null
          kind?: string | null
          monitoring_plan_id?: string | null
          patient_id?: string | null
          payload_snapshot?: Json | null
          prescription_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          reply_code?: string | null
          response_at?: string | null
          response_deadline_at?: string | null
          response_status?: never
          scheduled_at?: string | null
          timeout_at?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_appointment_id_fkey"
            columns: ["unit_id", "patient_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_monitoring_plan_id_fkey"
            columns: ["unit_id", "patient_id", "monitoring_plan_id"]
            isOneToOne: false
            referencedRelation: "monitoring_plans"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_prescription_id_fkey"
            columns: ["unit_id", "patient_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "current_prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "bot_interactions_unit_id_patient_id_prescription_id_fkey"
            columns: ["unit_id", "patient_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      current_patient_risk: {
        Row: {
          assessed_at: string | null
          assessment_source: string | null
          input_snapshot: Json | null
          level: string | null
          patient_id: string | null
          reasons: Json | null
          rule_version: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      current_prescriptions: {
        Row: {
          attributed_doctor_id: string | null
          change_reason: string | null
          created_at: string | null
          dose_text: string | null
          end_date: string | null
          id: string | null
          instructions: string | null
          medication_id: string | null
          patient_id: string | null
          route: string | null
          series_id: string | null
          start_date: string | null
          status: string | null
          supersedes_id: string | null
          unit_id: string | null
          updated_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_unit_id_attributed_doctor_id_fkey"
            columns: ["unit_id", "attributed_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_medication_id_fkey"
            columns: ["unit_id", "medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "current_patient_risk"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_adherence"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_consent_status"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patient_nonresponse_counts"
            referencedColumns: ["unit_id", "patient_id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_fkey"
            columns: ["unit_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["unit_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_supersedes_id_fkey"
            columns: ["unit_id", "patient_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "current_prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_unit_id_patient_id_supersedes_id_fkey"
            columns: ["unit_id", "patient_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["unit_id", "patient_id", "id"]
          },
        ]
      }
      patient_adherence: {
        Row: {
          confirmed_adherence_pct: number | null
          coverage_pct: number | null
          eligible_count: number | null
          no_count: number | null
          patient_id: string | null
          unit_id: string | null
          unknown_count: number | null
          yes_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_consent_status: {
        Row: {
          consent_granted: boolean | null
          latest_event: string | null
          notice_version: string | null
          patient_id: string | null
          recorded_at: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_nonresponse_counts: {
        Row: {
          currently_unanswered: number | null
          ever_timed_out: number | null
          last_timeout_at: string | null
          patient_id: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "health_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_prescription: {
        Args: {
          p_doctor_id: string
          p_expected_updated_at: string
          p_expected_version: number
          p_input: Json
          p_patient_id: string
          p_prescription_id: string
          p_reason: string
        }
        Returns: Json
      }
      claim_due_interactions: {
        Args: { batch_size?: number }
        Returns: {
          accepted_at: string | null
          appointment_id: string | null
          attempt_count: number
          claimed_at: string | null
          created_at: string
          deduplication_key: string
          delivered_at: string | null
          delivery_status: string
          expects_response: boolean
          failure_code: string | null
          failure_detail: string | null
          id: string
          kind: string
          monitoring_plan_id: string | null
          patient_id: string
          payload_snapshot: Json
          prescription_id: string | null
          provider: string
          provider_message_id: string | null
          read_at: string | null
          reply_code: string
          response_at: string | null
          response_deadline_at: string | null
          scheduled_at: string
          timeout_at: string | null
          unit_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bot_interactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      correct_measurement: {
        Args: {
          p_doctor_id: string
          p_expected_updated_at: string
          p_input: Json
          p_measurement_id: string
          p_patient_id: string
          p_reason: string
        }
        Returns: Json
      }
      correct_medication_response: {
        Args: {
          p_doctor_id: string
          p_expected_updated_at: string
          p_patient_id: string
          p_reason: string
          p_response_id: string
          p_schedule_id: string
          p_scheduled_at: string
          p_taken: boolean
        }
        Returns: Json
      }
      expire_due_interactions: { Args: never; Returns: number }
      mark_urgent: {
        Args: {
          p_doctor_id: string
          p_event_id: string
          p_patient_id: string
          p_reason: string
        }
        Returns: Json
      }
      resolve_alert: {
        Args: {
          p_alert_id: string
          p_doctor_id: string
          p_expected_updated_at: string
          p_next_status: string
          p_patient_id: string
          p_reason: string
        }
        Returns: Json
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
  public: {
    Enums: {},
  },
} as const
