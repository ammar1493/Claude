/**
 * The booking platform as one page.
 *
 * Same component tree as the /bookings route, mounted into a bare document so
 * the register and the schedule can be hosted anywhere a static file can —
 * including the claude.ai artifact viewer, where the `downloads` capability
 * stands in for the anchor the sandbox blocks. Everything still runs in the
 * browser: the workbook is read locally and the register lives in IndexedDB.
 */
import { createRoot } from "react-dom/client";
import { BookingPlatform } from "../src/components/bookings/BookingPlatform";

const mount = document.getElementById("root");
if (mount) createRoot(mount).render(<BookingPlatform />);
