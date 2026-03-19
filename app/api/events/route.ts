import { NextResponse } from "next/server";
import { categoryOrder, type EventCategory, type EventRecord } from "@/lib/events";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getMissingConfigResponse() {
  return NextResponse.json(
    {
      error:
        "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    },
    { status: 500 },
  );
}

function isValidCategory(value: string): value is EventCategory {
  return categoryOrder.includes(value as EventCategory);
}

function getHeaders(includeJson = false) {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    Prefer: "return=representation",
    apikey: supabaseKey ?? "",
    Authorization: `Bearer ${supabaseKey ?? ""}`,
  };
}

export async function GET() {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/events?select=id,date,time,title,category,rsvp_count&order=date.asc&order=time.asc`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message ?? "Failed to load events from Supabase." },
      { status: response.status },
    );
  }

  return NextResponse.json(data as EventRecord[]);
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as Partial<EventRecord>;

  if (!body.date || !body.time || !body.title || !body.category || body.rsvp_count === undefined) {
    return NextResponse.json(
      { error: "date, time, title, category, and rsvp_count are required." },
      { status: 400 },
    );
  }

  if (!isValidCategory(body.category)) {
    return NextResponse.json(
      { error: "category must be Morning, Afternoon, or Evening." },
      { status: 400 },
    );
  }

  if (typeof body.rsvp_count !== "number" || Number.isNaN(body.rsvp_count) || body.rsvp_count < 0) {
    return NextResponse.json(
      { error: "rsvp_count must be a non-negative number." },
      { status: 400 },
    );
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/events`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({
      date: body.date,
      time: body.time,
      title: body.title,
      category: body.category,
      rsvp_count: body.rsvp_count,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message ?? "Failed to save event to Supabase." },
      { status: response.status },
    );
  }

  return NextResponse.json((data as EventRecord[])[0], { status: 201 });
}

export async function PATCH(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as Partial<EventRecord> & { incrementRsvp?: boolean };

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  if (body.incrementRsvp) {
    const currentResponse = await fetch(
      `${supabaseUrl}/rest/v1/events?id=eq.${body.id}&select=id,date,time,title,category,rsvp_count`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    const currentData = await currentResponse.json();

    if (!currentResponse.ok || !(currentData as EventRecord[])[0]) {
      return NextResponse.json(
        { error: "Failed to load event before RSVP update." },
        { status: currentResponse.ok ? 404 : currentResponse.status },
      );
    }

    const existingEvent = (currentData as EventRecord[])[0];

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${body.id}`, {
      method: "PATCH",
      headers: getHeaders(true),
      body: JSON.stringify({ rsvp_count: existingEvent.rsvp_count + 1 }),
    });

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      return NextResponse.json(
        { error: updateData.message ?? "Failed to update RSVP count." },
        { status: updateResponse.status },
      );
    }

    return NextResponse.json((updateData as EventRecord[])[0]);
  }

  if (!body.date || !body.time || !body.title || !body.category || body.rsvp_count === undefined) {
    return NextResponse.json(
      { error: "id, date, time, title, category, and rsvp_count are required for edits." },
      { status: 400 },
    );
  }

  if (!isValidCategory(body.category)) {
    return NextResponse.json(
      { error: "category must be Morning, Afternoon, or Evening." },
      { status: 400 },
    );
  }

  if (typeof body.rsvp_count !== "number" || Number.isNaN(body.rsvp_count) || body.rsvp_count < 0) {
    return NextResponse.json(
      { error: "rsvp_count must be a non-negative number." },
      { status: 400 },
    );
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${body.id}`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify({
      date: body.date,
      time: body.time,
      title: body.title,
      category: body.category,
      rsvp_count: body.rsvp_count,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message ?? "Failed to update event." },
      { status: response.status },
    );
  }

  return NextResponse.json((data as EventRecord[])[0]);
}

export async function DELETE(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as Partial<EventRecord>;

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${body.id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json();

    return NextResponse.json(
      { error: data.message ?? "Failed to delete event." },
      { status: response.status },
    );
  }

  return NextResponse.json({ success: true });
}
