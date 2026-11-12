# TailorMe

**AI-Powered Custom Fashion Design & Tailoring Marketplace**

TailorMe is a web-based fashion design and tailoring marketplace that aims to connect customers with professional tailors through a digital platform.

The project focuses on personalized clothing design, tailor discovery, measurement management, tailoring requests, and communication between customers and tailors.

> **Development Status:** In Progress 🚧
>
> TailorMe is currently under active development. Some functionalities are implemented, while others are being developed, tested, or planned for future releases.

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS, CSS |
| Backend Services | Supabase |
| Database | PostgreSQL (Supabase) |
| Authentication | Supabase Auth, Google OAuth |
| File Storage | Supabase Storage |
| Routing | React Router |
| Testing | Vitest |
| Version Control | Git & GitHub |

## Features

TailorMe is being developed with the following functionalities:

### Customer Features
- Customer registration and login
- Browse and discover tailors
- Explore tailor shop profiles
- Interactive garment design and customization
- Save and manage body measurements
- Submit tailoring requests
- Communicate with tailors
- Track tailoring progress

### Tailor Features
- Tailor registration and application process
- Tailor dashboard
- Manage shop profiles
- Receive and manage tailoring requests
- Provide quotations
- Communicate with customers
- Update tailoring progress

### Admin Features
- Admin dashboard
- Review tailor applications
- Approve or reject tailor registrations
- Manage platform access based on user roles

### Planned Enhancements
- AI-assisted fashion design recommendations
- Improved personalized styling assistance
- Enhanced design visualization
- Additional marketplace and user experience improvements

**Note:** The features listed above describe the project's development scope and do not imply that every functionality is fully completed or production-ready.

## Getting Started

Follow these instructions to set up and run TailorMe locally.

### Prerequisites

Before getting started, ensure you have:

- Node.js and npm installed
- Git installed
- A Supabase project for backend services

### 1. Clone the Repository

```bash
git clone https://github.com/Nilakshana23/TailorMe.git
cd TailorMe
```

### 2. Install Dependencies

Navigate to the React application directory:

```bash
cd tailorme
npm install
```

### 3. Configure Environment Variables

Create a `.env` file inside the `tailorme` directory using `.env.example` as a reference.

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Ensure the environment variable names match those used in `src/lib/supabase.ts`.

Never commit private credentials, service-role keys, or secret keys to GitHub.

### 4. Configure Supabase

TailorMe uses Supabase for authentication, PostgreSQL database operations, and file storage.

1. Create a Supabase project.
2. Apply the required SQL migrations from `supabase/migrations/` in the intended order.
3. Configure the required storage buckets and access policies.
4. Enable the required authentication providers.
5. Configure authentication redirect URLs.
6. Review `supabase/README.md` and the relevant feature-specific setup documentation.

Some application functionalities require additional database configuration and testing before they can operate correctly.

### 5. Run the Development Server

```bash
npm run dev
```

Open the local URL displayed in the terminal, typically:

http://localhost:5173

### 6. Build for Production

```bash
npm run build
```

### 7. Run Tests

Run the test command configured in `tailorme/package.json`.

### 8. Project Structure

```text
TailorMe/
├── supabase/
│   ├── migrations/
│   ├── tests/
│   └── README.md
│
├── tailorme/
│   ├── public/
│   ├── src/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
├── MVP_REVIEW.md
└── README.md
```

## Development Roadmap

- [x] Initialize React and TypeScript application
- [x] Set up Supabase integration
- [x] Implement authentication and role-based routing
- [x] Develop customer, tailor, and admin dashboard foundations
- [x] Implement tailor application workflow
- [x] Develop garment customization interface
- [x] Implement tailoring request and messaging workflows
- [ ] Complete end-to-end integration testing
- [ ] Validate all Supabase migrations and security policies
- [ ] Improve AI-assisted fashion design capabilities
- [ ] Perform production deployment and final verification

## Current Project Status

TailorMe is an ongoing software development project.

The repository contains frontend implementation, Supabase database migrations, automated tests, and technical documentation.

Although several core features have been implemented in code, complete production readiness, deployment, and live integration verification are still pending.

## License

No open-source license has been assigned to this project.