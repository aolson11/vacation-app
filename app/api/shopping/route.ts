import { NextResponse } from "next/server";

type ShoppingItemRecord = {
  id: number;
  item_name: string;
  purchased: boolean;
};

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
    `${supabaseUrl}/rest/v1/shopping_list?select=id,item_name,purchased&order=id.asc`,
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
      { error: data.message ?? "Failed to load shopping list." },
      { status: response.status },
    );
  }

  return NextResponse.json(data as ShoppingItemRecord[]);
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as Partial<ShoppingItemRecord>;

  if (!body.item_name?.trim()) {
    return NextResponse.json({ error: "item_name is required." }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/shopping_list`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({
      item_name: body.item_name.trim(),
      purchased: Boolean(body.purchased),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message ?? "Failed to save shopping item." },
      { status: response.status },
    );
  }

  return NextResponse.json((data as ShoppingItemRecord[])[0], { status: 201 });
}

export async function PATCH(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as Partial<ShoppingItemRecord>;

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  if (typeof body.purchased !== "boolean") {
    return NextResponse.json({ error: "purchased must be a boolean." }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/shopping_list?id=eq.${body.id}`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify({ purchased: body.purchased }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.message ?? "Failed to update shopping item." },
      { status: response.status },
    );
  }

  return NextResponse.json((data as ShoppingItemRecord[])[0]);
}

export async function DELETE(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return getMissingConfigResponse();
  }

  const body = (await request.json()) as {
    clearAll?: boolean;
    clearCompleted?: boolean;
    id?: number;
  };

  let query = "";

  if (body.clearAll) {
    query = "id=gt.0";
  } else if (body.clearCompleted) {
    query = "purchased=eq.true";
  } else if (typeof body.id === "number") {
    query = `id=eq.${body.id}`;
  } else {
    return NextResponse.json(
      { error: "Provide an id, clearCompleted, or clearAll flag." },
      { status: 400 },
    );
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/shopping_list?${query}`, {
    method: "DELETE",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const data = await response.json();

    return NextResponse.json(
      { error: data.message ?? "Failed to delete shopping items." },
      { status: response.status },
    );
  }

  return new NextResponse(null, { status: 204 });
}
