# Mailroom icons

The app icon is adapted from the white envelope on blue background in the
user-provided Mailroom brand sheet. The built-in imagegen tool cleaned up the
reference; the exports were resized with the project's existing image tooling.

Assets:

- `assets/icon.png`: 1024 × 1024, opaque, square with full-bleed blue background;
  iOS launcher icon and Android adaptive foreground.
- `assets/favicon.png`: 64 × 64, used by Expo for the web favicon.
- `assets/brand-icon.png`: 192 × 192, used on the login screen and sidebar.

The operating system applies the launcher mask. The source icon deliberately
has no rounded outer corners or transparent border. An installed app requires
a new native build to update its home-screen icon; interface changes can be
previewed through Expo Go. Browsers may cache the old favicon.

## Imagegen prompt

Use case: precise-object-edit / logo-brand. Input image 1 is the edit target,
a Mailroom brand sheet. Extract and faithfully clean up ONLY the lower-right
APP ICON design: white geometric envelope/cube with a blue V-shaped gap,
rounded upper flap, rounded lower sides tapering symmetrically to a bottom
central point, subtle pale cool grey faceted shading. Preserve this exact
symbol and the rich electric-blue gradient background. Deliver ONE
production-ready square app icon, 1024x1024 pixels. The BLUE background MUST
extend to all four edges and corners: full square bleed, NO rounded outer
tile, NO surrounding white margin, NO drop shadow, NO frame. Center the white
mark, occupying approximately 60 percent of the square width, with generous
balanced safe padding matching the reference app-icon tile. Sharp clean
antialiased geometric edges; smooth blue gradient subtly lighter toward the
top. No text, no letters, no brand sheet, no palette, no labels, no other
symbols. This is extraction and cleanup of the reference logo, not a redesign.
