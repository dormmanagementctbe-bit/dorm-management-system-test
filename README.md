# Dorm Management System – Backend

## Overview

This repository contains the backend API for the Dorm Management System.
It handles business logic, authentication, data storage, and system integration.

## Purpose

The backend is responsible for:

- User authentication and authorization
- Dorm room allocation logic
- Student and admin data management
- API endpoints for frontend interaction
- Database operations

## Tech Stack

- Node.js
- Express
- PostgreSQL
- REST API

## Branching Strategy

We follow a controlled workflow:

- `main` → Production
- `dev` → Integration & testing
- `feature/*` → Developer branches

### Workflow

1. Create branch from `dev`
2. Implement feature
3. Push branch
4. Open PR → `dev`
5. Requires **2 approvals**

Release flow:
dev → main

## Setup Instructions

### 1. Clone repository

git clone <repo-url>

### 2. Navigate to project

cd backend

### 3. Install dependencies

npm install

### 4. Start development server

npm run dev

## Environment Variables

Create `.env` file:

PORT=3000
DATABASE_URL=your_database_url
JWT_SECRET=your_secret_key

## API Structure

Base URL:
/api

Example endpoints:
/api/auth
/api/users
/api/rooms

## Contribution Guidelines

- Never push directly to `main` or `dev`
- Use feature branches
- Follow clean code practices
- Document new endpoints

## Status

🚧 Initial development stage

## License

This project is developed for academic and institutional use.
