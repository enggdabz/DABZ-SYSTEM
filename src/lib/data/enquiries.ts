import "server-only";

/**
 * Reading enquiries (Phase 9).
 *
 * Through the ordinary server client, so Row Level Security applies: an
 * enquiry carries a stranger's name and phone number, and only Owner/Admin
 * may read one. A staff account reaching this gets an empty list.
 */
import { cache } from "react";

import type { DivisionId } from "@/lib/divisions";
import type { Enquiry, EnquiryStatus } from "@/lib/enquiries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getEnquiries = cache(
  async (options?: { limit?: number }): Promise<Enquiry[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("enquiries")
      .select(
        "id, name, contact, division, message, heard_from, status, reply_note, created_at, handled_at",
      )
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 200);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      contact: row.contact,
      division: (row.division as DivisionId | null) ?? null,
      message: row.message,
      heardFrom: row.heard_from,
      status: row.status as EnquiryStatus,
      replyNote: row.reply_note,
      createdAt: row.created_at,
      handledAt: row.handled_at,
    }));
  },
);
