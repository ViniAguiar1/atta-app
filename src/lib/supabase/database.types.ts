
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "api": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "agenda_day":
{ Args: { "p_cpf_hmac"?: string,"p_cursor"?: string,"p_local_date"?: string,"p_no_document"?: boolean,"p_professional_link_id"?: string,"p_search"?: string,"p_status"?: (string)[] }; Returns: Json
                           },
"agenda_range":
{ Args: { "p_cpf_hmac"?: string,"p_cursor"?: string,"p_from"?: string,"p_no_document"?: boolean,"p_period"?: string,"p_professional_link_id"?: string,"p_search"?: string,"p_status"?: (string)[],"p_to"?: string,"p_view": string }; Returns: Json
                           },
"agenda_summary":
{ Args: { "p_professional_link_id"?: string }; Returns: Json
                           },
"atta_code_material":
{ Args: { "p_code": string }; Returns: {
              "evidence_sha256": string,"payload_canonical_b64": string,"seal_keys": Json,"seals": Json,"signed_at": string
            }[]
                           },
"atta_code_verify":
{ Args: { "p_code": string }; Returns: {
              "document_type": string,"evidence_sha256": string,"exists": boolean,"level": string,"signed_at": string,"status": string,"template_version": number,"tenant_cnpj": string,"tenant_trade_name": string
            }[]
                           },
"atta_in_service_delete_blockers":
{ Args: { "p_service_id": string }; Returns: {
              "template_id": string,"title": string
            }[]
                           },
"atta_in_template_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "allowed_actions": Json,"clinic_service_ids": (string)[],"clinic_services": Json,"current_frequency": string,"current_required": boolean,"current_validity_months": number,"current_version": number,"current_version_published_at": string,"frequency": string,"id": string,"kind": string,"required": boolean,"signed_count": number,"status": string,"title": string,"updated_at": string,"validity_months": number
            }[]
                           },
"atta_in_template_publish":
{ Args: { "p_template_id": string }; Returns: {
              "body_sha256": string,"template_version_id": string,"version": number
            }[]
                           },
"atta_in_template_summary":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_count": number,"active_optional_count": number,"active_required_count": number,"expired_count": number,"expiring_count": number,"signed_atta_sign_count": number,"signed_count": number
            }[]
                           },
"audit_anchor_check":
{ Args: { "p_anchors": Json }; Returns: {
              "seq": number,"status": string
            }[]
                           },
"audit_anchor_head":
{ Args: Record<PropertyKey, never>; Returns: {
              "broken_at": number,"event_at": string,"hash": string,"seq": number
            }[]
                           },
"audit_auth_event":
{ Args: { "p_action": string,"p_details"?: Json,"p_user_id"?: string }; Returns: string
                           },
"billing_apply_event":
{ Args: { "p_due_date"?: string,"p_event_id": string,"p_event_type": string,"p_invoice_url"?: string,"p_payment_external_id"?: string,"p_payment_status"?: string,"p_provider": string,"p_subscription_external_id": string,"p_subscription_removed"?: boolean,"p_value_cents"?: number }; Returns: string
                           },
"billing_subscription_get":
{ Args: { "p_tenant_id": string }; Returns: {
              "customer_external_id": string,"id": string,"provider": string,"status": string,"subscription_external_id": string,"value_cents": number
            }[]
                           },
"billing_subscription_register":
{ Args: { "p_customer_external_id": string,"p_provider": string,"p_subscription_external_id": string,"p_tenant_id": string,"p_value_cents": number }; Returns: string
                           },
"billing_subscription_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "next_due_date": string,"next_invoice_url": string,"next_value_cents": number,"overdue_count": number,"status": string,"value_cents": number
            }[]
                           },
"boarding_complete":
{ Args: { "p_session_hash": string }; Returns: string
                           },
"boarding_confirm_pin":
{ Args: { "p_link_hash": string,"p_pin_mac": string,"p_session_hash": string }; Returns: {
              "locked_until": string,"status": string
            }[]
                           },
"boarding_open":
{ Args: { "p_session_hash": string }; Returns: {
              "absent_count": number,"appointment_type": string,"attended_count": number,"clinic_name": string,"patient_age": number,"patient_name": string,"starts_at_local": string,"status": string
            }[]
                           },
"boarding_pin_subject":
{ Args: { "p_link_hash": string }; Returns: string
                           },
"clinic_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"clinic_profile_set":
{ Args: { "p_field": string,"p_value": string }; Returns: string
                           },
"delivery_apply_status":
{ Args: { "p_at": string,"p_billable"?: boolean,"p_channel": string,"p_code"?: string,"p_external_id": string,"p_state": string }; Returns: string
                           },
"delivery_cancel":
{ Args: { "p_id": string,"p_tenant_id": string }; Returns: boolean
                           },
"delivery_claim":
{ Args: { "p_batch": number,"p_lease_seconds": number }; Returns: {
              "attempt": number,"channel": string,"id": string,"idempotency_key": string,"recipient_id": string,"recipient_kind": string,"reference_id": string,"reference_kind": string,"template_id": string,"tenant_id": string,"variables": Json
            }[]
                           },
