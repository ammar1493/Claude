/**
 * The incentive verifier as one page.
 *
 * The app it comes from is a Next.js route; this is the same component tree
 * mounted into a bare document, so the verifier can be hosted anywhere a
 * static file can — including the claude.ai artifact viewer, where the
 * `downloads` capability stands in for the anchor the sandbox blocks.
 * Everything still runs in the browser: no server, no upload.
 */
import { createRoot } from "react-dom/client";
import { IncentiveVerifier } from "../src/components/incentives/IncentiveVerifier";

const mount = document.getElementById("root");
if (mount) createRoot(mount).render(<IncentiveVerifier />);
