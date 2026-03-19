"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  categoryOrder,
  categoryStyles,
  formatTimeLabel,
  tripDates,
  type EventCategory,
  type EventRecord,
} from "@/lib/events";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tripPhotosBucket = "trip-photos";

type ViewMode = "Overview" | "Daily" | "Grocery List" | "Moments";
type DayId = (typeof tripDates)[number]["id"];

type ShoppingItem = {
  id: number;
  item_name: string;
  purchased: boolean;
};

type WeatherState = {
  condition: string;
  icon: string;
  temperature: number;
};

type PhotoRecord = {
  id: string;
  url: string;
  caption: string | null;
  created_at: string;
};

type FormState = {
  date: DayId;
  time: string;
  title: string;
  category: EventCategory;
  rsvp_count: string;
};

type ModalMode = "create" | "edit";

const initialFormState: FormState = {
  date: tripDates[0].id,
  time: "18:00",
  title: "",
  category: "Evening",
  rsvp_count: "0",
};

function parseDateSafely(value: string) {
  return new Date(value.replace(/-/g, "/"));
}

function getCountdownParts() {
  const tripStart = parseDateSafely("2026/03/25 06:00:00");
  const difference = tripStart.getTime() - Date.now();

  if (difference <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
  };
}

function getWeatherDisplay(weatherCode: number) {
  if ([0, 1].includes(weatherCode)) {
    return { condition: "Sunny", icon: "☀️" };
  }

  if ([2, 3].includes(weatherCode)) {
    return { condition: "Partly Cloudy", icon: "⛅" };
  }

  if ([45, 48].includes(weatherCode)) {
    return { condition: "Misty", icon: "🌫️" };
  }

  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode)) {
    return { condition: "Rain Showers", icon: "🌦️" };
  }

  if ([71, 73, 75, 85, 86].includes(weatherCode)) {
    return { condition: "Mountain Snow", icon: "🌨️" };
  }

  if ([95, 96, 99].includes(weatherCode)) {
    return { condition: "Stormy", icon: "⛈️" };
  }

  return { condition: "Warm & Breezy", icon: "🌴" };
}

function buildStoragePublicUrl(filePath: string) {
  if (!supabaseUrl || !filePath) {
    return "";
  }

  return `${supabaseUrl}/storage/v1/object/public/${tripPhotosBucket}/${filePath}`;
}

function normalizePhotoRecord(record: Record<string, unknown>): PhotoRecord | null {
  if (
    typeof record.id !== "string" ||
    typeof record.url !== "string" ||
    !(typeof record.caption === "string" || record.caption === null) ||
    typeof record.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    url: record.url,
    caption: record.caption,
    created_at: record.created_at,
  };
}

async function insertPhotoRecord(photo: {
  caption: string | null;
  url: string;
}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase configuration for Moments.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/photos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      url: photo.url,
      caption: photo.caption,
    }),
  });

  const data = (await response.json()) as Array<Record<string, unknown>> | { message?: string };

  if (!response.ok) {
    throw new Error("message" in data && typeof data.message === "string" ? data.message : "Failed to save photo record.");
  }

  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Photo record was saved, but no row was returned.");
  }

  const normalized = normalizePhotoRecord(data[0]);

  if (!normalized) {
    throw new Error("Photo record response did not match the expected schema.");
  }

  return normalized;
}

