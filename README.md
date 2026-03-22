# fino

> Phase 2 — Developer Setup Guide

---

## 📋 Project Overview

| | |
|---|---|
| **Repo** | `github.com/Pauggerz/fino` |
| **Stack** | Expo (React Native) + TypeScript + PostgreSQL (Railway) |
| **Node Version** | v20 LTS (required) |
| **Expo SDK** | 54 |

---

## 1. 🐙 GitHub Repository

### Repository Details
- Visibility: **Private**
- Branch protection on `main` — all changes require a pull request
- Minimum **1 approval** required before merging

### Team Roles

| Team Member | GitHub Role | Access Level |
|---|---|---|
| Christian | Admin | Full repository control |
| Backend Dev | Write | Push code, create branches |
| Frontend Dev | Write | Push code, create branches |
| Designer | Read | View and clone repository |

### Clone the Repository

```bash
git clone https://github.com/Pauggerz/fino.git
cd fino
```

---

## 2. 📱 Expo Project Setup

### Prerequisites
- **Node.js v20 LTS** — download from [nodejs.org](https://nodejs.org)
- **npm** (comes with Node)
- **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

### Install Dependencies

```bash
npm install
```

### Run the App

```bash
npx expo start
```

Scan the QR code with your phone using the Expo Go app. The default screen should appear.

### ⚠️ Expo SDK Version Note
This project uses **Expo SDK 54**. If you encounter version mismatch errors, run:

```bash
npx expo install --fix
```

---

## 3. 🧹 ESLint + Prettier

This project enforces **Airbnb coding standards** with Prettier formatting. A Husky pre-commit hook **blocks commits that fail linting**.

### Run Lint Check

```bash
npm run lint
```

### Config Files

| File | Purpose |
|---|---|
| `.eslintrc.js` | ESLint rules (Airbnb + React Native overrides) |
| `.prettierrc` | Prettier formatting rules |
| `.husky/pre-commit` | Blocks commit if lint fails |

### Prettier Settings
- Single quotes
- Semicolons
- 2-space indent
- Trailing commas (ES5)

---

## 4. 🔐 Environment Variables

> **Never commit real credentials.** The `.env.example` file shows which variables are needed. Get the real values from **Christian** via a secure channel.

### Setup Steps

1. Copy the template file:
```bash
cp .env.example .env.local
```

2. Fill in the real values (received securely from Christian)

3. **Never push `.env.local`** — it is already in `.gitignore`

### Required Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `CLOUDINARY_URL` | Cloudinary media upload URL |
| `VISION_API_KEY` | Vision API key for image processing |
| `RAILWAY_DB_URL` | PostgreSQL connection string (public URL) |

### ⚠️ Security Rules
- **NEVER** share `.env.local` over Slack or email in plaintext
- **NEVER** commit `.env.local` to GitHub
- Share real values via encrypted message or password manager only

---

## 5. 🗄️ Railway Database

The project uses a **PostgreSQL** database hosted on Railway. The database is already provisioned — you just need the connection string.

### Get the Connection String
- Ask **Christian** for the `RAILWAY_DB_URL` value
- Add it to your `.env.local` file

### Test Your Connection

Install `psql` (comes with PostgreSQL — [postgresql.org/download](https://www.postgresql.org/download)), then run:

```bash
psql $RAILWAY_DB_URL
```

If you see a `railway=#` prompt, you are connected successfully. Type `\q` to exit.

### Windows Users — Add psql to PATH
After installing PostgreSQL, add this to your system PATH:

```
C:\Program Files\PostgreSQL\18\bin
```

Then restart your terminal.

---

## ⚡ Quick Start Checklist

Run through this list to verify your setup is complete:

- [ ] Cloned the repo from GitHub
- [ ] Ran `npm install` successfully
- [ ] App runs on phone via Expo Go
- [ ] `npm run lint` passes with 0 errors
- [ ] `.env.local` created with all 5 variables filled in
- [ ] `psql` connects to Railway database

---

> 💬 Questions? Reach out to **Christian** (Admin) on the team channel.
