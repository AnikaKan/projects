export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/", url.origin);
  const error=url.searchParams.get("error");
  const code=url.searchParams.get("code");
  const state=url.searchParams.get("state");
  if(error) destination.searchParams.set("spotify_error",error);
  if(code) destination.searchParams.set("spotify_code",code);
  if(state) destination.searchParams.set("state",state);
  return Response.redirect(destination,302);
}
