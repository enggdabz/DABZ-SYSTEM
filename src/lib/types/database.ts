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
      advance_deductions: {
        Row: {
          amount_centavos: number
          created_at: string
          created_by: string | null
          id: string
          payroll_week_id: string | null
          staff_id: string
        }
        Insert: {
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_week_id?: string | null
          staff_id: string
        }
        Update: {
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_week_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_deductions_payroll_week_id_fkey"
            columns: ["payroll_week_id"]
            isOneToOne: false
            referencedRelation: "payroll_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_deductions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      app_health: {
        Row: {
          checked_at: string
          id: number
          label: string
        }
        Insert: {
          checked_at?: string
          id?: number
          label: string
        }
        Update: {
          checked_at?: string
          id?: number
          label?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          apparel_down_payment_percent: number | null
          auto_logout_minutes: number
          default_warranty_days: number
          facebook_page_url: string | null
          id: number
          map_url: string | null
          messenger_username: string | null
          public_opening_hours: string | null
          public_page_enabled: boolean
          receipt_paper: string
          shop_address: string | null
          shop_email: string | null
          shop_phone: string | null
          staff_discount_limit_centavos: number
          staff_discount_limit_percent: number
          staff_expense_approval_limit_centavos: number
          unclaimed_unit_days: number
          updated_at: string
          updated_by: string | null
          week_starts_on: string
          work_day_end: string
          work_day_start: string
          working_days_per_month: number
        }
        Insert: {
          apparel_down_payment_percent?: number | null
          auto_logout_minutes?: number
          default_warranty_days?: number
          facebook_page_url?: string | null
          id?: number
          map_url?: string | null
          messenger_username?: string | null
          public_opening_hours?: string | null
          public_page_enabled?: boolean
          receipt_paper?: string
          shop_address?: string | null
          shop_email?: string | null
          shop_phone?: string | null
          staff_discount_limit_centavos?: number
          staff_discount_limit_percent?: number
          staff_expense_approval_limit_centavos?: number
          unclaimed_unit_days?: number
          updated_at?: string
          updated_by?: string | null
          week_starts_on?: string
          work_day_end?: string
          work_day_start?: string
          working_days_per_month?: number
        }
        Update: {
          apparel_down_payment_percent?: number | null
          auto_logout_minutes?: number
          default_warranty_days?: number
          facebook_page_url?: string | null
          id?: number
          map_url?: string | null
          messenger_username?: string | null
          public_opening_hours?: string | null
          public_page_enabled?: boolean
          receipt_paper?: string
          shop_address?: string | null
          shop_email?: string | null
          shop_phone?: string | null
          staff_discount_limit_centavos?: number
          staff_discount_limit_percent?: number
          staff_expense_approval_limit_centavos?: number
          unclaimed_unit_days?: number
          updated_at?: string
          updated_by?: string | null
          week_starts_on?: string
          work_day_end?: string
          work_day_start?: string
          working_days_per_month?: number
        }
        Relationships: []
      }
      apparel_options: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          extra_centavos: number | null
          id: string
          kind: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          extra_centavos?: number | null
          id?: string
          kind: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          extra_centavos?: number | null
          id?: string
          kind?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      apparel_order_lines: {
        Row: {
          apparel_product_id: string | null
          collar: string | null
          created_at: string
          created_by: string | null
          fabric: string | null
          id: string
          income_category: string
          name: string
          order_id: string
          quantity: number
          unit_price_centavos: number
        }
        Insert: {
          apparel_product_id?: string | null
          collar?: string | null
          created_at?: string
          created_by?: string | null
          fabric?: string | null
          id?: string
          income_category?: string
          name: string
          order_id: string
          quantity?: number
          unit_price_centavos?: number
        }
        Update: {
          apparel_product_id?: string | null
          collar?: string | null
          created_at?: string
          created_by?: string | null
          fabric?: string | null
          id?: string
          income_category?: string
          name?: string
          order_id?: string
          quantity?: number
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "apparel_order_lines_apparel_product_id_fkey"
            columns: ["apparel_product_id"]
            isOneToOne: false
            referencedRelation: "apparel_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apparel_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "apparel_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      apparel_order_names: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          line_id: string
          player_name: string | null
          player_number: string | null
          size: string
          size_extra_centavos: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          line_id: string
          player_name?: string | null
          player_number?: string | null
          size: string
          size_extra_centavos?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          line_id?: string
          player_name?: string | null
          player_number?: string | null
          size?: string
          size_extra_centavos?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "apparel_order_names_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "apparel_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      apparel_orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          layout_note: string | null
          note: string | null
          order_number: string
          ordered_on: string
          promised_on: string | null
          released_at: string | null
          status: string
          team_name: string | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          layout_note?: string | null
          note?: string | null
          order_number: string
          ordered_on?: string
          promised_on?: string | null
          released_at?: string | null
          status?: string
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          layout_note?: string | null
          note?: string | null
          order_number?: string
          ordered_on?: string
          promised_on?: string | null
          released_at?: string | null
          status?: string
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apparel_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      apparel_payments: {
        Row: {
          amount_centavos: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          order_id: string
          paid_on: string
          reference_number: string | null
          source: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id: string
          paid_on?: string
          reference_number?: string | null
          source: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id?: string
          paid_on?: string
          reference_number?: string | null
          source?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apparel_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "apparel_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      apparel_products: {
        Row: {
          active: boolean
          base_price_centavos: number | null
          created_at: string
          created_by: string | null
          id: string
          income_category: string
          name: string
          note: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_centavos?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          name: string
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_centavos?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          name?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      apparel_size_prices: {
        Row: {
          extra_centavos: number | null
          size: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          extra_centavos?: number | null
          size: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          extra_centavos?: number | null
          size?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      attendance_entries: {
        Row: {
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          id: string
          note: string | null
          recorded_by: string | null
          staff_id: string
          time_in: string | null
          time_out: string | null
          work_date: string
        }
        Insert: {
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          staff_id: string
          time_in?: string | null
          time_out?: string | null
          work_date: string
        }
        Update: {
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          staff_id?: string
          time_in?: string | null
          time_out?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_username: string | null
          after: Json | null
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_username?: string | null
          after?: Json | null
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_username?: string | null
          after?: Json | null
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          summary?: string
        }
        Relationships: []
      }
      bill_payments: {
        Row: {
          amount_centavos: number
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          ledger_entry_id: string | null
          loan_payment_id: string | null
          note: string | null
          paid_on: string
          period_month: string
          source: string
        }
        Insert: {
          amount_centavos: number
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          loan_payment_id?: string | null
          note?: string | null
          paid_on: string
          period_month: string
          source: string
        }
        Update: {
          amount_centavos?: number
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          loan_payment_id?: string | null
          note?: string | null
          paid_on?: string
          period_month?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_loan_payment_id_fkey"
            columns: ["loan_payment_id"]
            isOneToOne: false
            referencedRelation: "loan_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          active: boolean
          amount_centavos: number
          created_at: string
          created_by: string | null
          due_day: number | null
          id: string
          loan_id: string | null
          name: string
          note: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          due_day?: number | null
          id?: string
          loan_id?: string | null
          name: string
          note?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          due_day?: number | null
          id?: string
          loan_id?: string | null
          name?: string
          note?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_advances: {
        Row: {
          advanced_on: string
          amount_centavos: number
          created_at: string
          created_by: string | null
          deduction_plan: string
          id: string
          ledger_entry_id: string | null
          reason: string | null
          source: string
          staff_id: string
        }
        Insert: {
          advanced_on: string
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          deduction_plan?: string
          id?: string
          ledger_entry_id?: string | null
          reason?: string | null
          source: string
          staff_id: string
        }
        Update: {
          advanced_on?: string
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          deduction_plan?: string
          id?: string
          ledger_entry_id?: string | null
          reason?: string | null
          source?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_advances_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_advances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          email: string | null
          facebook_name: string | null
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook_name?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook_name?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      day_closings: {
        Row: {
          bank_centavos: number
          closing_date: string
          counted_cash_centavos: number
          created_at: string
          created_by: string | null
          difference_centavos: number
          expected_cash_centavos: number
          gcash_centavos: number
          id: string
          maya_centavos: number
          note: string | null
          target_centavos: number
          target_reached: boolean
          total_sales_centavos: number
        }
        Insert: {
          bank_centavos?: number
          closing_date: string
          counted_cash_centavos: number
          created_at?: string
          created_by?: string | null
          difference_centavos: number
          expected_cash_centavos: number
          gcash_centavos?: number
          id?: string
          maya_centavos?: number
          note?: string | null
          target_centavos?: number
          target_reached?: boolean
          total_sales_centavos?: number
        }
        Update: {
          bank_centavos?: number
          closing_date?: string
          counted_cash_centavos?: number
          created_at?: string
          created_by?: string | null
          difference_centavos?: number
          expected_cash_centavos?: number
          gcash_centavos?: number
          id?: string
          maya_centavos?: number
          note?: string | null
          target_centavos?: number
          target_reached?: boolean
          total_sales_centavos?: number
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          contact: string
          created_at: string
          division: string | null
          handled_at: string | null
          handled_by: string | null
          heard_from: string | null
          id: string
          ip_address: string | null
          message: string
          name: string
          reply_note: string | null
          status: string
        }
        Insert: {
          contact: string
          created_at?: string
          division?: string | null
          handled_at?: string | null
          handled_by?: string | null
          heard_from?: string | null
          id?: string
          ip_address?: string | null
          message: string
          name: string
          reply_note?: string | null
          status?: string
        }
        Update: {
          contact?: string
          created_at?: string
          division?: string | null
          handled_at?: string | null
          handled_by?: string | null
          heard_from?: string | null
          id?: string
          ip_address?: string | null
          message?: string
          name?: string
          reply_note?: string | null
          status?: string
        }
        Relationships: []
      }
      expense_presets: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          default_amount_centavos: number | null
          id: string
          label: string
          sort_order: number
          supplier_id: string | null
          tag: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          default_amount_centavos?: number | null
          id?: string
          label: string
          sort_order?: number
          supplier_id?: string | null
          tag: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          default_amount_centavos?: number | null
          id?: string
          label?: string
          sort_order?: number
          supplier_id?: string | null
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_presets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_centavos: number
          category: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          ledger_entry_id: string | null
          note: string | null
          occurred_at: string
          source: string
          spent_on: string
          status: string
          supplier_id: string | null
          tag: string
        }
        Insert: {
          amount_centavos: number
          category: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          occurred_at?: string
          source: string
          spent_on: string
          status?: string
          supplier_id?: string | null
          tag: string
        }
        Update: {
          amount_centavos?: number
          category?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          occurred_at?: string
          source?: string
          spent_on?: string
          status?: string
          supplier_id?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_centavos: number
          category: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          note: string | null
          occurred_at: string
          source: string
          source_id: string | null
          source_table: string | null
          tag: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_centavos: number
          category: string
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          note?: string | null
          occurred_at?: string
          source: string
          source_id?: string | null
          source_table?: string | null
          tag: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_centavos?: number
          category?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          note?: string | null
          occurred_at?: string
          source?: string
          source_id?: string | null
          source_table?: string | null
          tag?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          amount_centavos: number
          created_at: string
          created_by: string | null
          id: string
          ledger_entry_id: string | null
          loan_id: string
          note: string | null
          origin: string
          paid_on: string
        }
        Insert: {
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          loan_id: string
          note?: string | null
          origin?: string
          paid_on: string
        }
        Update: {
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          loan_id?: string
          note?: string | null
          origin?: string
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          interest_percent_per_month: number | null
          lender: string
          monthly_payment_centavos: number | null
          note: string | null
          statement_balance_centavos: number
          statement_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          interest_percent_per_month?: number | null
          lender: string
          monthly_payment_centavos?: number | null
          note?: string | null
          statement_balance_centavos: number
          statement_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          interest_percent_per_month?: number | null
          lender?: string
          monthly_payment_centavos?: number | null
          note?: string | null
          statement_balance_centavos?: number
          statement_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_events: {
        Row: {
          id: number
          ip_address: string | null
          occurred_at: string
          outcome: string
          user_agent: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          id?: never
          ip_address?: string | null
          occurred_at?: string
          outcome: string
          user_agent?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          id?: never
          ip_address?: string | null
          occurred_at?: string
          outcome?: string
          user_agent?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      payroll_days: {
        Row: {
          day_type: string
          id: string
          overtime_hours: number
          overtime_pay_centavos: number
          payroll_week_id: string
          work_date: string
        }
        Insert: {
          day_type?: string
          id?: string
          overtime_hours?: number
          overtime_pay_centavos?: number
          payroll_week_id: string
          work_date: string
        }
        Update: {
          day_type?: string
          id?: string
          overtime_hours?: number
          overtime_pay_centavos?: number
          payroll_week_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_days_payroll_week_id_fkey"
            columns: ["payroll_week_id"]
            isOneToOne: false
            referencedRelation: "payroll_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_weeks: {
        Row: {
          advance_deduction_centavos: number
          bonus_centavos: number
          created_at: string
          created_by: string | null
          daily_rate_centavos: number
          gross_centavos: number
          id: string
          ledger_entry_id: string | null
          net_centavos: number
          paid_on: string | null
          paid_source: string | null
          staff_id: string
          status: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          advance_deduction_centavos?: number
          bonus_centavos?: number
          created_at?: string
          created_by?: string | null
          daily_rate_centavos: number
          gross_centavos?: number
          id?: string
          ledger_entry_id?: string | null
          net_centavos?: number
          paid_on?: string | null
          paid_source?: string | null
          staff_id: string
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          advance_deduction_centavos?: number
          bonus_centavos?: number
          created_at?: string
          created_by?: string | null
          daily_rate_centavos?: number
          gross_centavos?: number
          id?: string
          ledger_entry_id?: string | null
          net_centavos?: number
          paid_on?: string | null
          paid_source?: string | null
          staff_id?: string
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_weeks_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_weeks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_tiers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          min_quantity: number
          product_id: string
          unit_price_centavos: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          min_quantity: number
          product_id: string
          unit_price_centavos: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          min_quantity?: number
          product_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          division: string
          id: string
          income_category: string
          manual_price: boolean
          name: string
          price_centavos: number | null
          section: string
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          division?: string
          id?: string
          income_category?: string
          manual_price?: boolean
          name: string
          price_centavos?: number | null
          section?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          division?: string
          id?: string
          income_category?: string
          manual_price?: boolean
          name?: string
          price_centavos?: number | null
          section?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          must_change_password: boolean
          role: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          id: string
          must_change_password?: boolean
          role?: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean
          role?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      repair_lines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          income_category: string
          kind: string
          name: string
          quantity: number
          repair_service_id: string | null
          stock_item_id: string | null
          stock_movement_id: string | null
          ticket_id: string
          unit_price_centavos: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          kind: string
          name: string
          quantity?: number
          repair_service_id?: string | null
          stock_item_id?: string | null
          stock_movement_id?: string | null
          ticket_id: string
          unit_price_centavos?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          kind?: string
          name?: string
          quantity?: number
          repair_service_id?: string | null
          stock_item_id?: string | null
          stock_movement_id?: string | null
          ticket_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_lines_repair_service_id_fkey"
            columns: ["repair_service_id"]
            isOneToOne: false
            referencedRelation: "repair_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_lines_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_lines_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_lines_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "repair_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_payments: {
        Row: {
          amount_centavos: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          paid_on: string
          reference_number: string | null
          source: string
          ticket_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          paid_on?: string
          reference_number?: string | null
          source: string
          ticket_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          paid_on?: string
          reference_number?: string | null
          source?: string
          ticket_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_payments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "repair_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_services: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          income_category: string
          is_checking_fee: boolean
          name: string
          note: string | null
          price_centavos: number | null
          sort_order: number
          unit_kind: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          is_checking_fee?: boolean
          name: string
          note?: string | null
          price_centavos?: number | null
          sort_order?: number
          unit_kind?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          income_category?: string
          is_checking_fee?: boolean
          name?: string
          note?: string | null
          price_centavos?: number | null
          sort_order?: number
          unit_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      repair_tickets: {
        Row: {
          accessories: string | null
          brand: string | null
          condition_note: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          decline_reason: string | null
          diagnosis: string | null
          id: string
          model: string | null
          note: string | null
          problem: string
          promised_on: string | null
          ready_on: string | null
          received_on: string
          released_on: string | null
          serial_number: string | null
          status: string
          ticket_number: string
          unit_kind: string
          unlock_method: string
          updated_at: string
          warranty_days: number | null
        }
        Insert: {
          accessories?: string | null
          brand?: string | null
          condition_note?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          decline_reason?: string | null
          diagnosis?: string | null
          id?: string
          model?: string | null
          note?: string | null
          problem: string
          promised_on?: string | null
          ready_on?: string | null
          received_on?: string
          released_on?: string | null
          serial_number?: string | null
          status?: string
          ticket_number: string
          unit_kind: string
          unlock_method?: string
          updated_at?: string
          warranty_days?: number | null
        }
        Update: {
          accessories?: string | null
          brand?: string | null
          condition_note?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          decline_reason?: string | null
          diagnosis?: string | null
          id?: string
          model?: string | null
          note?: string | null
          problem?: string
          promised_on?: string | null
          ready_on?: string | null
          received_on?: string
          released_on?: string | null
          serial_number?: string | null
          status?: string
          ticket_number?: string
          unit_kind?: string
          unlock_method?: string
          updated_at?: string
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          division: string
          id: string
          income_category: string
          line_total_centavos: number
          name: string
          product_id: string | null
          quantity: number
          sale_id: string
          unit_price_centavos: number
        }
        Insert: {
          division: string
          id?: string
          income_category?: string
          line_total_centavos: number
          name: string
          product_id?: string | null
          quantity: number
          sale_id: string
          unit_price_centavos: number
        }
        Update: {
          division?: string
          id?: string
          income_category?: string
          line_total_centavos?: number
          name?: string
          product_id?: string | null
          quantity?: number
          sale_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          change_centavos: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_centavos: number
          discount_kind: string
          discount_percent: number | null
          id: string
          money_given_centavos: number | null
          occurred_at: string
          payment_method: string
          reference_number: string | null
          sale_date: string
          sale_number: string
          subtotal_centavos: number
          total_centavos: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          change_centavos?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_centavos?: number
          discount_kind?: string
          discount_percent?: number | null
          id?: string
          money_given_centavos?: number | null
          occurred_at?: string
          payment_method: string
          reference_number?: string | null
          sale_date: string
          sale_number: string
          subtotal_centavos: number
          total_centavos: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          change_centavos?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_centavos?: number
          discount_kind?: string
          discount_percent?: number | null
          id?: string
          money_given_centavos?: number | null
          occurred_at?: string
          payment_method?: string
          reference_number?: string | null
          sale_date?: string
          sale_number?: string
          subtotal_centavos?: number
          total_centavos?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          daily_rate_centavos: number | null
          divisions: string[]
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          full_name: string
          id: string
          note: string | null
          photo_path: string | null
          position: string | null
          profile_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate_centavos?: number | null
          divisions?: string[]
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          full_name: string
          id?: string
          note?: string | null
          photo_path?: string | null
          position?: string | null
          profile_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate_centavos?: number | null
          divisions?: string[]
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          full_name?: string
          id?: string
          note?: string | null
          photo_path?: string | null
          position?: string | null
          profile_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          note: string | null
          photo_path: string | null
          reorder_level_thousandths: number | null
          supplier_id: string | null
          tag: string
          unit: string
          unit_cost_centavos: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          note?: string | null
          photo_path?: string | null
          reorder_level_thousandths?: number | null
          supplier_id?: string | null
          tag?: string
          unit: string
          unit_cost_centavos?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          note?: string | null
          photo_path?: string | null
          reorder_level_thousandths?: number | null
          supplier_id?: string | null
          tag?: string
          unit?: string
          unit_cost_centavos?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta_thousandths: number
          expense_id: string | null
          id: string
          kind: string
          occurred_at: string
          payable_id: string | null
          reason: string | null
          stock_item_id: string
          supplier_id: string | null
          unit_cost_centavos: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_thousandths: number
          expense_id?: string | null
          id?: string
          kind: string
          occurred_at?: string
          payable_id?: string | null
          reason?: string | null
          stock_item_id: string
          supplier_id?: string | null
          unit_cost_centavos?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_thousandths?: number
          expense_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          payable_id?: string | null
          reason?: string | null
          stock_item_id?: string
          supplier_id?: string | null
          unit_cost_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_payable_fk"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payables: {
        Row: {
          amount_centavos: number
          created_at: string
          created_by: string | null
          description: string
          due_on: string | null
          id: string
          ledger_entry_id: string | null
          note: string | null
          paid_on: string | null
          paid_source: string | null
          received_on: string
          status: string
          supplier_id: string | null
        }
        Insert: {
          amount_centavos: number
          created_at?: string
          created_by?: string | null
          description: string
          due_on?: string | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          paid_on?: string | null
          paid_source?: string | null
          received_on: string
          status?: string
          supplier_id?: string | null
        }
        Update: {
          amount_centavos?: number
          created_at?: string
          created_by?: string | null
          description?: string
          due_on?: string | null
          id?: string
          ledger_entry_id?: string | null
          note?: string | null
          paid_on?: string | null
          paid_source?: string | null
          received_on?: string
          status?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payables_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payables_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      void_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          reason: string
          requested_by: string | null
          sale_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason: string
          requested_by?: string | null
          sale_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string
          requested_by?: string | null
          sale_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "void_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_sale: {
        Args: {
          p_change_centavos: number
          p_customer_id: string
          p_discount_centavos: number
          p_discount_kind: string
          p_discount_percent: number
          p_ledger: Json
          p_lines: Json
          p_money_given_centavos: number
          p_payment_method: string
          p_reference_number: string
          p_sale_date: string
          p_subtotal_centavos: number
          p_total_centavos: number
        }
        Returns: {
          sale_id: string
          sale_number: string
        }[]
      }
      current_role_name: { Args: never; Returns: string }
      decide_expense: {
        Args: { p_approve: boolean; p_expense_id: string; p_note: string }
        Returns: undefined
      }
      fit_repair_part: {
        Args: {
          p_name: string
          p_quantity: number
          p_stock_item_id: string
          p_ticket_id: string
          p_unit_price_centavos: number
        }
        Returns: string
      }
      give_cash_advance: {
        Args: {
          p_advanced_on: string
          p_amount_centavos: number
          p_deduction_plan?: string
          p_reason?: string
          p_source: string
          p_staff_id: string
        }
        Returns: string
      }
      has_permission: { Args: { wanted: string }; Returns: boolean }
      is_active_staff: { Args: { p_staff_id: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_owner_or_admin: { Args: never; Returns: boolean }
      mark_bill_paid: {
        Args: {
          p_amount_centavos: number
          p_bill_id: string
          p_note?: string
          p_paid_on: string
          p_period_month: string
          p_source: string
        }
        Returns: string
      }
      mark_payroll_paid: {
        Args: { p_paid_on: string; p_source: string; p_week_id: string }
        Returns: string
      }
      my_staff_id: { Args: never; Returns: string }
      pay_supplier_payable: {
        Args: { p_paid_on: string; p_payable_id: string; p_source: string }
        Returns: string
      }
      record_apparel_payment: {
        Args: {
          p_amount_centavos: number
          p_kind: string
          p_ledger: Json
          p_note: string
          p_order_id: string
          p_paid_on: string
          p_reference_number: string
          p_source: string
        }
        Returns: string
      }
      record_expense: {
        Args: {
          p_amount_centavos: number
          p_category: string
          p_note: string
          p_source: string
          p_spent_on: string
          p_supplier_id: string
          p_tag: string
        }
        Returns: string
      }
      record_repair_payment: {
        Args: {
          p_amount_centavos: number
          p_ledger: Json
          p_note: string
          p_paid_on: string
          p_reference_number: string
          p_source: string
          p_ticket_id: string
        }
        Returns: string
      }
      record_stock_in: {
        Args: {
          p_due_on: string
          p_pay_now: boolean
          p_quantity_thousandths: number
          p_reason: string
          p_source: string
          p_stock_item_id: string
          p_supplier_id: string
          p_unit_cost_centavos: number
        }
        Returns: string
      }
      undo_bill_payment: {
        Args: { p_bill_id: string; p_period_month: string; p_reason?: string }
        Returns: undefined
      }
      unlock_payroll_week: {
        Args: { p_reason: string; p_week_id: string }
        Returns: undefined
      }
      void_apparel_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      void_repair_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      void_sale: {
        Args: { p_reason: string; p_sale_id: string }
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
  public: {
    Enums: {},
  },
} as const
