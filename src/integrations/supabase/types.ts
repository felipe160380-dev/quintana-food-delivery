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
      addresses: {
        Row: {
          city: string | null
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          number: string | null
          postal_code: string | null
          state: string | null
          street: string
          user_id: string
        }
        Insert: {
          city?: string | null
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          number?: string | null
          postal_code?: string | null
          state?: string | null
          street: string
          user_id: string
        }
        Update: {
          city?: string | null
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          number?: string | null
          postal_code?: string | null
          state?: string | null
          street?: string
          user_id?: string
        }
        Relationships: []
      }
      couriers: {
        Row: {
          approval_note: string | null
          approval_status: Database["public"]["Enums"]["courier_approval_status"]
          approved_at: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          document: string | null
          id: string
          is_available: boolean
          last_seen_at: string | null
          updated_at: string
          vehicle: Database["public"]["Enums"]["vehicle_type"]
          vehicle_plate: string | null
        }
        Insert: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["courier_approval_status"]
          approved_at?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          document?: string | null
          id: string
          is_available?: boolean
          last_seen_at?: string | null
          updated_at?: string
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
          vehicle_plate?: string | null
        }
        Update: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["courier_approval_status"]
          approved_at?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          document?: string | null
          id?: string
          is_available?: boolean
          last_seen_at?: string | null
          updated_at?: string
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_addons: {
        Row: {
          created_at: string
          id: string
          name: string
          order_item_id: string
          price: number
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_item_id: string
          price?: number
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_item_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_addons_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_snapshot: Json
          change_for: number | null
          courier_id: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          address_snapshot: Json
          change_for?: number | null
          courier_id?: string | null
          created_at?: string
          customer_id: string
          delivery_fee?: number
          id?: string
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          change_for?: number | null
          courier_id?: string | null
          created_at?: string
          customer_id?: string
          delivery_fee?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          is_default: boolean
          kind: string
          label: string
          last4: string | null
          pix_key: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          kind: string
          label: string
          last4?: string | null
          pix_key?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          label?: string
          last4?: string | null
          pix_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          external_id: string | null
          id: string
          order_id: string
          provider: string
          raw: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          external_id?: string | null
          id?: string
          order_id: string
          provider: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          external_id?: string | null
          id?: string
          order_id?: string
          provider?: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          max_qty: number
          name: string
          price: number
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_qty?: number
          name: string
          price?: number
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_qty?: number
          name?: string
          price?: number
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_paused: boolean
          low_stock_threshold: number
          name: string
          price: number
          promo_price: number | null
          sort_order: number
          stock: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_paused?: boolean
          low_stock_threshold?: number
          name: string
          price: number
          promo_price?: number | null
          sort_order?: number
          stock?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_paused?: boolean
          low_stock_threshold?: number
          name?: string
          price?: number
          promo_price?: number | null
          sort_order?: number
          stock?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          order_id: string | null
          read_at: string | null
          store_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          order_id?: string | null
          read_at?: string | null
          store_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          order_id?: string | null
          read_at?: string | null
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          order_id: string
          rating: number
          replied_at: string | null
          reply: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_id: string
          rating: number
          replied_at?: string | null
          reply?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string
          rating?: number
          replied_at?: string | null
          reply?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_wallet_entries: {
        Row: {
          created_at: string
          description: string | null
          fee: number
          gross: number
          id: string
          kind: string
          net: number
          order_id: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fee?: number
          gross?: number
          id?: string
          kind: string
          net: number
          order_id?: string | null
          store_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fee?: number
          gross?: number
          id?: string
          kind?: string
          net?: number
          order_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_wallet_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_wallet_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_withdrawals: {
        Row: {
          amount: number
          fee: number
          id: string
          net: number
          note: string | null
          pix_key: string
          processed_at: string | null
          requested_at: string
          status: string
          store_id: string
        }
        Insert: {
          amount: number
          fee?: number
          id?: string
          net: number
          note?: string | null
          pix_key: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          store_id: string
        }
        Update: {
          amount?: number
          fee?: number
          id?: string
          net?: number
          note?: string | null
          pix_key?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_withdrawals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accepts_card_on_delivery: boolean
          accepts_card_online: boolean
          accepts_cash: boolean
          accepts_pix: boolean
          address_line: string | null
          approval_note: string | null
          approval_status: Database["public"]["Enums"]["store_approval_status"]
          approved_at: string | null
          category: string | null
          city: string | null
          cnpj: string | null
          cover_url: string | null
          created_at: string
          delivery_fee: number
          delivery_radius_km: number
          description: string | null
          hours: Json
          id: string
          is_online: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          min_order: number
          name: string
          owner_id: string
          payout_pix_key: string | null
          phone: string | null
          platform_fee_pct: number
          postal_code: string | null
          prep_time_min: number
          slug: string
          state: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          accepts_card_on_delivery?: boolean
          accepts_card_online?: boolean
          accepts_cash?: boolean
          accepts_pix?: boolean
          address_line?: string | null
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["store_approval_status"]
          approved_at?: string | null
          category?: string | null
          city?: string | null
          cnpj?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number
          description?: string | null
          hours?: Json
          id?: string
          is_online?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          min_order?: number
          name: string
          owner_id: string
          payout_pix_key?: string | null
          phone?: string | null
          platform_fee_pct?: number
          postal_code?: string | null
          prep_time_min?: number
          slug: string
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          accepts_card_on_delivery?: boolean
          accepts_card_online?: boolean
          accepts_cash?: boolean
          accepts_pix?: boolean
          address_line?: string | null
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["store_approval_status"]
          approved_at?: string | null
          category?: string | null
          city?: string | null
          cnpj?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_radius_km?: number
          description?: string | null
          hours?: Json
          id?: string
          is_online?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          min_order?: number
          name?: string
          owner_id?: string
          payout_pix_key?: string | null
          phone?: string | null
          platform_fee_pct?: number
          postal_code?: string | null
          prep_time_min?: number
          slug?: string
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      store_wallet_balance: { Args: { _store_id: string }; Returns: number }
    }
    Enums: {
      app_role: "customer" | "merchant" | "courier" | "admin"
      courier_approval_status: "pending" | "in_review" | "approved" | "rejected"
      order_status:
        | "pending"
        | "accepted"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_method:
        | "pix"
        | "card_online"
        | "cash_on_delivery"
        | "card_on_delivery"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      store_approval_status: "pending" | "in_review" | "approved" | "rejected"
      vehicle_type: "bike" | "motorcycle" | "car" | "foot"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["customer", "merchant", "courier", "admin"],
      courier_approval_status: ["pending", "in_review", "approved", "rejected"],
      order_status: [
        "pending",
        "accepted",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_method: [
        "pix",
        "card_online",
        "cash_on_delivery",
        "card_on_delivery",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      store_approval_status: ["pending", "in_review", "approved", "rejected"],
      vehicle_type: ["bike", "motorcycle", "car", "foot"],
    },
  },
} as const
