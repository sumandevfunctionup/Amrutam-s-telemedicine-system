# Amrutam Telemedicine System - Backend API

Robust, scalable backend API service for Amrutam's Telemedicine platform, built with Node.js, Express.js, Knex query builder, PostgreSQL, and Swagger (OpenAPI 3.0).

---

## 🛠 Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database & Query Builder**: [Knex.js](https://knexjs.org/) with [PostgreSQL (`pg`)](https://node-postgres.com/)
- **API Documentation**: [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express) & [Swagger JSDoc](https://github.com/Surnet/swagger-jsdoc)
- **Security & Utilities**: Helmet, CORS, Morgan, Dotenv

---

## 📁 Project Structure

```text
Amrutam-s-telemedicine-system/
├── auth/                      # Middleware functions (auth, authorization, errors, 404)
│   ├── index.js
│   └── middleware.js
├── controller/                # Request handling & controllers
│   └── healthController.js
├── db/                        # Database connection, migrations & seeds
│   ├── db.js
│   ├── migrations/
│   └── seeds/
├── helper/                    # Utility & helper functions
│   ├── apiResponse.js
│   └── swagger.js
├── router/                    # Express routing layer
│   ├── indexRouter.js         # Central API router (/api/v1)
│   └── healthRouter.js        # Health and /db-test routes
├── index.js                   # Application entry point & HTTP server
├── .env.example               # Environment variables template
├── .env                       # Local environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and set your PostgreSQL connection string:
```bash
cp .env.example .env
```

```env
PORT=3000
NODE_ENV=development
DB_CONNECTION_STRING=postgresql://user:password@host:5432/database?sslmode=require
```

### 3. Database Migrations & Seeds
```bash
# Check migration status
npx knex migrate:status

# Run pending migrations
npm run migrate

# Rollback last migration batch
npm run migrate:rollback

# Create a new migration
npm run migrate:make -- migration_name

# Run seeds
npm run seed
```

### 4. Running the Application

**Development Mode** (with auto-reload):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

---

## 📚 API Documentation (Swagger)

Interactive Swagger UI:
- **Swagger UI**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **OpenAPI JSON**: [http://localhost:3000/api-docs.json](http://localhost:3000/api-docs.json)

---

## 🩺 System Endpoints

- **Welcome**: `GET /`
- **Health Check**: `GET /api/v1/health`
- **PostgreSQL Test**: `GET /api/v1/db-test`
