# Book Jas

A playful, mobile-first booking microsite built as a static site for GitHub Pages.

## Preview locally

Open `index.html` directly in a browser, or serve the folder with any static web server.

## Publish with GitHub Pages

1. Create a GitHub repository and add these files to its default branch.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the default branch and the `/ (root)` folder, then save.
5. GitHub will show the public URL after deployment finishes.

No build step or frontend dependencies are required.

## Receive completed bookings

An optional, separate Node.js API is included in [`server/`](server/README.md). When configured, visitors enter their name and explicitly agree before the site sends their choices, progress, device summary, IP information, or approximate location.

The API runs in its own Docker container and provides a password-protected submissions dashboard. Until a public API URL is added to `config.js`, the live GitHub Pages site keeps its existing share/download behavior and sends no tracking data.
