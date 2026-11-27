# Semantic Space Studio – Frontend

> Embedding Model with Vector Steering and Semantic Space Visualizer.
> **Tagline:** Explore. Steer. Understand.

This is the frontend client for **Semantic Space Studio**, initialized inside the repository on branch `feature/react-frontend`.

---

## 🛠 Tech Stack

- **Framework:** [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server:** [Vite 6](https://vite.dev/)
- **Styling:** [Tailwind CSS 3](https://tailwindcss.com/) with a dark AI research-lab visual theme
- **Routing:** [React Router DOM v6](https://reactrouter.com/)
- **HTTP Client:** [Axios](https://axios-http.com/)
- **Visualizations:** [Plotly.js](https://plotly.com/javascript/) & [react-plotly.js](https://github.com/plotly/react-plotly.js) (3D vector embeddings & projections)
- **Charts:** [Recharts](https://recharts.org/) (Model evaluation & drift metrics)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 📁 Directory Structure

```text
frontend/
│
├── public/                  # Static assets (favicons, svgs)
│
├── src/
│   ├── assets/              # Static media & images
│   ├── components/          # Reusable UI components
│   ├── layouts/             # App shell and page layout wrappers
│   ├── pages/               # Top-level view pages
│   ├── services/            # API client and endpoints (Axios)
│   │   └── api.ts           # Pre-configured Axios instance with VITE_API_BASE_URL
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript interfaces & types
│   │   └── api.ts           # Contract-ready API response types foundation
│   ├── utils/               # Helper utilities & math formatting
│   ├── styles/              # Global styles & theme overrides
│   │
│   ├── App.tsx              # Minimal welcome screen & environment verifier
│   ├── main.tsx             # Application entry point
│   └── index.css            # Tailwind directives & dark theme base styles
│
├── .env.example             # Environment template (VITE_API_BASE_URL)
├── .env                     # Local environment settings
├── .gitignore               # Frontend gitignore rules
├── index.html               # Main HTML document template
├── package.json             # Dependencies and project scripts
├── tsconfig.json            # TypeScript compiler configuration
├── vite.config.ts           # Vite bundler configuration
└── README.md                # Frontend documentation
```

---

## 🚀 Getting Started

### 1. Install Dependencies
From the `frontend/` directory:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (already done by default):
```bash
cp .env.example .env
```
Default configuration:
```env
VITE_API_BASE_URL=http://localhost:8000
```

### 3. Start Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4. Build for Production
```bash
npm run build
```
Build output will be generated in `frontend/dist/`.

---

## 📌 Architecture Notes & Boundaries

- **API Layer:** `src/services/api.ts` exports `apiClient` pointing to `VITE_API_BASE_URL`.
- **Contracts:** Once `contracts/api-contract.md` is finalized with the backend team, full request/response schemas will be added to `src/types/api.ts`.
- **Upcoming Modules:**
  - Semantic Space 3D Explorer
  - Vector Steering Lab
  - Model Comparison Lab
  - Evaluation & Benchmarking Dashboard
