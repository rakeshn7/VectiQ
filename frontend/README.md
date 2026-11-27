# Semantic Space Studio – Frontend

> Embedding Model with Vector Steering and Semantic Space Visualizer.  
> **Tagline:** Explore. Steer. Understand.

Complete React + TypeScript frontend for **VectiQ – Semantic Space Studio**, integrated strictly against [`contracts/api-contract.md`](../contracts/api-contract.md).

---

## 🛠 Tech Stack

- **Framework:** [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Bundler & Dev Server:** [Vite 6](https://vite.dev/)
- **Styling:** [Tailwind CSS 3](https://tailwindcss.com/) with dark AI research-lab design tokens
- **Routing:** [React Router DOM v6](https://reactrouter.com/)
- **HTTP Client:** [Axios](https://axios-http.com/)
- **Visualizations:** [Plotly.js](https://plotly.com/javascript/) & [react-plotly.js](https://github.com/plotly/react-plotly.js) (2D/3D semantic projections & evaluation charts)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 📁 Directory Structure

```text
frontend/
├── public/                     # Static assets (vite.svg)
├── src/
│   ├── assets/                 # Static media
│   ├── components/
│   │   ├── charts/             # PlotlyChart, SemanticSpacePlot, EvaluationCharts, NeighborSimilarityChart
│   │   ├── navigation/         # Responsive Sidebar & Header
│   │   ├── ui/                 # Reusable design system (Button, Card, Input, Slider, Select, Tooltip, Badge, ErrorAlert, EmptyState, LoadingState)
│   │   ├── ErrorBoundary.tsx   # React ErrorBoundary
│   │   ├── NeighborList.tsx    # Nearest-neighbor breakdown list
│   │   └── ViewModeToggle.tsx  # 2D / 3D projection switcher
│   ├── context/
│   │   └── StudioContext.tsx   # Shared API connection & experiment session state
│   ├── hooks/
│   │   └── useStudio.ts        # StudioContext hook
│   ├── layouts/
│   │   └── AppLayout.tsx       # Integrated sidebar + header shell
│   ├── pages/
│   │   ├── OverviewPage.tsx
│   │   ├── SemanticExplorerPage.tsx
│   │   ├── VectorSteeringPage.tsx
│   │   ├── ComparisonLabPage.tsx
│   │   └── EvaluationDashboardPage.tsx
│   ├── services/
│   │   ├── api.ts              # Centralized Axios client & error parser
│   │   └── vectiqService.ts    # Contract endpoints (health, config, semantic-map, steer, evaluate)
│   ├── styles/
│   │   └── theme.css           # Global CSS design tokens
│   ├── types/
│   │   └── api.ts              # Canonical TypeScript types matching contracts/api-contract.md
│   ├── utils/
│   │   ├── cn.ts               # Tailwind class merge helper
│   │   └── format.ts           # Display formatters & canonical contract defaults
│   ├── App.tsx                 # Route definitions
│   ├── main.tsx                # App mount with BrowserRouter
│   └── index.css               # Tailwind layers & studio component utilities
├── .env.example                # VITE_API_BASE_URL=http://localhost:8000
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 Running Locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Production Build

```bash
cd frontend
npm run build
```

---

## 🔌 Integrated Contract Endpoints

All endpoints are consumed from `VITE_API_BASE_URL` (default `http://localhost:8000`):

- `GET /api/v1/health`
- `GET /api/v1/config`
- `GET /api/v1/semantic-map`
- `POST /api/v1/steer`
- `POST /api/v1/evaluate`
