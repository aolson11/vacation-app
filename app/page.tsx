import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#001f3f] px-6 py-12 text-white">
      <div className="flex w-full max-w-4xl flex-col items-center text-center">
        <h1 className="text-[48px] font-bold leading-tight">Family Vacation 2026</h1>
        <p className="mt-4 text-[24px] font-medium">March 25 - April 6</p>
        <Link
          href="/plans"
          className="mt-14 rounded-3xl bg-[#ff851b] px-12 py-6 text-3xl font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-transform duration-150 hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[#ff851b]/40"
        >
          Enter Trip Portal
        </Link>
      </div>
    </main>
  );
}
