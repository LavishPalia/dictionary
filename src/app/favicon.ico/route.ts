// Browsers and link-preview tools still ask for /favicon.ico directly; send them to the SVG icon (src/app/icon.svg).
export function GET(request: Request) {
  return Response.redirect(new URL('/icon.svg', request.url), 308);
}
