# Image Serving Application

A secure image serving application built with React Router v7 and Cloudflare Workers, using R2 for storage.

## Features

- 🖼️ Direct image serving at `https://yourdomain.com/image.png`
- 🔒 Password-protected admin panel
- 📁 File upload with support for all file types
- 🗂️ Image management with preview, file info, and deletion
- ☁️ Powered by Cloudflare R2 storage
- ⚡ Fast edge deployment with Cloudflare Workers

## Routes

- `/` - Home page with usage information
- `/manage` - Admin panel for managing images (password protected)
- `/:filename` - Direct file serving (e.g., `/image.png`, `/document.pdf`)

## Setup

1. **Clone and install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Set your `ADMIN_PASSWORD` in `.env`

3. **Set up Cloudflare R2:**
   - Create an R2 bucket named `image-serving` in your Cloudflare dashboard
   - Update `wrangler.jsonc` if needed

4. **Development:**
   ```bash
   bun dev
   ```

5. **Deploy:**
   ```bash
   bun run deploy
   ```

## Usage

### Accessing Images
Images are served directly at the root path:
- `https://yourdomain.com/photo.jpg` - Original image
- `https://yourdomain.com/document.pdf` - Any file type

### Image Transformations
Add query parameters for image processing:

**Predefined Sizes:**
- `?size=thumb` - Thumbnail (150x150, cropped)
- `?size=small` - Small (300x300 max, scaled)
- `?size=medium` - Medium (600x600 max, scaled)
- `?size=large` - Large (1200x1200 max, scaled)
- `?size=800x600` - Custom dimensions

**Advanced Parameters:**
- `?width=400` - Specific width
- `?height=300` - Specific height  
- `?quality=80` - JPEG quality (1-100, default: 85)
- `?format=webp` - Convert format (webp, avif, jpeg, png)

**Examples:**
```
https://yourdomain.com/photo.jpg?size=medium
https://yourdomain.com/photo.jpg?width=500&quality=90
https://yourdomain.com/photo.jpg?size=thumb&format=webp
https://yourdomain.com/photo.jpg?size=800x600&quality=95&format=webp
```

> **Note:** Image transformation parameters are parsed and prepared for processing. To enable actual image resizing, you'll need to integrate with Cloudflare Images or implement server-side image processing. Currently, the original image is served with transformation metadata in headers.

### Admin Panel
1. Go to `https://yourdomain.com/manage`
2. Enter your admin password
3. Upload new files or manage existing ones

### Environment Variables

- `ADMIN_PASSWORD` - Password for the admin panel (set in `.env` file)

## Security

- Admin password is stored securely in environment variables
- No sensitive data is exposed in the codebase
- File access is controlled through Cloudflare R2 permissions

## Tech Stack

- **React Router v7** - Full-stack React framework
- **Cloudflare Workers** - Edge runtime
- **Cloudflare R2** - Object storage
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Bun** - JavaScript runtime and package manager

A modern, production-ready template for building full-stack React applications using React Router.

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Previewing the Production Build

Preview the production build locally:

```bash
npm run preview
```

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

Deployment is done using the Wrangler CLI.

To build and deploy directly to production:

```sh
npm run deploy
```

To deploy a preview URL:

```sh
npx wrangler versions upload
```

You can then promote a version to production after verification or roll it out progressively.

```sh
npx wrangler versions deploy
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
