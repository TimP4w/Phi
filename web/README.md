# Phi Web Frontend

This is the frontend for the Phi project, built with React, TypeScript, and Vite. It provides the user interface for interacting with the Phi backend and visualizing Kubernetes resources in real time.

## Requirements

- Node.js (>=18)
- Yarn

## Getting Started

### 1. Clone the repository

```sh
git clone https://github.com/timp4w/phi.git
cd phi/web
```

### 2. Development Environment (Recommended)

If you use [Nix flakes](https://nixos.wiki/wiki/Flakes):

```sh
nix develop
```

This provides Node.js, Yarn, and other dependencies.

### 3. Install dependencies

```sh
yarn install
```


### 4. Set the `./web/.env` file values

```
VITE_VERSION=local
VITE_URL=http://localhost:8080
VITE_WS=http://localhost:8080/ws
```


### 5. Run the development server

```sh
yarn dev
```

The app will be available at [http://localhost:5173](http://localhost:5173) by default.

### 6. Build for production

```sh
yarn build
```

### 7. Lint and format

```sh
yarn lint
```

## Project Structure

- `src/` — Main source code for the frontend
  - `core/` — Core application logic, organized by domain:
    - `fluxTree/` — Flux tree models, services, and use cases
    - `http/` — HTTP services
    - `realtime/` — Real-time models and services
    - `resource/` — Resource-related logic
    - `shared/` — Shared utilities and types
    - `utils/` — General-purpose utility functions
  - `infrastructure/` — Backend integration utilities
  - `ui/` — UI components and views
    - `assets/` — Static assets (images, icons, etc.)
    - `components/` — Reusable React components
    - `routes/` — Application routes
    - `shared/` — Shared UI components
    - `views/` — Page-level views
  - `index.scss` — Global styles
  - `main.tsx` — Application entrypoint
- `public/` — Static files served at the root
- `vite.config.ts` — Vite configuration
- `tsconfig*.json` — TypeScript configuration
- `eslint.config.js` — ESLint configuration
- `tailwind.config.js` — Tailwind CSS configuration
- `postcss.config.js` — PostCSS configuration

## API Integration

The frontend communicates with the backend via REST and WebSocket APIs.