"delivery_enqueue":
{ Args: { "p_address_enc"?: string,"p_alternatives"?: (string)[],"p_author": string,"p_channel": string,"p_dek_wrapped"?: string,"p_id"?: string,"p_idempotency_key": string,"p_kek_version"?: number,"p_priority"?: number,"p_recipient_id": string,"p_recipient_kind": string,"p_reference_id"?: string,"p_reference_kind"?: string,"p_scheduled_for"?: string,"p_template_id": string,"p_tenant_id": string,"p_valid_until"?: string,"p_variables": Json }; Returns: string
                           },
"delivery_list":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_reference_id"?: string,"p_reference_kind"?: string }; Returns: {
              "attempts": number,"author": string,"channel": string,"created_at": string,"destination_masked": string,"id": string,"last_error_code": string,"reference_id": string,"reference_kind": string,"state": string,"template_id": string,"updated_at": string
            }[]
                           },
"delivery_mark_failed":
{ Args: { "p_attempt": number,"p_code": string,"p_id": string,"p_kind": string }; Returns: string
                           },
"delivery_mark_sent":
{ Args: { "p_attempt": number,"p_destination_masked": string,"p_external_id": string,"p_id": string }; Returns: boolean
                           },
"grant_issue":
{ Args: { "p_appointment_id": string,"p_person_id"?: string,"p_professional_link_id"?: string,"p_purpose": string,"p_secret_hash": string,"p_tenant_id": string }; Returns: string
                           },
"grant_mark_sent":
{ Args: { "p_grant_id": string }; Returns: undefined
                           },
"grant_resolve":
{ Args: { "p_purpose": string,"p_secret_hash": string }; Returns: {
              "appointment_id": string,"expires_at": string,"grant_id": string,"person_id": string,"professional_link_id": string,"tenant_id": string
            }[]
                           },
"grant_revoke":
{ Args: { "p_secret_hash": string }; Returns: undefined
                           },
"notification_channel_set":
{ Args: { "p_active": boolean,"p_address_enc"?: string,"p_address_masked"?: string,"p_channel": string,"p_dek_wrapped"?: string,"p_envelope_id"?: string,"p_kek_version"?: number }; Returns: undefined
                           },
"notification_event_set":
{ Args: { "p_channel": string,"p_enabled": boolean,"p_event_key": string }; Returns: undefined
                           },
"notification_filters_set":
{ Args: { "p_frequencia_resumo": string,"p_pausa_noturna": boolean }; Returns: undefined
                           },
"notification_settings_get":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"patient_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"patient_folder_appointments":
{ Args: { "p_cursor"?: string,"p_person_id": string }; Returns: Json
                           },
"patient_get":
{ Args: { "p_person_id": string }; Returns: {
              "archived_at": string,"birth_date": string,"cpf_masked": string,"dek_wrapped": string,"email_enc": string,"envelope_id": string,"foreign_doc_masked": string,"foreign_doc_type": string,"full_name": string,"is_incomplete": boolean,"is_verified": boolean,"kek_version": number,"linked_at": string,"network_access": string,"origin": string,"person_id": string,"phone_enc": string,"social_name": string,"verified_until": string
            }[]
                           },
"patient_link_by_cpf":
{ Args: { "p_cpf_hmac": string }; Returns: Json
                           },
"patient_list":
{ Args: { "p_after_id"?: string,"p_after_name"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "birth_date": string,"count_archived": number,"count_other_clinic": number,"count_today": number,"cpf_masked": string,"dek_wrapped": string,"display_is_social": boolean,"display_name": string,"documents": Json,"email_enc": string,"envelope_id": string,"foreign_doc_masked": string,"is_incomplete": boolean,"is_verified": boolean,"kek_version": number,"last_appointment": Json,"linked_at": string,"network_access": string,"person_id": string,"phone_enc": string,"total_active": number,"verified_until": string
            }[]
                           },
"patient_lookup_by_cpf":
{ Args: { "p_cpf_hmac": string }; Returns: Json
                           },
"patient_register":
{ Args: { "p_birth_date"?: string,"p_cpf_enc"?: string,"p_cpf_hmac"?: string,"p_cpf_masked"?: string,"p_dek_wrapped"?: string,"p_email_enc"?: string,"p_foreign_doc_enc"?: string,"p_foreign_doc_hmac"?: string,"p_foreign_doc_masked"?: string,"p_foreign_doc_type"?: string,"p_full_name": string,"p_id": string,"p_is_incomplete"?: boolean,"p_kek_version"?: number,"p_local_dek_wrapped"?: string,"p_local_email_enc"?: string,"p_local_envelope_id"?: string,"p_local_kek_version"?: number,"p_local_phone_enc"?: string,"p_phone_enc"?: string,"p_social_name"?: string }; Returns: {
              "person_id": string,"reused": boolean
            }[]
                           },
