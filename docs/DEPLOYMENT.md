# Clean Kadal — Cloud Deployment Guide

This guide details how to deploy the Clean Kadal research platform to production using **Render** (Backend) and **Vercel** (Frontend).

---

## 1. Backend Deployment (Render)

Render provides native Python hosting with automatic builds and public HTTPS endpoints.

### Step-by-Step Instructions:
1. Push your repository to GitHub.
2. Log into [Render.com](https://render.com) and click **New + > Web Service**.
3. Select your GitHub repository.
4. Set the following configuration:
   - **Name**: `clean-kadal-backend`
   - **Root Directory**: `backend` (or leave root and specify path)
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
5. Click **Create Web Service**.
6. Once deployed, note your service URL:
   `https://clean-kadal-backend.onrender.com`
7. Test the health endpoint:
   `https://clean-kadal-backend.onrender.com/health`

---

## 2. Frontend Deployment (Vercel)

Vercel provides edge hosting for Vite/React applications.

### Step-by-Step Instructions:
1. Log into [Vercel.com](https://vercel.com) and click **Add New... > Project**.
2. Select your GitHub repository.
3. In the project configuration:
   - **Root Directory**: Click "Edit" and choose `frontend`.
   - **Framework Preset**: `Vite` (automatically detected).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Deploy the Render backend first and copy its actual public HTTPS service URL. Confirm that
   `<backend-url>/health` returns a healthy response. The example hostname above is only a
   placeholder; use the URL Render assigned to your service.
5. In the Vercel project's **Settings > Environment Variables**, set:
   - Key: `VITE_API_BASE_URL`
   - Value: the actual public HTTPS backend URL, with no `/health` suffix
   - Environments: Production and Preview (as needed)
6. Redeploy the Vercel project after saving the variable. Vite embeds this value at build time.
   Production builds deliberately do not fall back to `localhost`; a browser's `localhost` is
   the visitor's own computer, not the Render service.
7. The site will be available at `https://clean-kadal.vercel.app` once the deployment finishes.

---

## 3. Camera Access on Deployed Sites

- The browser Webcam API requires a secure origin (**HTTPS**), which both Vercel and Render supply out of the box.
- The web page accesses the camera of the **person viewing the site in their browser**, not the computer that deployed the server.
- Explicit browser permission will be requested when clicking **Start Camera**.
- When multiple cameras are available, use the **Camera** selector beside the controls to switch
  from the laptop camera to the connected USB webcam. Device names may appear only after camera
  permission has been granted.
