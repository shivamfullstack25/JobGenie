# JobGenie-Frontend

This is the React + Tailwind CSS frontend for JobGenie.

## Setup

1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

2. Copy `.env.example` to `.env` and fill in your environment variables.

3. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Build

To build for production:
```bash
npm run build
# or
yarn build
```

## Environment Variables
See `.env.example` for required variables (API base URL, Firebase config, etc).

## Docker
To build and run with Docker:
```bash
docker build -t jobgenie-frontend .
docker run -p 3000:3000 jobgenie-frontend
``` 