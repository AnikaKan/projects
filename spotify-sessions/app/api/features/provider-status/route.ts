import { env } from "cloudflare:workers";
import { testMusiMapConnection } from "../../../../lib/feature-provider";

type RuntimeEnv = {
  MUSIMAP_CLIENT_ID?: string;
  MUSIMAP_CLIENT_SECRET?: string;
  MUSIMAP_SCOPE?: string;
};

export async function GET() {
  const runtime = env as unknown as RuntimeEnv;
  const clientId = runtime.MUSIMAP_CLIENT_ID ?? process.env.MUSIMAP_CLIENT_ID;
  const clientSecret = runtime.MUSIMAP_CLIENT_SECRET ?? process.env.MUSIMAP_CLIENT_SECRET;
  const scope = runtime.MUSIMAP_SCOPE ?? process.env.MUSIMAP_SCOPE;
  if (!clientId || !clientSecret) {
    return Response.json({
      provider: "MusiMap",
      configured: false,
      message: "MusiMap credentials have not been added to the site yet.",
    });
  }
  try {
    const details = await testMusiMapConnection({ clientId, clientSecret, scope });
    return Response.json({
      provider: "MusiMap",
      configured: true,
      connected: true,
      ...details,
    });
  } catch (error) {
    return Response.json(
      {
        provider: "MusiMap",
        configured: true,
        connected: false,
        message: error instanceof Error ? error.message : "MusiMap connection failed.",
      },
      { status: 502 },
    );
  }
}