export default function PlansPage() {
  const [view, setView] = useState<ViewMode>("Overview");
  const [selectedDayId, setSelectedDayId] = useState<DayId>(tripDates[0].id);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [countdown, setCountdown] = useState(getCountdownParts);
  const [weather, setWeather] = useState<WeatherState>({
    condition: "Sunny",
    icon: "☀️",
    temperature: 82,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isShoppingSaving, setIsShoppingSaving] = useState(false);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [shoppingDraft, setShoppingDraft] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingCaptionDraft, setEditingCaptionDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const requests: Promise<Response>[] = [
          fetch("/api/events", { cache: "no-store" }),
          fetch("/api/shopping", { cache: "no-store" }),
        ];

        if (supabaseUrl && supabaseAnonKey) {
          requests.push(
            fetch(`${supabaseUrl}/rest/v1/photos?select=id,url,caption,created_at&order=created_at.desc.nullslast,id.desc`, {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
              cache: "no-store",
            }),
          );
        }

        const [eventsResponse, shoppingResponse, photosResponse] = await Promise.all(requests);
        const eventsData = (await eventsResponse.json()) as EventRecord[] | { error?: string };
        const shoppingData = (await shoppingResponse.json()) as ShoppingItem[] | { error?: string };

        if (!eventsResponse.ok) {
          throw new Error("error" in eventsData ? eventsData.error : "Failed to load events.");
        }

        if (!shoppingResponse.ok) {
          throw new Error("error" in shoppingData ? shoppingData.error : "Failed to load shopping list.");
        }

        setEvents(eventsData as EventRecord[]);
        setShoppingItems(shoppingData as ShoppingItem[]);

        if (photosResponse) {
          const photosData = (await photosResponse.json()) as Array<Record<string, unknown>> | { message?: string };

          if (!photosResponse.ok) {
            throw new Error("message" in photosData && typeof photosData.message === "string" ? photosData.message : "Failed to load moments.");
          }

          setPhotos(
            Array.isArray(photosData)
              ? photosData
                  .map((photo) => normalizePhotoRecord(photo))
                  .filter((photo): photo is PhotoRecord => photo !== null)
              : [],
          );
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load plans data.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCountdown(getCountdownParts());
    }, 1_000);

    setCountdown(getCountdownParts());

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    async function loadWeather() {
      try {
        const geocodeResponse = await fetch(
          "https://geocoding-api.open-meteo.com/v1/search?name=Kihei&count=1&language=en&format=json",
          { cache: "no-store" },
        );

        if (!geocodeResponse.ok) {
          return;
        }

        const geocodeData = (await geocodeResponse.json()) as {
          results?: Array<{ latitude: number; longitude: number }>;
        };

        const coordinates = geocodeData.results?.[0];

        if (!coordinates) {
          return;
        }

        const weatherResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`,
          { cache: "no-store" },
        );

        if (!weatherResponse.ok) {
          return;
        }

        const weatherData = (await weatherResponse.json()) as {
          current?: { temperature_2m?: number; weather_code?: number };
        };

        if (
          typeof weatherData.current?.temperature_2m !== "number" ||
          typeof weatherData.current?.weather_code !== "number"
        ) {
          return;
        }

        const display = getWeatherDisplay(weatherData.current.weather_code);

        setWeather({
          condition: display.condition,
          icon: display.icon,
          temperature: Math.round(weatherData.current.temperature_2m),
        });
      } catch {
        return;
      }
    }

    void loadWeather();
  }, []);

  function sortEvents(list: EventRecord[]) {
    return [...list].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      return left.time.localeCompare(right.time);
    });
  }

  const sortedEvents = useMemo(() => sortEvents(events), [events]);

  const eventsByDate = useMemo(() => {
    return sortedEvents.reduce<Record<string, EventRecord[]>>((accumulator, event) => {
      if (!accumulator[event.date]) {
        accumulator[event.date] = [];
      }

      accumulator[event.date].push(event);
      return accumulator;
    }, {});
  }, [sortedEvents]);

  const selectedDay = useMemo(
    () => tripDates.find((day) => day.id === selectedDayId) ?? tripDates[0],
    [selectedDayId],
  );

  const selectedDayEvents = useMemo(() => eventsByDate[selectedDay.id] ?? [], [eventsByDate, selectedDay.id]);

  function openCreateForm() {
    setModalMode("create");
    setEditingEventId(null);
    setFormState({ ...initialFormState, date: selectedDayId });
    setIsFormOpen(true);
  }

  function openEditForm(event: EventRecord) {
    setModalMode("edit");
    setEditingEventId(event.id);
    setFormState({
      date: event.date as DayId,
      time: event.time,
      title: event.title,
      category: event.category,
      rsvp_count: String(event.rsvp_count),
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setModalMode("create");
    setEditingEventId(null);
    setFormState(initialFormState);
  }

  async function handleJoin(eventRecord: EventRecord) {
    try {
      setErrorMessage(null);

      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: eventRecord.id, incrementRsvp: true }),
      });

      const data = (await response.json()) as EventRecord | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to join event.");
      }

      setEvents((currentEvents) =>
        sortEvents(
          currentEvents.map((item) =>
            item.id === eventRecord.id ? (data as EventRecord) : item,
          ),
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to join event.");
    }
  }

  async function handleDelete(eventRecord: EventRecord) {
    try {
      setErrorMessage(null);

      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: eventRecord.id }),
      });

      const data = response.status === 204 ? null : ((await response.json()) as { error?: string } | { success: true });

      if (!response.ok) {
        throw new Error(data && "error" in data ? data.error : "Failed to delete event.");
      }

      setEvents((currentEvents) => currentEvents.filter((item) => item.id !== eventRecord.id));
      if (editingEventId === eventRecord.id) {
        closeForm();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete event.");
    }
  }

  async function handleAddShoppingItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsShoppingSaving(true);
      setErrorMessage(null);

      const response = await fetch("/api/shopping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ item_name: shoppingDraft }),
      });

      const data = (await response.json()) as ShoppingItem | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to add shopping item.");
      }

      setShoppingItems((currentItems) => [...currentItems, data as ShoppingItem]);
      setShoppingDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add shopping item.");
    } finally {
      setIsShoppingSaving(false);
    }
  }

  async function handleToggleShoppingItem(item: ShoppingItem) {
    try {
      setErrorMessage(null);

      const response = await fetch("/api/shopping", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: item.id, purchased: !item.purchased }),
      });

      const data = (await response.json()) as ShoppingItem | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to update shopping item.");
      }

      setShoppingItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? (data as ShoppingItem) : currentItem,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update shopping item.");
    }
  }

  async function handleDeleteShoppingItem(item: ShoppingItem) {
    try {
      setErrorMessage(null);

      const response = await fetch("/api/shopping", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: item.id }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };

        throw new Error(data.error ?? "Failed to delete shopping item.");
      }

      setShoppingItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete shopping item.");
    }
  }

  async function handleClearCompletedShoppingItems() {
    try {
      setErrorMessage(null);
      setIsShoppingSaving(true);

      const response = await fetch("/api/shopping", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clearCompleted: true }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };

        throw new Error(data.error ?? "Failed to clear completed items.");
      }

      setShoppingItems((currentItems) => currentItems.filter((currentItem) => !currentItem.purchased));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to clear completed items.");
    } finally {
      setIsShoppingSaving(false);
    }
  }

  async function handleClearAllShoppingItems() {
    const confirmed = window.confirm("Start a new grocery list? This will remove every item.");

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage(null);
      setIsShoppingSaving(true);

      const response = await fetch("/api/shopping", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clearAll: true }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };

        throw new Error(data.error ?? "Failed to clear grocery list.");
      }

      setShoppingItems([]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to clear grocery list.");
    } finally {
      setIsShoppingSaving(false);
    }
  }

  function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedUploadFile(event.target.files?.[0] ?? null);
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUploadFile) {
      setErrorMessage("Please choose a photo or video to upload.");
      return;
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage("Missing Supabase configuration for Moments.");
      return;
    }

    try {
      setIsPhotoSaving(true);
      setErrorMessage(null);

      const extension = selectedUploadFile.name.split(".").pop() ?? "jpg";
      const safeName = selectedUploadFile.name.replace(/[^a-zA-Z0-9.-]+/g, "-").toLowerCase();
      const filePath = `${Date.now()}-${safeName || `moment.${extension}`}`;

      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/${tripPhotosBucket}/${encodeURIComponent(filePath)}`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": selectedUploadFile.type || "application/octet-stream",
            "x-upsert": "false",
          },
          body: selectedUploadFile,
        },
      );

      if (!uploadResponse.ok) {
        const uploadData = (await uploadResponse.json()) as { message?: string };

        throw new Error(uploadData.message ?? "Failed to upload file to trip-photos bucket.");
      }

      const url = buildStoragePublicUrl(filePath);
      const insertedPhoto = await insertPhotoRecord({
        caption: photoCaption.trim() || null,
        url,
      });

      setPhotos((currentPhotos) => [insertedPhoto, ...currentPhotos]);
      setPhotoCaption("");
      setSelectedUploadFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload moment.");
    } finally {
      setIsPhotoSaving(false);
    }
  }

  function handleDownload(photo: PhotoRecord) {
    const anchor = document.createElement("a");
    anchor.href = photo.url;
    anchor.download = photo.url.split("/").pop()?.split("?")[0] || "maui-moment";
    anchor.rel = "noreferrer";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function openEditPhotoCaption(photo: PhotoRecord) {
    setEditingPhotoId(photo.id);
    setEditingCaptionDraft(photo.caption ?? "");
  }

  function closeEditPhotoCaption() {
    setEditingPhotoId(null);
    setEditingCaptionDraft("");
  }

  async function handleSavePhotoCaption(photo: PhotoRecord) {
    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage("Missing Supabase configuration for Moments.");
      return;
    }

    try {
      setErrorMessage(null);

      const response = await fetch(`${supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ caption: editingCaptionDraft.trim() || null }),
      });

      const data = (await response.json()) as Array<Record<string, unknown>> | { message?: string };

      if (!response.ok) {
        throw new Error("message" in data && typeof data.message === "string" ? data.message : "Failed to update caption.");
      }

      const updatedPhoto = Array.isArray(data) ? normalizePhotoRecord(data[0] ?? {}) : null;

      if (!updatedPhoto) {
        throw new Error("Updated photo response did not match the expected schema.");
      }

      setPhotos((currentPhotos) =>
        currentPhotos.map((currentPhoto) => (currentPhoto.id === photo.id ? updatedPhoto : currentPhoto)),
      );
      closeEditPhotoCaption();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update caption.");
    }
  }

  async function handleDeletePhoto(photo: PhotoRecord) {
    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage("Missing Supabase configuration for Moments.");
      return;
    }

    const confirmed = window.confirm("Delete this photo from the gallery? This also removes the file from storage.");

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage(null);

      const filePath = photo.url.includes(`/${tripPhotosBucket}/`)
        ? photo.url.split(`/${tripPhotosBucket}/`)[1]?.split("?")[0] ?? ""
        : "";

      if (filePath) {
        const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/${tripPhotosBucket}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ prefixes: [filePath] }),
        });

        if (!storageResponse.ok) {
          const storageData = (await storageResponse.json()) as { message?: string };

          throw new Error(storageData.message ?? "Failed to delete photo file from storage.");
        }
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
        method: "DELETE",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };

        throw new Error(data.message ?? "Failed to delete photo record.");
      }

      setPhotos((currentPhotos) => currentPhotos.filter((currentPhoto) => currentPhoto.id !== photo.id));
      if (editingPhotoId === photo.id) {
        closeEditPhotoCaption();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete photo.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const response = await fetch("/api/events", {
        method: modalMode === "edit" ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(modalMode === "edit" ? { id: editingEventId } : {}),
          date: formState.date,
          time: formState.time,
          title: formState.title.trim(),
          category: formState.category,
          rsvp_count: Number(formState.rsvp_count),
        }),
      });

      const data = (await response.json()) as EventRecord | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to save event.");
      }

      setEvents((currentEvents) => {
        if (modalMode === "edit") {
          return sortEvents(
            currentEvents.map((item) => (item.id === editingEventId ? (data as EventRecord) : item)),
          );
        }

        return sortEvents([...currentEvents, data as EventRecord]);
      });
      setSelectedDayId(formState.date);
      setView("Daily");
      closeForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save event.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0b7a75_0%,#004d4d_45%,#003b46_100%)] px-6 py-8 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex w-fit items-center rounded-2xl border border-white/25 bg-white/10 px-6 py-3 text-xl font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.2)] transition-colors hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-white/25"
          >
            Back
          </Link>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center rounded-3xl bg-[#ff851b] px-8 py-4 text-2xl font-bold text-white shadow-[0_12px_24px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.01] focus:outline-none focus:ring-4 focus:ring-[#ff851b]/40"
          >
            + Add Plan
          </button>
        </div>

        <div className="text-center">
          <h1 className="text-5xl font-black uppercase tracking-[0.08em] text-[#ffb347] drop-shadow-[0_8px_18px_rgba(0,0,0,0.28)] sm:text-6xl">
            Maui Wowie Spring Break 2026
          </h1>
          <p className="mt-3 text-2xl font-semibold text-[#ffe8b0]">March 25 - April 6</p>
        </div>

        <section className="rounded-[2rem] border border-white/25 bg-white/14 px-6 py-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-5 rounded-[2rem] border border-white/20 bg-[linear-gradient(135deg,rgba(255,179,71,0.3)_0%,rgba(255,143,122,0.28)_48%,rgba(255,105,180,0.22)_100%)] p-2 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/20 bg-white/12 px-6 py-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-md">
              <p className="text-lg font-semibold uppercase tracking-[0.18em] text-white/75">Countdown Timer</p>
              <h2 className="mt-3 text-3xl font-black text-[#ffe8b0]">Trip launch: March 25 at 6:00 AM</h2>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-black/15 px-4 py-5 text-center">
                  <p className="text-4xl font-black text-[#ffb347]">{countdown.days}</p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-white/75">Days</p>
                </div>
                <div className="rounded-2xl bg-black/15 px-4 py-5 text-center">
                  <p className="text-4xl font-black text-[#ffb347]">{countdown.hours}</p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-white/75">Hours</p>
                </div>
                <div className="rounded-2xl bg-black/15 px-4 py-5 text-center">
                  <p className="text-4xl font-black text-[#ffb347]">{countdown.minutes}</p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-white/75">Minutes</p>
                </div>
                <div className="rounded-2xl bg-black/15 px-4 py-5 text-center">
                  <p className="text-4xl font-black text-[#ffb347]">{countdown.seconds}</p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-white/75">Seconds</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/12 px-6 py-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-md">
              <p className="text-lg font-semibold uppercase tracking-[0.18em] text-white/75">Kihei Weather</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#ffb347]/20 text-5xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
                  {weather.icon}
                </div>
                <div>
                  <p className="text-4xl font-black text-[#ffe8b0]">{weather.temperature}°F</p>
                  <p className="mt-1 text-xl font-semibold text-white/85">{weather.condition} in Kihei, Maui</p>
                  <p className="mt-2 text-base font-medium text-white/70">Perfect dashboard weather near the Kamaole beaches.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-3xl border border-[#ff851b]/50 bg-[#ff851b]/15 px-6 py-5 text-lg font-medium text-white shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
            {errorMessage}
          </div>
        ) : null}

        <div className="mx-auto flex w-full max-w-xl rounded-full border-4 border-white/30 bg-white/10 p-2 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
          <button
            type="button"
            onClick={() => setView("Overview")}
            className={`flex-1 rounded-full px-6 py-4 text-2xl font-bold transition-colors ${
              view === "Overview" ? "bg-white text-[#001f3f]" : "text-white hover:bg-white/10"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setView("Daily")}
            className={`flex-1 rounded-full px-6 py-4 text-2xl font-bold transition-colors ${
              view === "Daily" ? "bg-[#ff851b] text-white" : "text-white hover:bg-white/10"
            }`}
          >
            Daily
          </button>
          <button
            type="button"
            onClick={() => setView("Grocery List")}
            className={`flex-1 rounded-full px-6 py-4 text-2xl font-bold transition-colors ${
              view === "Grocery List" ? "bg-[#ff851b] text-white" : "text-white hover:bg-white/10"
            }`}
          >
            Grocery List
          </button>
          <button
            type="button"
            onClick={() => setView("Moments")}
            className={`flex-1 rounded-full px-6 py-4 text-2xl font-bold transition-colors ${
              view === "Moments" ? "bg-[#ff851b] text-white" : "text-white hover:bg-white/10"
            }`}
          >
            Moments
          </button>
        </div>

        {isLoading ? (
          <section className="rounded-3xl border border-white/20 bg-white/10 px-8 py-10 text-center text-2xl font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
            Loading plans...
          </section>
        ) : view === "Moments" ? (
          <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="rounded-3xl border border-white/20 bg-white/10 px-6 py-6 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
              <div>
                <h2 className="text-4xl font-bold text-white">Moments</h2>
                <p className="mt-2 text-xl text-white/80">Browse the family gallery, save favorites, and upload new beach-day memories.</p>
              </div>
            </div>

            <form
              onSubmit={handlePhotoUpload}
              className="rounded-[2rem] border border-white/20 bg-white px-6 py-6 text-[#001f3f] shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="text-lg font-bold">Caption</span>
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(event) => setPhotoCaption(event.target.value)}
                    placeholder="Sunset walk on Kamaole Beach"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xl font-medium outline-none transition focus:border-[#ff851b] focus:bg-white"
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handlePhotoFileChange}
                  className="hidden"
                />

                <div className="rounded-[1.75rem] bg-[linear-gradient(135deg,#fff7ed_0%,#ffe4d6_55%,#ffd3bf_100%)] p-4 shadow-[inset_0_0_0_1px_rgba(255,133,27,0.12)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#b45309]">Gallery Upload</p>
                      <p className="mt-2 text-lg font-semibold text-[#7c2d12]">
                        {selectedUploadFile ? selectedUploadFile.name : "No photo selected yet"}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#9a3412]">
                        Pick a photo or video from your device, then post it to the gallery.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[64px] items-center justify-center rounded-[1.5rem] bg-[#001f3f] px-6 py-4 text-xl font-bold text-white shadow-[0_10px_24px_rgba(0,31,63,0.24)] transition-transform hover:scale-[1.01] focus:outline-none focus:ring-4 focus:ring-[#001f3f]/20"
                    >
                      Select Photo
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPhotoSaving || !selectedUploadFile}
                  className="inline-flex min-h-[64px] items-center justify-center rounded-[1.5rem] bg-[#ff851b] px-8 py-4 text-2xl font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPhotoSaving ? "Posting..." : "Post to Gallery"}
                </button>
              </div>
            </form>

            {photos.length > 0 ? (
              <div className="columns-1 gap-5 sm:columns-2 xl:columns-3">
                {photos.map((photo) => (
                  <article
                    key={photo.id}
                    className="mb-5 break-inside-avoid overflow-hidden rounded-3xl border border-white/20 bg-white/95 text-[#001f3f] shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
                  >
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.caption || "Vacation moment"} className="w-full object-cover" />
                      <div className="absolute right-4 top-4 flex gap-2">
                        <button
                          type="button"
                          aria-label={`Download ${photo.caption || "moment"}`}
                          onClick={() => handleDownload(photo)}
                          className="rounded-full bg-black/55 px-4 py-3 text-2xl font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                        >
                          ⬇️
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit caption for ${photo.caption || "moment"}`}
                          onClick={() => openEditPhotoCaption(photo)}
                          className="rounded-full bg-white/90 px-4 py-3 text-xl font-bold text-[#001f3f] transition-colors hover:bg-white"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${photo.caption || "moment"}`}
                          onClick={() => void handleDeletePhoto(photo)}
                          className="rounded-full bg-[#ffdddd] px-4 py-3 text-xl font-bold text-[#8b0000] transition-colors hover:bg-[#ffd1d1]"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-5">
                      {editingPhotoId === photo.id ? (
                        <div className="flex flex-col gap-3">
                          <input
                            type="text"
                            value={editingCaptionDraft}
                            onChange={(event) => setEditingCaptionDraft(event.target.value)}
                            className="rounded-2xl border border-slate-300 px-4 py-3 text-lg font-medium"
                            placeholder="Add a caption"
                          />
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => void handleSavePhotoCaption(photo)}
                              className="rounded-full bg-[#ff851b] px-5 py-3 text-base font-bold text-white"
                            >
                              Save Caption
                            </button>
                            <button
                              type="button"
                              onClick={closeEditPhotoCaption}
                              className="rounded-full bg-slate-200 px-5 py-3 text-base font-bold text-[#001f3f]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xl font-semibold leading-relaxed text-[#001f3f]">
                          {photo.caption || "Shared family memory"}
                        </p>
                      )}
                      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#001f3f]/55">
                        {parseDateSafely(photo.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/20 bg-white/10 px-8 py-10 text-center text-2xl font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                No moments yet. Upload the first beach photo or sunset video.
              </div>
            )}
          </section>
        ) : view === "Grocery List" ? (
          <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <div className="rounded-3xl border border-white/20 bg-white/10 px-6 py-6 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-4xl font-bold text-white">Shared Grocery List</h2>
                  <p className="mt-3 text-xl text-white/80">Add items for the trip and check them off once they are bought.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleClearCompletedShoppingItems()}
                    disabled={isShoppingSaving || !shoppingItems.some((item) => item.purchased)}
                    className="rounded-full bg-white/90 px-5 py-3 text-base font-bold text-[#001f3f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear Completed
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearAllShoppingItems()}
                    disabled={isShoppingSaving || shoppingItems.length === 0}
                    className="rounded-full bg-[#ffdddd] px-5 py-3 text-base font-bold text-[#8b0000] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Start New List
                  </button>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleAddShoppingItem}
              className="flex flex-col gap-4 rounded-3xl border border-white/20 bg-white px-6 py-6 text-[#001f3f] shadow-[0_12px_30px_rgba(0,0,0,0.22)] sm:flex-row sm:items-center"
            >
              <input
                type="text"
                required
                value={shoppingDraft}
                onChange={(event) => setShoppingDraft(event.target.value)}
                placeholder="Kona Coffee"
                className="flex-1 rounded-2xl border border-slate-300 px-5 py-4 text-xl font-medium"
              />
              <button
                type="submit"
                disabled={isShoppingSaving}
                className="rounded-3xl bg-[#ff851b] px-8 py-4 text-2xl font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isShoppingSaving ? "Adding..." : "+ Add Item"}
              </button>
            </form>

            <div className="rounded-3xl border border-white/20 bg-white px-6 py-6 text-[#001f3f] shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
              <div className="flex flex-col gap-4">
                {shoppingItems.length > 0 ? (
                  shoppingItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 rounded-2xl border border-slate-200 px-4 py-4 transition-colors hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={item.purchased}
                        onChange={() => void handleToggleShoppingItem(item)}
                        className="h-6 w-6 accent-[#ff851b]"
                      />
                      <span
                        className={`text-2xl font-semibold ${
                          item.purchased ? "text-slate-400 line-through" : "text-[#001f3f]"
                        }`}
                      >
                        {item.item_name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${item.item_name}`}
                        onClick={() => void handleDeleteShoppingItem(item)}
                        className="ml-auto rounded-full bg-[#ffdddd] px-4 py-3 text-xl font-bold text-[#8b0000] transition-colors hover:bg-[#ffd1d1]"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xl font-semibold text-slate-500">No grocery items yet.</p>
                )}
              </div>
            </div>
          </section>
        ) : view === "Overview" ? (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tripDates.map((day) => {
              const dayEvents = eventsByDate[day.id] ?? [];

              return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setSelectedDayId(day.id);
                  setView("Daily");
                }}
                className="rounded-3xl border border-white/20 bg-white px-6 py-6 text-left text-[#001f3f] shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition-transform hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[#ff851b]/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold leading-snug">{day.shortLabel}</h2>
                    <p className="mt-2 text-lg font-medium text-[#001f3f]/75">{day.label}</p>
                  </div>
                  <span className="rounded-full bg-[#001f3f] px-3 py-2 text-base font-bold text-white">
                    {dayEvents.length}
                  </span>
                </div>
                <div className="mt-6 flex flex-col gap-3">
                  {categoryOrder.map((period) => {
                    const eventsForPeriod = dayEvents.filter((item) => item.category === period);
                    const isFilled = eventsForPeriod.length > 0;

                    return (
                      <div
                        key={period}
                        className={`rounded-2xl px-4 py-3 shadow-sm ${
                          isFilled ? categoryStyles[period].filled : categoryStyles[period].empty
                        }`}
                      >
                        <p className="text-sm font-bold uppercase tracking-[0.18em]">{period}</p>
                        {isFilled ? (
                          <div className="mt-2 flex flex-col gap-2">
                            {eventsForPeriod.map((eventForPeriod) => (
                              <p key={eventForPeriod.id} className="text-lg font-bold leading-snug">
                                {formatTimeLabel(eventForPeriod.time)}: {eventForPeriod.title}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-base font-semibold">No plan yet</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </button>
              );
            })}
          </section>
        ) : (
          <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <div className="rounded-3xl border border-white/20 bg-white/10 px-6 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
              <p className="text-lg font-semibold uppercase tracking-[0.2em] text-white/70">Selected Day</p>
              <h2 className="mt-2 text-4xl font-bold text-white">{selectedDay.label}</h2>
            </div>

            <div className="flex flex-col gap-5">
              {categoryOrder.map((period) => {
                const periodEvents = selectedDayEvents.filter((item) => item.category === period);
                const isFilled = periodEvents.length > 0;

                return (
                  <article
                    key={period}
                    className={`rounded-3xl px-6 py-6 shadow-[0_14px_30px_rgba(0,0,0,0.28)] ${
                      isFilled ? categoryStyles[period].filled : categoryStyles[period].empty
                    }`}
                  >
                    <div className="flex flex-col gap-5">
                      <div>
                        <p className="text-lg font-semibold uppercase tracking-[0.18em]">{period}</p>
                        <h3 className="mt-2 text-[24px] font-bold leading-snug">
                          {isFilled ? `${period} plans` : `No ${period.toLowerCase()} plan yet`}
                        </h3>
                      </div>

                      {isFilled ? (
                        <div className="flex flex-col gap-4">
                          {periodEvents.map((item) => (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openEditForm(item)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openEditForm(item);
                                }
                              }}
                              className="flex cursor-pointer flex-col gap-4 rounded-2xl bg-white/15 px-5 py-5 backdrop-blur-sm transition-colors hover:bg-white/20 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <h4 className="text-[24px] font-bold leading-snug">{item.title}</h4>
                                <p className="mt-2 text-xl font-medium">{formatTimeLabel(item.time)}</p>
                              </div>
                              <div className="flex flex-col gap-3 sm:items-end">
                                <div className="rounded-2xl bg-black/15 px-5 py-4 text-center">
                                  <p className="text-base font-semibold uppercase tracking-[0.16em]">RSVP Counter</p>
                                  <p className="mt-2 text-[24px] font-bold">{item.rsvp_count}</p>
                                </div>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleJoin(item);
                                    }}
                                    className="rounded-full bg-white/90 px-5 py-3 text-lg font-bold text-[#001f3f] transition-colors hover:bg-white"
                                  >
                                    + Join
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${item.title}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDelete(item);
                                    }}
                                    className="rounded-full bg-[#ffdddd] px-4 py-3 text-xl font-bold text-[#8b0000] transition-colors hover:bg-[#ffd1d1]"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-black/10 px-5 py-5">
                          <p className="text-xl font-semibold">This time block is open.</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/10 px-6 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
              <p className="text-xl font-semibold text-white/85">Choose another day</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {tripDates.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setSelectedDayId(day.id)}
                    className={`rounded-full px-4 py-3 text-lg font-semibold transition-colors ${
                      day.id === selectedDay.id
                        ? "bg-[#ff851b] text-white"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {day.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {isFormOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6">
            <div className="w-full max-w-2xl rounded-[2rem] bg-white p-8 text-[#001f3f] shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-bold leading-tight">
                    {modalMode === "edit" ? "Edit Event" : "Add a Plan"}
                  </h2>
                  <p className="mt-2 text-xl font-medium text-[#001f3f]/70">
                    {modalMode === "edit"
                      ? "Change the title, time, category, or RSVP count for this event."
                      : "Save a real event to the trip schedule."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full bg-slate-200 px-4 py-2 text-lg font-bold text-[#001f3f]"
                >
                  Close
                </button>
              </div>

              <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
                <label className="flex flex-col gap-2">
                  <span className="text-lg font-bold">Date</span>
                  <select
                    value={formState.date}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        date: event.target.value as DayId,
                      }))
                    }
                    className="rounded-2xl border border-slate-300 px-4 py-4 text-xl font-medium"
                  >
                    {tripDates.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-lg font-bold">Time</span>
                    <input
                      type="time"
                      required
                      value={formState.time}
                      onChange={(event) => setFormState((currentState) => ({ ...currentState, time: event.target.value }))}
                      className="rounded-2xl border border-slate-300 px-4 py-4 text-xl font-medium"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-lg font-bold">Category</span>
                    <select
                      value={formState.category}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          category: event.target.value as EventCategory,
                        }))
                      }
                      className="rounded-2xl border border-slate-300 px-4 py-4 text-xl font-medium"
                    >
                      {categoryOrder.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-lg font-bold">Event Title</span>
                  <input
                    type="text"
                    required
                    value={formState.title}
                    onChange={(event) => setFormState((currentState) => ({ ...currentState, title: event.target.value }))}
                    placeholder="Dinner at the Resort"
                    className="rounded-2xl border border-slate-300 px-4 py-4 text-xl font-medium"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-lg font-bold">RSVP Count</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formState.rsvp_count}
                    onChange={(event) => setFormState((currentState) => ({ ...currentState, rsvp_count: event.target.value }))}
                    className="rounded-2xl border border-slate-300 px-4 py-4 text-xl font-medium"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="mt-2 rounded-3xl bg-[#ff851b] px-8 py-5 text-2xl font-bold text-white shadow-[0_12px_24px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Save Plan"}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