"patient_search":
{ Args: { "p_doc_hmac"?: string,"p_filter"?: string,"p_name"?: string }; Returns: {
              "birth_date": string,"count_archived": number,"count_other_clinic": number,"count_today": number,"cpf_masked": string,"dek_wrapped": string,"display_is_social": boolean,"display_name": string,"documents": Json,"email_enc": string,"envelope_id": string,"foreign_doc_masked": string,"is_incomplete": boolean,"is_verified": boolean,"kek_version": number,"last_appointment": Json,"linked_at": string,"network_access": string,"person_id": string,"phone_enc": string,"total_active": number,"verified_until": string
            }[]
                           },
"patient_set_archived":
{ Args: { "p_archived": boolean,"p_person_id": string }; Returns: Json
                           },
"patient_update":
{ Args: { "p_birth_date"?: string,"p_email_enc"?: string,"p_full_name"?: string,"p_local_dek_wrapped"?: string,"p_local_envelope_id"?: string,"p_local_kek_version"?: number,"p_person_id": string,"p_phone_enc"?: string,"p_reason": string,"p_social_name"?: string }; Returns: undefined
                           },
"professional_delete":
{ Args: { "p_link_id": string }; Returns: undefined
                           },
"professional_get":
{ Args: { "p_link_id": string }; Returns: {
              "council": string,"council_number": string,"council_uf": string,"cpf_masked": string,"dek_wrapped": string,"display_name": string,"email_enc": string,"invite_dek_wrapped": string,"invite_email_enc": string,"invite_envelope_id": string,"invite_kek_version": number,"invited_at": string,"kek_version": number,"link_id": string,"phone_enc": string,"professional_id": string,"propass_completed_at": string,"status": string
            }[]
                           },
"professional_invite":
{ Args: { "p_dek_wrapped": string,"p_envelope_id": string,"p_id": string,"p_invite_email_enc": string,"p_invite_email_hmac": string,"p_kek_version": number,"p_propass_secret_hash": string }; Returns: string
                           },
"professional_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "council": string,"council_number": string,"council_status": string,"council_uf": string,"dek_wrapped": string,"display_name": string,"email_enc": string,"invite_dek_wrapped": string,"invite_email_enc": string,"invite_envelope_id": string,"invite_kek_version": number,"invited_at": string,"kek_version": number,"link_id": string,"phone_enc": string,"professional_id": string,"status": string
            }[]
                           },
"professional_resend_invite":
{ Args: { "p_invite_email_enc"?: string,"p_invite_email_hmac"?: string,"p_link_id": string,"p_propass_secret_hash": string }; Returns: undefined
                           },
"propass_authorization_context":
{ Args: { "p_secret_hash": string }; Returns: {
              "body": string,"body_normalization": string,"body_sha256": string,"cnpj": string,"legal_name": string,"template_id": string,"trade_name": string,"version": number
            }[]
                           },
"propass_identity_check":
{ Args: { "p_council": string,"p_council_number": string,"p_council_uf": string,"p_cpf_hmac": string,"p_secret_hash": string }; Returns: Json
                           },
"propass_resolve":
{ Args: { "p_secret_hash": string }; Returns: {
              "expires_at": string,"invite_dek_wrapped": string,"invite_email_enc": string,"invite_envelope_id": string,"invite_kek_version": number,"invited_at": string,"link_id": string,"step": string,"tenant_id": string,"tenant_name": string,"tenant_timezone": string
            }[]
                           },
"propass_submit":
{ Args: { "p_atta_code": string,"p_council": string,"p_council_number": string,"p_council_status": string,"p_council_uf": string,"p_cpf_enc": string,"p_cpf_hmac": string,"p_cpf_masked": string,"p_dek_wrapped": string,"p_display_name": string,"p_document_id": string,"p_download_secret_hash"?: string,"p_email_enc": string,"p_email_hmac": string,"p_kek_version": number,"p_payload_canonical": string,"p_phone_enc": string,"p_pin_mac": string,"p_pin_mac_version": number,"p_privacy_notice_version"?: string,"p_professional_id": string,"p_seal": string,"p_seal_kid": string,"p_secret_hash": string,"p_stroke": Json }; Returns: string
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_key_hash": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"report_divergence":
{ Args: { "p_person_id": string,"p_reason": string }; Returns: string
                           },
"report_divergence_by_cpf":
{ Args: { "p_cpf_hmac": string,"p_reason": string }; Returns: Json
                           },
"team_accept_invite":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"team_invite":
{ Args: { "p_app_role": string,"p_permissions"?: Json,"p_user_id": string }; Returns: string
                           },
"team_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "app_role": string,"display_name": string,"email": string,"is_owner": boolean,"last_sign_in_at": string,"membership_id": string,"permissions": Json,"status": string,"user_id": string
            }[]
                           },
"team_reactivate":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"team_remove":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"team_set_permissions":
{ Args: { "p_membership_id": string,"p_permissions": Json }; Returns: undefined
                           },
