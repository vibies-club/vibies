import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      // Native form POSTs need their Origin for the server's CSRF check.
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }, { source: "/auth/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }];
  },
};
export default config;
