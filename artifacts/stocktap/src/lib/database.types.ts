export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          default_view: "tenths" | "exact";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          default_view?: "tenths" | "exact";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          default_view?: "tenths" | "exact";
          updated_at?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          tier: "free" | "pro" | "premium";
          stripe_customer_id: string | null;
          measure_ml: number;
          measure_system: "uk" | "ie" | "us" | "eu" | "free_pour";
          is_tied: boolean;
          order_cycle_days: number;
          pro_since: string | null;
          founding_landlord: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          tier?: "free" | "pro" | "premium";
          stripe_customer_id?: string | null;
          measure_ml?: number;
          measure_system?: "uk" | "ie" | "us" | "eu" | "free_pour";
          is_tied?: boolean;
          order_cycle_days?: number;
          pro_since?: string | null;
          founding_landlord?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          tier?: "free" | "pro" | "premium";
          stripe_customer_id?: string | null;
          measure_ml?: number;
          measure_system?: "uk" | "ie" | "us" | "eu" | "free_pour";
          is_tied?: boolean;
          order_cycle_days?: number;
          pro_since?: string | null;
          founding_landlord?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      venue_members: {
        Row: {
          id: string;
          venue_id: string;
          user_id: string;
          role: "owner" | "manager" | "staff";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          user_id: string;
          role?: "owner" | "manager" | "staff";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: "owner" | "manager" | "staff";
          updated_at?: string;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          sort: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          name: string;
          sort?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          venue_id: string;
          location_id: string | null;
          name: string;
          type: "spirit" | "gin" | "vodka" | "whisky" | "rum" | "liqueur" | "wine" | "sparkling" | "vermouth" | "syrup" | "cordial" | "packaged";
          unit: "weigh" | "count";
          size_ml: number | null;
          abv: number | null;
          density: number;
          full_weight_g: number | null;
          empty_weight_g: number | null;
          cost_price: number | null;
          pour_price: number | null;
          measure_ml: number | null;
          barcode: string | null;
          is_template: boolean;
          category: "draught_lager" | "draught_ale" | "draught_cider" | "draught_stout" | "minerals" | "packaged" | "postmix" | "spirits" | "wines" | null;
          counting_method: "dipstick" | "keg_weight" | "tenths_pints" | "dozen" | "each" | "litre" | "weigh" | "tenths" | "photo_tap" | null;
          container_type: "keg" | "cask" | "bag_in_box" | null;
          container_l: number | null;
          dip_full_mm: number | null;
          pack_size: number | null;
          par_level: number | null;
          external_id: string | null;
          vendor: string | null;
          v21_code: string | null;
          sku: string | null;
          notes: string | null;
          bottle_shape_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          location_id?: string | null;
          name: string;
          type?: "spirit" | "gin" | "vodka" | "whisky" | "rum" | "liqueur" | "wine" | "sparkling" | "vermouth" | "syrup" | "cordial" | "packaged";
          unit?: "weigh" | "count";
          size_ml?: number | null;
          abv?: number | null;
          density?: number;
          full_weight_g?: number | null;
          empty_weight_g?: number | null;
          cost_price?: number | null;
          pour_price?: number | null;
          measure_ml?: number | null;
          barcode?: string | null;
          is_template?: boolean;
          category?: "draught_lager" | "draught_ale" | "draught_cider" | "draught_stout" | "minerals" | "packaged" | "postmix" | "spirits" | "wines" | null;
          counting_method?: "dipstick" | "keg_weight" | "tenths_pints" | "dozen" | "each" | "litre" | "weigh" | "tenths" | "photo_tap" | null;
          container_type?: "keg" | "cask" | "bag_in_box" | null;
          container_l?: number | null;
          dip_full_mm?: number | null;
          pack_size?: number | null;
          par_level?: number | null;
          external_id?: string | null;
          vendor?: string | null;
          v21_code?: string | null;
          sku?: string | null;
          notes?: string | null;
          bottle_shape_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          location_id?: string | null;
          name?: string;
          type?: "spirit" | "gin" | "vodka" | "whisky" | "rum" | "liqueur" | "wine" | "sparkling" | "vermouth" | "syrup" | "cordial" | "packaged";
          unit?: "weigh" | "count";
          size_ml?: number | null;
          abv?: number | null;
          density?: number;
          full_weight_g?: number | null;
          empty_weight_g?: number | null;
          cost_price?: number | null;
          pour_price?: number | null;
          measure_ml?: number | null;
          barcode?: string | null;
          is_template?: boolean;
          category?: "draught_lager" | "draught_ale" | "draught_cider" | "draught_stout" | "minerals" | "packaged" | "postmix" | "spirits" | "wines" | null;
          counting_method?: "dipstick" | "keg_weight" | "tenths_pints" | "dozen" | "each" | "litre" | "weigh" | "tenths" | "photo_tap" | null;
          container_type?: "keg" | "cask" | "bag_in_box" | null;
          container_l?: number | null;
          dip_full_mm?: number | null;
          pack_size?: number | null;
          par_level?: number | null;
          external_id?: string | null;
          vendor?: string | null;
          v21_code?: string | null;
          sku?: string | null;
          notes?: string | null;
          bottle_shape_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      bottle_shapes: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          photo_url: string | null;
          fill_curve: Array<{ y: number; fill: number }>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          name: string;
          photo_url?: string | null;
          fill_curve?: Array<{ y: number; fill: number }>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          photo_url?: string | null;
          fill_curve?: Array<{ y: number; fill: number }>;
          updated_at?: string;
        };
        Relationships: [];
      };
      stocktakes: {
        Row: {
          id: string;
          venue_id: string;
          location_id: string | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          total_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          location_id?: string | null;
          status?: "open" | "closed";
          opened_at?: string;
          closed_at?: string | null;
          total_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          location_id?: string | null;
          status?: "open" | "closed";
          closed_at?: string | null;
          total_value?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      readings: {
        Row: {
          id: string;
          venue_id: string;
          product_id: string;
          location_id: string | null;
          stocktake_id: string | null;
          method: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap" | "slider";
          weight_g: number | null;
          count: number | null;
          ml_remaining: number;
          user_id: string;
          staff_on: string[] | null;
          reading_at: string;
          full_containers: number | null;
          part_value: number | null;
          is_line_check: boolean;
          is_delivery: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          product_id: string;
          location_id?: string | null;
          stocktake_id?: string | null;
          method?: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap" | "slider";
          weight_g?: number | null;
          count?: number | null;
          ml_remaining: number;
          user_id: string;
          staff_on?: string[] | null;
          reading_at?: string;
          full_containers?: number | null;
          part_value?: number | null;
          is_line_check?: boolean;
          is_delivery?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ml_remaining?: number;
          method?: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap" | "slider";
          weight_g?: number | null;
          count?: number | null;
          location_id?: string | null;
          full_containers?: number | null;
          part_value?: number | null;
          reading_at?: string;
          is_line_check?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      special_offers: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          offer_price: number;
          starts_at: string;
          ends_at: string;
          product_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          name: string;
          offer_price: number;
          starts_at: string;
          ends_at: string;
          product_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          offer_price?: number;
          starts_at?: string;
          ends_at?: string;
          product_ids?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      baseline_audits: {
        Row: {
          id: string;
          venue_id: string;
          job_number: string | null;
          site: string | null;
          audit_date: string;
          period_start: string | null;
          period_end: string | null;
          opening_stock: number | null;
          closing_stock: number | null;
          revenue: number | null;
          purchases: number | null;
          days_stock_holding: number | null;
          optimum_gp_percent: number | null;
          actual_gp_percent: number | null;
          wastage: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          job_number?: string | null;
          site?: string | null;
          audit_date: string;
          period_start?: string | null;
          period_end?: string | null;
          opening_stock?: number | null;
          closing_stock?: number | null;
          revenue?: number | null;
          purchases?: number | null;
          days_stock_holding?: number | null;
          optimum_gp_percent?: number | null;
          actual_gp_percent?: number | null;
          wastage?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          job_number?: string | null;
          site?: string | null;
          audit_date?: string;
          period_start?: string | null;
          period_end?: string | null;
          opening_stock?: number | null;
          closing_stock?: number | null;
          revenue?: number | null;
          purchases?: number | null;
          days_stock_holding?: number | null;
          optimum_gp_percent?: number | null;
          actual_gp_percent?: number | null;
          wastage?: number | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          id: string;
          venue_id: string;
          product_id: string;
          entry_method: "invoice" | "ledger" | "mid_stocktake";
          quantity: number;
          unit_cost: number | null;
          invoice_ref: string | null;
          delivered_at: string;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          product_id: string;
          entry_method: "invoice" | "ledger" | "mid_stocktake";
          quantity: number;
          unit_cost?: number | null;
          invoice_ref?: string | null;
          delivered_at?: string;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          quantity?: number;
          unit_cost?: number | null;
          invoice_ref?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          venue_id: string;
          user_id: string | null;
          category: "billing" | "technical" | "data" | "feature_request" | "other";
          subject: string;
          message: string;
          status: "open" | "acknowledged" | "resolved";
          auto_reply: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          user_id?: string | null;
          category?: "billing" | "technical" | "data" | "feature_request" | "other";
          subject: string;
          message: string;
          status?: "open" | "acknowledged" | "resolved";
          auto_reply?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "open" | "acknowledged" | "resolved";
          auto_reply?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      feature_suggestions: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string | null;
          title: string;
          detail: string | null;
          status: "under_review" | "planned" | "building" | "shipped";
          upvote_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          venue_id?: string | null;
          title: string;
          detail?: string | null;
          status?: "under_review" | "planned" | "building" | "shipped";
          upvote_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          detail?: string | null;
          status?: "under_review" | "planned" | "building" | "shipped";
          updated_at?: string;
        };
        Relationships: [];
      };
      feature_suggestion_votes: {
        Row: {
          id: string;
          suggestion_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          suggestion_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          suggestion_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      till_entries: {
        Row: {
          id: string;
          venue_id: string;
          product_id: string;
          measures_sold: number;
          period_start: string;
          period_end: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          product_id: string;
          measures_sold: number;
          period_start: string;
          period_end: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          measures_sold?: number;
          period_start?: string;
          period_end?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          venue_id: string;
          product_id: string;
          from_location_id: string | null;
          to_location_id: string | null;
          movement_type: "delivery" | "transfer" | "wastage";
          quantity_ml: number;
          unit_cost_pence: number | null;
          reason: string | null;
          notes: string | null;
          moved_at: string;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          product_id: string;
          from_location_id?: string | null;
          to_location_id?: string | null;
          movement_type: "delivery" | "transfer" | "wastage";
          quantity_ml: number;
          unit_cost_pence?: number | null;
          reason?: string | null;
          notes?: string | null;
          moved_at?: string;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          quantity_ml?: number;
          unit_cost_pence?: number | null;
          reason?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          venue_id: string;
          referred_venue_id: string | null;
          code: string;
          status: "pending" | "qualified";
          qualified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          referred_venue_id?: string | null;
          code: string;
          status?: "pending" | "qualified";
          qualified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          referred_venue_id?: string | null;
          status?: "pending" | "qualified";
          qualified_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      insights: {
        Row: {
          id: string;
          venue_id: string;
          type: "variance_trend" | "over_pouring" | "days_of_cover" | "reorder_nudge" | "gp_drift" | "general" | null;
          title: string | null;
          body: string | null;
          severity: "info" | "warning" | "critical";
          week_start: string;
          dismissed: boolean;
          data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          type?: "variance_trend" | "over_pouring" | "days_of_cover" | "reorder_nudge" | "gp_drift" | "general" | null;
          title?: string | null;
          body?: string | null;
          severity?: "info" | "warning" | "critical";
          week_start?: string;
          dismissed?: boolean;
          data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          dismissed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_submissions: {
        Row: {
          id: string;
          name: string;
          type: string;
          size_ml: number | null;
          full_weight_g: number | null;
          empty_weight_g: number | null;
          density: number;
          abv: number | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type?: string;
          size_ml?: number | null;
          full_weight_g?: number | null;
          empty_weight_g?: number | null;
          density?: number;
          abv?: number | null;
          submitted_at?: string;
        };
        Update: {
          name?: string;
          type?: string;
          size_ml?: number | null;
          full_weight_g?: number | null;
          empty_weight_g?: number | null;
          density?: number;
          abv?: number | null;
        };
        Relationships: [];
      };
      count_locations: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          sort: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          name: string;
          sort?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_records: {
        Row: {
          id: string;
          venue_id: string;
          product_id: string | null;
          product_name_raw: string;
          quantity_sold: number;
          unit_price_pence: number | null;
          revenue_pence: number | null;
          sale_date: string;
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          product_id?: string | null;
          product_name_raw: string;
          quantity_sold: number;
          unit_price_pence?: number | null;
          revenue_pence?: number | null;
          sale_date: string;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          product_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      spot_check_sessions: {
        Row: {
          id: string;
          venue_id: string;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          status?: "open" | "closed";
          opened_at?: string;
          closed_at?: string | null;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "open" | "closed";
          closed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      stocktake_line_entries: {
        Row: {
          id: string;
          venue_id: string;
          stocktake_id: string | null;
          spot_check_id: string | null;
          product_id: string;
          count_location_id: string | null;
          method: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap";
          full_containers: number | null;
          part_value: number | null;
          ml_remaining: number;
          sync_status: "pending" | "uploading" | "uploaded";
          entered_at: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          stocktake_id?: string | null;
          spot_check_id?: string | null;
          product_id: string;
          count_location_id?: string | null;
          method: "weigh" | "tenths" | "count" | "keg_weight" | "dipstick" | "tenths_pints" | "dozen" | "each" | "litre" | "photo_tap";
          full_containers?: number | null;
          part_value?: number | null;
          ml_remaining: number;
          sync_status?: "pending" | "uploading" | "uploaded";
          entered_at?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sync_status?: "pending" | "uploading" | "uploaded";
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_referral_code: {
        Args: { p_code: string; p_venue_id: string };
        Returns: boolean;
      };
      get_referral_progress: {
        Args: { p_referral_id: string };
        Returns: { venue_name: string; tier: "free" | "pro" | "premium"; pro_since: string | null }[];
      };
      check_referral_qualification: {
        Args: { p_referral_id: string };
        Returns: string;
      };
      get_founding_landlord_count: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
