import { NextResponse } from "next/server";

// NEXT_PUBLIC_GIT_COMMIT_SHA is baked in at build time (see
// infra/docker-compose.yml's nextjs build args and .github/workflows/deploy-vm.yml),
// using the same commit SHA already used as this image's Docker tag - so the
// system-admin monitoring dashboard can show this service's running version
// without a separate version-tracking system.
export function GET() {
  return NextResponse.json({
    commit_sha: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || "local",
    deployed_at: process.env.NEXT_PUBLIC_DEPLOYED_AT || null,
  });
}