"team_suspend":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"template_deactivate":
{ Args: { "p_template_id": string }; Returns: undefined
                           },
"template_publish":
{ Args: { "p_template_id": string }; Returns: {
              "body_sha256": string,"template_version_id": string,"version": number
            }[]
                           },
"template_set_services":
{ Args: { "p_service_ids": (string)[],"p_template_id": string }; Returns: number
                           },
"webhook_first_time":
{ Args: { "p_event_id": string,"p_provider": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"atta_in": {
          Tables: {
            "alt_flow_phone": {
                  Row: {
                    "created_at": string,"created_by": string | null,"dek_wrapped": string,"id": string,"kek_version": number,"label": string,"phone_enc": string,"phone_masked": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"dek_wrapped": string,"id"?: string,"kek_version": number,"label": string,"phone_enc": string,"phone_masked": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"dek_wrapped"?: string,"id"?: string,"kek_version"?: number,"label"?: string,"phone_enc"?: string,"phone_masked"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"appointment": {
                  Row: {
                    "absent_at": string | null,"absent_mode": string | null,"appointment_type": string,"cancel_reason": string | null,"cancelled_at": string | null,"checkin_started_at": string | null,"concluded_at": string | null,"concluded_by_reception": boolean,"confirmed_at": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"in_service_at": string | null,"modality": string,"person_id": string | null,"professional_link_id": string,"provisional_patient_id": string | null,"ready_at": string | null,"reopened_at": string | null,"return_of_appointment_id": string | null,"starts_at": string,"status": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_at"?: string | null,"absent_mode"?: string | null,"appointment_type": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"checkin_started_at"?: string | null,"concluded_at"?: string | null,"concluded_by_reception"?: boolean,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"in_service_at"?: string | null,"modality"?: string,"person_id"?: string | null,"professional_link_id": string,"provisional_patient_id"?: string | null,"ready_at"?: string | null,"reopened_at"?: string | null,"return_of_appointment_id"?: string | null,"starts_at": string,"status"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "absent_at"?: string | null,"absent_mode"?: string | null,"appointment_type"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"checkin_started_at"?: string | null,"concluded_at"?: string | null,"concluded_by_reception"?: boolean,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"in_service_at"?: string | null,"modality"?: string,"person_id"?: string | null,"professional_link_id"?: string,"provisional_patient_id"?: string | null,"ready_at"?: string | null,"reopened_at"?: string | null,"return_of_appointment_id"?: string | null,"starts_at"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_return_fk"
      columns: ["tenant_id","person_id","return_of_appointment_id"]
isOneToOne: false
      referencedRelation: "appointment"
      referencedColumns: ["tenant_id","person_id","id"]
    }
                  ]
                },"appointment_clinic_service": {
                  Row: {
                    "appointment_id": string,"clinic_service_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id": string,"clinic_service_id": string,"tenant_id": string
                  }
                  Update: {
                    "appointment_id"?: string,"clinic_service_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_clinic_service_appointment_fk"
      columns: ["tenant_id","appointment_id"]
isOneToOne: false
      referencedRelation: "appointment"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "appointment_clinic_service_service_fk"
      columns: ["tenant_id","clinic_service_id"]
isOneToOne: false
      referencedRelation: "clinic_service"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"appointment_transition": {
                  Row: {
                    "actor": string | null,"appointment_id": string,"at": string,"from_status": string,"id": string,"justification": string | null,"reason": string | null,"tenant_id": string,"to_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string | null,"appointment_id": string,"at"?: string,"from_status": string,"id"?: string,"justification"?: string | null,"reason"?: string | null,"tenant_id": string,"to_status": string
                  }
                  Update: {
                    "actor"?: string | null,"appointment_id"?: string,"at"?: string,"from_status"?: string,"id"?: string,"justification"?: string | null,"reason"?: string | null,"tenant_id"?: string,"to_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_transition_appointment_fk"
      columns: ["tenant_id","appointment_id"]
isOneToOne: false
      referencedRelation: "appointment"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"business_hours": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"starts_at": string,"tenant_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"starts_at": string,"tenant_id": string,"weekday": number
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"starts_at"?: string,"tenant_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"clinic_service": {
                  Row: {
                    "active": boolean,"category": string | null,"created_at": string,"deleted_at": string | null,"duration_min": number,"id": string,"name": string,"requires_rt": boolean,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"duration_min": number,"id"?: string,"name": string,"requires_rt"?: boolean,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"duration_min"?: number,"id"?: string,"name"?: string,"requires_rt"?: boolean,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_channel": {
                  Row: {
                    "active": boolean,"address_enc": string | null,"address_masked": string | null,"channel": string,"dek_wrapped": string | null,"envelope_id": string | null,"kek_version": number | null,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address_enc"?: string | null,"address_masked"?: string | null,"channel": string,"dek_wrapped"?: string | null,"envelope_id"?: string | null,"kek_version"?: number | null,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"address_enc"?: string | null,"address_masked"?: string | null,"channel"?: string,"dek_wrapped"?: string | null,"envelope_id"?: string | null,"kek_version"?: number | null,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notification_filter": {
                  Row: {
                    "frequencia_resumo": string,"pausa_noturna": boolean,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "frequencia_resumo"?: string,"pausa_noturna"?: boolean,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "frequencia_resumo"?: string,"pausa_noturna"?: boolean,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notification_preference": {
                  Row: {
                    "channel": string,"enabled": boolean,"event_key": string,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"enabled": boolean,"event_key": string,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "channel"?: string,"enabled"?: boolean,"event_key"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"professional_break": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"professional_link_id": string,"starts_at": string,"tenant_id": string,"updated_at": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"professional_link_id": string,"starts_at": string,"tenant_id": string,"updated_at"?: string,"weekdays": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"professional_link_id"?: string,"starts_at"?: string,"tenant_id"?: string,"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    
                  ]
                },"professional_schedule": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"professional_link_id": string,"starts_at": string,"tenant_id": string,"updated_at": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"professional_link_id": string,"starts_at": string,"tenant_id": string,"updated_at"?: string,"weekdays": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"professional_link_id"?: string,"starts_at"?: string,"tenant_id"?: string,"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    
                  ]
                },"professional_service": {
                  Row: {
                    "clinic_service_id": string,"created_at": string,"professional_link_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_service_id": string,"created_at"?: string,"professional_link_id": string,"tenant_id": string
                  }
                  Update: {
                    "clinic_service_id"?: string,"created_at"?: string,"professional_link_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professional_service_service_fk"
      columns: ["tenant_id","clinic_service_id"]
isOneToOne: false
      referencedRelation: "clinic_service"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"service_document_template": {
                  Row: {
                    "clinic_service_id": string,"created_at": string,"created_by": string | null,"id": string,"template_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_service_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"template_id": string,"tenant_id": string
                  }
                  Update: {
                    "clinic_service_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"template_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_document_template_service_fk"
      columns: ["tenant_id","clinic_service_id"]
isOneToOne: false
      referencedRelation: "clinic_service"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"setting": {
                  Row: {
                    "appointment_type": string | null,"clinic_service_id": string | null,"created_at": string,"created_by": string | null,"id": string,"key": string,"level": string,"tenant_id": string,"updated_at": string,"updated_by": string | null,"value_bool": boolean | null,"value_int": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_type"?: string | null,"clinic_service_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key": string,"level": string,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null,"value_bool"?: boolean | null,"value_int"?: number | null
                  }
                  Update: {
                    "appointment_type"?: string | null,"clinic_service_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key"?: string,"level"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"value_bool"?: boolean | null,"value_int"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "setting_clinic_service_fk"
      columns: ["tenant_id","clinic_service_id"]
isOneToOne: false
      referencedRelation: "clinic_service"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "setting_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "setting_definition"
      referencedColumns: ["key"]
    }
                  ]
                },"setting_definition": {
                  Row: {
                    "allowed_ints": (number)[] | null,"created_at": string,"default_bool": boolean | null,"default_int": number | null,"key": string,"max_int": number | null,"min_int": number | null,"value_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_ints"?: (number)[] | null,"created_at"?: string,"default_bool"?: boolean | null,"default_int"?: number | null,"key": string,"max_int"?: number | null,"min_int"?: number | null,"value_type": string
                  }
                  Update: {
                    "allowed_ints"?: (number)[] | null,"created_at"?: string,"default_bool"?: boolean | null,"default_int"?: number | null,"key"?: string,"max_int"?: number | null,"min_int"?: number | null,"value_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"special_date": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"kind": string,"name": string,"professional_link_id": string | null,"starts_on": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"kind": string,"name": string,"professional_link_id"?: string | null,"starts_on": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"kind"?: string,"name"?: string,"professional_link_id"?: string | null,"starts_on"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_transition":
{ Args: { "p_absent_mode"?: string,"p_by_reception"?: boolean,"p_id": string,"p_justification"?: string,"p_reason"?: string,"p_tenant": string,"p_to": string }; Returns: undefined
                           },
"check_link_rules":
{ Args: { "p_appointment_type": string,"p_clinic_service_id": string }; Returns: undefined
                           },
"confirm_appointment":
{ Args: { "p_id": string }; Returns: undefined
                           },
"effective_settings":
{ Args: { "p_appointment_type"?: string,"p_clinic_service_id"?: string }; Returns: {
              "key": string,"level": string,"value": Json
            }[]
                           },
"link_rules_effective":
{ Args: { "p_tenant": string }; Returns: {
              "appointment_type": string,"clinic_service_id": string,"key": string,"level": string,"v": number
            }[]
                           },
"notification_events":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"key": string,"ord": number
            }[]
                           },
"set_setting":
{ Args: { "p_appointment_type"?: string,"p_clinic_service_id"?: string,"p_key": string,"p_value": Json }; Returns: {
              "key": string,"level": string,"value": Json
            }[]
                           },
"settings_screen":
{ Args: { "p_appointment_type"?: string,"p_clinic_service_id"?: string }; Returns: {
              "allowed_ints": (number)[],"default_bool": boolean,"default_int": number,"key": string,"max_int": number,"min_int": number,"source": string,"value_bool": boolean,"value_int": number,"value_type": string
            }[]
                           },
"transition_appointment":
{ Args: { "p_id": string,"p_justification"?: string,"p_reason"?: string,"p_to": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"documents": {
          Tables: {
            "document": {
                  Row: {
                    "appointment_id": string | null,"auto_excluded_at": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string | null,"folder_section": string | null,"id": string,"person_id": string | null,"professional_link_id": string | null,"replaced_by_document_id": string | null,"status": string,"template_version_id": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"auto_excluded_at"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"folder_section"?: string | null,"id"?: string,"person_id"?: string | null,"professional_link_id"?: string | null,"replaced_by_document_id"?: string | null,"status"?: string,"template_version_id"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "appointment_id"?: string | null,"auto_excluded_at"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"folder_section"?: string | null,"id"?: string,"person_id"?: string | null,"professional_link_id"?: string | null,"replaced_by_document_id"?: string | null,"status"?: string,"template_version_id"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_replaced_by_fk"
      columns: ["tenant_id","replaced_by_document_id"]
isOneToOne: false
      referencedRelation: "document"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "document_template_version_fk"
      columns: ["tenant_id","template_version_id"]
isOneToOne: false
      referencedRelation: "template_version"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"evidence": {
                  Row: {
                    "atta_code": string,"atta_sign_version": string,"code_nonce": number,"created_at": string,"document_id": string,"evidence_sha256": string,"id": string,"payload_canonical": string,"signed_at": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atta_code": string,"atta_sign_version": string,"code_nonce"?: number,"created_at"?: string,"document_id": string,"evidence_sha256": string,"id"?: string,"payload_canonical": string,"signed_at": string,"tenant_id": string
                  }
                  Update: {
                    "atta_code"?: string,"atta_sign_version"?: string,"code_nonce"?: number,"created_at"?: string,"document_id"?: string,"evidence_sha256"?: string,"id"?: string,"payload_canonical"?: string,"signed_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_document_fk"
      columns: ["tenant_id","document_id"]
isOneToOne: false
      referencedRelation: "document"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"seal": {
                  Row: {
                    "created_at": string,"evidence_id": string,"id": string,"kid": string,"signature": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence_id": string,"id"?: string,"kid": string,"signature": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence_id"?: string,"id"?: string,"kid"?: string,"signature"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seal_evidence_fk"
      columns: ["tenant_id","evidence_id"]
isOneToOne: false
      referencedRelation: "evidence"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "seal_kid_fkey"
      columns: ["kid"]
isOneToOne: false
      referencedRelation: "seal_key"
      referencedColumns: ["kid"]
    }
                  ]
                },"seal_key": {
                  Row: {
                    "alg": string,"created_at": string,"id": string,"kid": string,"public_key_spki": string,"valid_from": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alg"?: string,"created_at"?: string,"id"?: string,"kid": string,"public_key_spki": string,"valid_from": string,"valid_until"?: string | null
                  }
                  Update: {
                    "alg"?: string,"created_at"?: string,"id"?: string,"kid"?: string,"public_key_spki"?: string,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"seal_timestamp": {
                  Row: {
                    "created_at": string,"id": string,"issuer": string,"kind": string,"seal_id": string,"tenant_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"issuer": string,"kind": string,"seal_id": string,"tenant_id": string,"token": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"issuer"?: string,"kind"?: string,"seal_id"?: string,"tenant_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seal_timestamp_seal_fk"
      columns: ["tenant_id","seal_id"]
isOneToOne: false
      referencedRelation: "seal"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"stored_object": {
                  Row: {
                    "created_at": string,"dek_wrapped": string,"document_id": string,"id": string,"kek_version": number,"party_ref": string | null,"role": string,"sha256_plain": string,"size_bytes": number,"storage_path": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dek_wrapped": string,"document_id": string,"id"?: string,"kek_version": number,"party_ref"?: string | null,"role": string,"sha256_plain": string,"size_bytes": number,"storage_path": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"dek_wrapped"?: string,"document_id"?: string,"id"?: string,"kek_version"?: number,"party_ref"?: string | null,"role"?: string,"sha256_plain"?: string,"size_bytes"?: number,"storage_path"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stored_object_document_fk"
      columns: ["tenant_id","document_id"]
isOneToOne: false
      referencedRelation: "document"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"template": {
                  Row: {
                    "created_at": string,"created_by": string | null,"current_version": number | null,"draft_body": string | null,"frequency": string | null,"id": string,"kind": string,"required": boolean | null,"status": string,"tenant_id": string,"title": string,"updated_at": string,"validity_months": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"current_version"?: number | null,"draft_body"?: string | null,"frequency"?: string | null,"id"?: string,"kind": string,"required"?: boolean | null,"status"?: string,"tenant_id"?: string,"title": string,"updated_at"?: string,"validity_months"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"current_version"?: number | null,"draft_body"?: string | null,"frequency"?: string | null,"id"?: string,"kind"?: string,"required"?: boolean | null,"status"?: string,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"validity_months"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"template_version": {
                  Row: {
                    "body": string,"body_normalization": string,"body_sha256": string,"created_at": string,"frequency": string,"id": string,"kind": string,"published_at": string,"published_by": string,"required": boolean,"template_id": string,"tenant_id": string,"title": string,"validity_months": number | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"body_normalization"?: string,"body_sha256": string,"created_at"?: string,"frequency": string,"id"?: string,"kind": string,"published_at"?: string,"published_by": string,"required": boolean,"template_id": string,"tenant_id": string,"title": string,"validity_months"?: number | null,"version": number
                  }
                  Update: {
                    "body"?: string,"body_normalization"?: string,"body_sha256"?: string,"created_at"?: string,"frequency"?: string,"id"?: string,"kind"?: string,"published_at"?: string,"published_by"?: string,"required"?: boolean,"template_id"?: string,"tenant_id"?: string,"title"?: string,"validity_months"?: number | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "template_version_template_fk"
      columns: ["tenant_id","template_id"]
isOneToOne: false
      referencedRelation: "template"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"platform": {
          Tables: {
            "access_grant": {
                  Row: {
                    "appointment_id": string | null,"created_at": string,"expires_at": string,"id": string,"last_used_at": string | null,"person_id": string | null,"pin_failures_streak": number,"pin_failures_total": number,"pin_locked_until": string | null,"professional_link_id": string | null,"propass_failures": number,"purpose": string,"revoked_at": string | null,"secret_hash": string,"sent_at": string | null,"session_started_at": string | null,"tenant_id": string,"use_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"last_used_at"?: string | null,"person_id"?: string | null,"pin_failures_streak"?: number,"pin_failures_total"?: number,"pin_locked_until"?: string | null,"professional_link_id"?: string | null,"propass_failures"?: number,"purpose": string,"revoked_at"?: string | null,"secret_hash": string,"sent_at"?: string | null,"session_started_at"?: string | null,"tenant_id": string,"use_count"?: number
                  }
                  Update: {
                    "appointment_id"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"last_used_at"?: string | null,"person_id"?: string | null,"pin_failures_streak"?: number,"pin_failures_total"?: number,"pin_locked_until"?: string | null,"professional_link_id"?: string | null,"propass_failures"?: number,"purpose"?: string,"revoked_at"?: string | null,"secret_hash"?: string,"sent_at"?: string | null,"session_started_at"?: string | null,"tenant_id"?: string,"use_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_grant_professional_link_fk"
      columns: ["tenant_id","professional_link_id"]
isOneToOne: false
      referencedRelation: "professional_tenant_link"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "access_grant_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "app_role": string,"created_at": string,"deleted_at": string | null,"id": string,"is_owner": boolean,"status": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_role": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_owner"?: boolean,"status"?: string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "app_role"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_owner"?: boolean,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_permission": {
                  Row: {
                    "action": string,"created_at": string,"granted_at": string,"granted_by": string | null,"id": string,"membership_id": string,"module": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"membership_id": string,"module": string,"tenant_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"membership_id"?: string,"module"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_permission_membership_id_tenant_id_fkey"
      columns: ["membership_id","tenant_id"]
isOneToOne: false
      referencedRelation: "membership"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "membership_permission_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"professional": {
                  Row: {
                    "council": string,"council_number": string,"council_status": string | null,"council_uf": string,"council_verified_at": string | null,"cpf_enc": string,"cpf_hmac": string,"cpf_masked": string,"created_at": string,"dek_wrapped": string,"deleted_at": string | null,"display_name": string,"email_enc": string,"email_hmac": string | null,"id": string,"kek_version": number,"phone_enc": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "council": string,"council_number": string,"council_status"?: string | null,"council_uf": string,"council_verified_at"?: string | null,"cpf_enc": string,"cpf_hmac": string,"cpf_masked": string,"created_at"?: string,"dek_wrapped": string,"deleted_at"?: string | null,"display_name": string,"email_enc": string,"email_hmac"?: string | null,"id"?: string,"kek_version": number,"phone_enc"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "council"?: string,"council_number"?: string,"council_status"?: string | null,"council_uf"?: string,"council_verified_at"?: string | null,"cpf_enc"?: string,"cpf_hmac"?: string,"cpf_masked"?: string,"created_at"?: string,"dek_wrapped"?: string,"deleted_at"?: string | null,"display_name"?: string,"email_enc"?: string,"email_hmac"?: string | null,"id"?: string,"kek_version"?: number,"phone_enc"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"professional_pin": {
                  Row: {
                    "pin_mac": string,"pin_mac_version": number,"professional_id": string,"set_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "pin_mac": string,"pin_mac_version": number,"professional_id": string,"set_at"?: string
                  }
                  Update: {
                    "pin_mac"?: string,"pin_mac_version"?: number,"professional_id"?: string,"set_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professional_pin_professional_id_fkey"
      columns: ["professional_id"]
isOneToOne: true
      referencedRelation: "professional"
      referencedColumns: ["id"]
    }
                  ]
                },"professional_tenant_link": {
                  Row: {
                    "dek_wrapped": string,"deleted_at": string | null,"envelope_id": string,"id": string,"invite_email_enc": string,"invite_email_hmac": string,"invited_at": string,"kek_version": number,"privacy_notice_ack_at": string | null,"privacy_notice_version": string | null,"professional_id": string | null,"propass_completed_at": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dek_wrapped": string,"deleted_at"?: string | null,"envelope_id": string,"id"?: string,"invite_email_enc": string,"invite_email_hmac": string,"invited_at"?: string,"kek_version": number,"privacy_notice_ack_at"?: string | null,"privacy_notice_version"?: string | null,"professional_id"?: string | null,"propass_completed_at"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "dek_wrapped"?: string,"deleted_at"?: string | null,"envelope_id"?: string,"id"?: string,"invite_email_enc"?: string,"invite_email_hmac"?: string,"invited_at"?: string,"kek_version"?: number,"privacy_notice_ack_at"?: string | null,"privacy_notice_version"?: string | null,"professional_id"?: string | null,"propass_completed_at"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professional_tenant_link_professional_id_fkey"
      columns: ["professional_id"]
isOneToOne: false
      referencedRelation: "professional"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "professional_tenant_link_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant": {
                  Row: {
                    "address_cep": string | null,"address_city": string | null,"address_complement": string | null,"address_number": string | null,"address_street": string | null,"address_uf": string | null,"clinic_whatsapp": string | null,"cnpj": string | null,"commercial_email": string | null,"created_at": string,"deleted_at": string | null,"id": string,"kind": string,"legal_name": string | null,"main_specialty": string | null,"name": string,"parent_tenant_id": string | null,"phone": string | null,"profile_saved_at": string | null,"tax_registration": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_cep"?: string | null,"address_city"?: string | null,"address_complement"?: string | null,"address_number"?: string | null,"address_street"?: string | null,"address_uf"?: string | null,"clinic_whatsapp"?: string | null,"cnpj"?: string | null,"commercial_email"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: string,"legal_name"?: string | null,"main_specialty"?: string | null,"name": string,"parent_tenant_id"?: string | null,"phone"?: string | null,"profile_saved_at"?: string | null,"tax_registration"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address_cep"?: string | null,"address_city"?: string | null,"address_complement"?: string | null,"address_number"?: string | null,"address_street"?: string | null,"address_uf"?: string | null,"clinic_whatsapp"?: string | null,"cnpj"?: string | null,"commercial_email"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: string,"legal_name"?: string | null,"main_specialty"?: string | null,"name"?: string,"parent_tenant_id"?: string | null,"phone"?: string | null,"profile_saved_at"?: string | null,"tax_registration"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_parent_tenant_id_fkey"
      columns: ["parent_tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_responsible": {
                  Row: {
                    "council": string | null,"council_number": string | null,"council_uf": string | null,"cpf_enc": string | null,"cpf_hmac": string | null,"cpf_masked": string | null,"created_at": string,"dek_wrapped": string,"email_enc": string | null,"email_masked": string | null,"envelope_id": string,"full_name": string | null,"id": string,"kek_version": number,"phone_enc": string | null,"phone_masked": string | null,"role": string,"same_as_manager": boolean,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "council"?: string | null,"council_number"?: string | null,"council_uf"?: string | null,"cpf_enc"?: string | null,"cpf_hmac"?: string | null,"cpf_masked"?: string | null,"created_at"?: string,"dek_wrapped": string,"email_enc"?: string | null,"email_masked"?: string | null,"envelope_id": string,"full_name"?: string | null,"id"?: string,"kek_version": number,"phone_enc"?: string | null,"phone_masked"?: string | null,"role": string,"same_as_manager"?: boolean,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "council"?: string | null,"council_number"?: string | null,"council_uf"?: string | null,"cpf_enc"?: string | null,"cpf_hmac"?: string | null,"cpf_masked"?: string | null,"created_at"?: string,"dek_wrapped"?: string,"email_enc"?: string | null,"email_masked"?: string | null,"envelope_id"?: string,"full_name"?: string | null,"id"?: string,"kek_version"?: number,"phone_enc"?: string | null,"phone_masked"?: string | null,"role"?: string,"same_as_manager"?: boolean,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_responsible_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "api">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "api": {
          Enums: {
            
          }
        },"atta_in": {
          Enums: {
            
          }
        },"documents": {
          Enums: {
            
          }
        },"platform": {
          Enums: {
            
          }
        }
} as const
