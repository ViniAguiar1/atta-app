
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
            "grant_issue":
{ Args: { "p_appointment_id": string,"p_person_id"?: string,"p_professional_id"?: string,"p_purpose": string,"p_secret_hash": string,"p_tenant_id": string }; Returns: string
                           },
"grant_mark_sent":
{ Args: { "p_grant_id": string }; Returns: undefined
                           },
"grant_resolve":
{ Args: { "p_purpose": string,"p_secret_hash": string }; Returns: {
              "appointment_id": string,"expires_at": string,"grant_id": string,"person_id": string,"professional_id": string,"tenant_id": string
            }[]
                           },
"grant_revoke":
{ Args: { "p_secret_hash": string }; Returns: undefined
                           },
"patient_get":
{ Args: { "p_person_id": string }; Returns: {
              "birth_date": string,"cpf_masked": string,"dek_wrapped": string,"email_enc": string,"envelope_id": string,"foreign_doc_masked": string,"foreign_doc_type": string,"full_name": string,"is_incomplete": boolean,"is_verified": boolean,"kek_version": number,"linked_at": string,"network_access": string,"origin": string,"person_id": string,"phone_enc": string,"social_name": string,"verified_until": string
            }[]
                           },
"patient_list":
{ Args: { "p_after_id"?: string,"p_after_name"?: string,"p_limit"?: number }; Returns: {
              "cpf_masked": string,"dek_wrapped": string,"display_name": string,"email_enc": string,"envelope_id": string,"foreign_doc_masked": string,"kek_version": number,"linked_at": string,"network_access": string,"person_id": string,"phone_enc": string
            }[]
                           },
"patient_register":
{ Args: { "p_birth_date"?: string,"p_cpf_enc"?: string,"p_cpf_hmac"?: string,"p_cpf_masked"?: string,"p_dek_wrapped"?: string,"p_email_enc"?: string,"p_foreign_doc_enc"?: string,"p_foreign_doc_hmac"?: string,"p_foreign_doc_masked"?: string,"p_foreign_doc_type"?: string,"p_full_name": string,"p_id": string,"p_is_incomplete"?: boolean,"p_kek_version"?: number,"p_local_dek_wrapped"?: string,"p_local_email_enc"?: string,"p_local_envelope_id"?: string,"p_local_kek_version"?: number,"p_local_phone_enc"?: string,"p_phone_enc"?: string,"p_social_name"?: string }; Returns: {
              "person_id": string,"reused": boolean
            }[]
                           },
"patient_search":
{ Args: { "p_doc_hmac"?: string,"p_name"?: string }; Returns: {
              "cpf_masked": string,"display_name": string,"foreign_doc_masked": string,"is_verified": boolean,"linked_at": string,"person_id": string
            }[]
                           },
"patient_update":
{ Args: { "p_birth_date"?: string,"p_email_enc"?: string,"p_full_name"?: string,"p_local_dek_wrapped"?: string,"p_local_envelope_id"?: string,"p_local_kek_version"?: number,"p_person_id": string,"p_phone_enc"?: string,"p_reason": string,"p_social_name"?: string }; Returns: undefined
                           },
"report_divergence":
{ Args: { "p_person_id": string,"p_reason": string }; Returns: string
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
            "setting": {
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "effective_settings":
{ Args: { "p_appointment_type"?: string,"p_clinic_service_id"?: string }; Returns: {
              "key": string,"level": string,"value": Json
            }[]
                           },
"set_setting":
{ Args: { "p_appointment_type"?: string,"p_clinic_service_id"?: string,"p_key": string,"p_value": Json }; Returns: {
              "key": string,"level": string,"value": Json
            }[]
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
            [_ in never]: never
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
                    "appointment_id": string,"created_at": string,"expires_at": string,"id": string,"last_used_at": string | null,"person_id": string | null,"professional_id": string | null,"purpose": string,"revoked_at": string | null,"secret_hash": string,"sent_at": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"last_used_at"?: string | null,"person_id"?: string | null,"professional_id"?: string | null,"purpose": string,"revoked_at"?: string | null,"secret_hash": string,"sent_at"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "appointment_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"last_used_at"?: string | null,"person_id"?: string | null,"professional_id"?: string | null,"purpose"?: string,"revoked_at"?: string | null,"secret_hash"?: string,"sent_at"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_grant_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenant"
      referencedColumns: ["id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "app_role": string,"created_at": string,"deleted_at": string | null,"id": string,"status": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_role": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"status"?: string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "app_role"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
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
                },"tenant": {
                  Row: {
                    "cnpj": string | null,"created_at": string,"deleted_at": string | null,"id": string,"kind": string,"name": string,"parent_tenant_id": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cnpj"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: string,"name": string,"parent_tenant_id"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "cnpj"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"parent_tenant_id"?: string | null,"timezone"?: string,"updated_at"?: string
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
