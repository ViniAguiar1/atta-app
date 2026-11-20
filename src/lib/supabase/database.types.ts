
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
            [_ in never]: never
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
            "membership": {
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
