import type { Metadata } from "next";
import { BookingPlatform } from "@/components/bookings/BookingPlatform";

export const metadata: Metadata = {
  title: "Booking & Scheduling | NEFT Training Analytics",
  description:
    "The booking register, the daily schedule with its instructors, and the leave behind it.",
};

export default function Page() {
  return <BookingPlatform />;
}
