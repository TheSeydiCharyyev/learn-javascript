import type { NextConfig } from "next";

// Static export: `next build` writes plain HTML files to out/.
// agentRules: false — otherwise every `next dev` writes an AGENTS.md for AI agents into site/.
const nextConfig: NextConfig = {
  output: "export",
  agentRules: false,
};

export default nextConfig;
